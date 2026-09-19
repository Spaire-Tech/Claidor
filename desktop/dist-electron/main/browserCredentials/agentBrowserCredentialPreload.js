"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const credentialLoginProtocol_1 = require("./credentialLoginProtocol");
const visibleInput = (input) => {
    if (input.disabled || input.readOnly)
        return false;
    const style = window.getComputedStyle(input);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')
        return false;
    const rect = input.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
};
const allInputs = () => Array.from(document.querySelectorAll('input'))
    .filter((element) => element instanceof HTMLInputElement)
    .filter(visibleInput);
const fieldText = (input) => [
    input.type,
    input.name,
    input.id,
    input.autocomplete,
    input.placeholder,
    input.getAttribute('aria-label') ?? '',
].join(' ').toLowerCase();
const findPasswordInput = (inputs) => (inputs.find(input => input.type.toLowerCase() === 'password'));
const usernameScore = (input) => {
    const type = input.type.toLowerCase();
    if (!['text', 'email', 'tel', ''].includes(type))
        return Number.NEGATIVE_INFINITY;
    const text = fieldText(input);
    let score = 0;
    if (input.autocomplete === 'username')
        score += 100;
    if (type === 'email')
        score += 50;
    if (/user|email|account|login|phone|mobile|用户名|邮箱|账号|手机号/.test(text))
        score += 30;
    if (/search|query|coupon|promo|验证码|verification|captcha|otp/.test(text))
        score -= 100;
    return score;
};
const findUsernameInput = (inputs) => (inputs
    .map(input => ({ input, score: usernameScore(input) }))
    .filter(item => Number.isFinite(item.score) && item.score >= 0)
    .sort((left, right) => right.score - left.score)[0]?.input);
const hasMfaInput = (inputs) => inputs.some(input => {
    const text = fieldText(input);
    return input.autocomplete === 'one-time-code'
        || /\botp\b|one.?time|two.?factor|2fa|verification.?code|authenticator|动态码|验证码/.test(text);
});
const hasCaptcha = () => Boolean(document.querySelector([
    'iframe[src*="recaptcha"]',
    'iframe[src*="hcaptcha"]',
    '[class*="recaptcha"]',
    '[class*="hcaptcha"]',
    '[id*="recaptcha"]',
    '[id*="hcaptcha"]',
].join(',')));
const inspect = () => {
    if (hasCaptcha())
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha;
    const inputs = allInputs();
    if (findPasswordInput(inputs))
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.PasswordForm;
    if (hasMfaInput(inputs))
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm;
    if (findUsernameInput(inputs))
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.UsernameForm;
    return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm;
};
const setInputValue = (input, value) => {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
};
const isSubmitButton = (element) => {
    if (element instanceof HTMLButtonElement)
        return element.type !== 'reset';
    return element instanceof HTMLInputElement && ['submit', 'button'].includes(element.type);
};
const clickBestSubmit = (input) => {
    const form = input.form;
    const candidates = Array.from((form ?? document).querySelectorAll('button, input[type="submit"]'))
        .filter(isSubmitButton)
        .filter(element => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return !element.disabled
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && rect.width > 0
            && rect.height > 0;
    });
    const preferred = candidates.find(element => /sign.?in|log.?in|continue|next|submit|登录|继续|下一步|确认/i.test(element instanceof HTMLInputElement
        ? element.value
        : `${element.textContent ?? ''} ${element.getAttribute('aria-label') ?? ''}`));
    const button = preferred ?? candidates[0];
    if (button) {
        button.click();
        return true;
    }
    if (form) {
        form.requestSubmit();
        return true;
    }
    return false;
};
const fillAndSubmit = (username, password) => {
    if (hasCaptcha())
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha;
    const inputs = allInputs();
    const passwordInput = findPasswordInput(inputs);
    const usernameInput = findUsernameInput(inputs);
    if (passwordInput) {
        if (usernameInput)
            setInputValue(usernameInput, username);
        setInputValue(passwordInput, password);
        passwordInput.focus();
        return clickBestSubmit(passwordInput)
            ? credentialLoginProtocol_1.BrowserCredentialGuestResultKind.SubmittedPassword
            : credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Failed;
    }
    if (hasMfaInput(inputs))
        return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm;
    if (usernameInput) {
        setInputValue(usernameInput, username);
        usernameInput.focus();
        return clickBestSubmit(usernameInput)
            ? credentialLoginProtocol_1.BrowserCredentialGuestResultKind.SubmittedUsername
            : credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Failed;
    }
    return credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm;
};
const clearPasswordFields = () => {
    for (const input of allInputs()) {
        if (input.type.toLowerCase() === 'password')
            setInputValue(input, '');
    }
};
electron_1.ipcRenderer.on(credentialLoginProtocol_1.BrowserCredentialGuestChannel.Command, (_event, command) => {
    let result;
    try {
        let kind;
        if (command.type === credentialLoginProtocol_1.BrowserCredentialGuestCommandType.Inspect) {
            kind = inspect();
        }
        else if (command.type === credentialLoginProtocol_1.BrowserCredentialGuestCommandType.FillAndSubmit) {
            kind = fillAndSubmit(command.username ?? '', command.password ?? '');
        }
        else {
            clearPasswordFields();
            kind = credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Cleared;
        }
        result = { requestId: command.requestId, kind, url: location.href };
    }
    catch (error) {
        result = {
            requestId: command.requestId,
            kind: credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Failed,
            url: location.href,
            message: error instanceof Error ? error.message : 'Failed to inspect the login page.',
        };
    }
    electron_1.ipcRenderer.send(credentialLoginProtocol_1.BrowserCredentialGuestChannel.Result, result);
});
//# sourceMappingURL=agentBrowserCredentialPreload.js.map