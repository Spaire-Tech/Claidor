"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const manualCredentialCaptureProtocol_1 = require("./manualCredentialCaptureProtocol");
const USERNAME_HINT_PATTERN = /(?:user(?:name)?|login|email|mail|account|identifier|userid|user-id)/i;
const RECENT_CAPTURE_WINDOW_MS = 1_500;
const PAGE_STATE_DEBOUNCE_MS = 150;
const recentForms = new WeakMap();
let pageStateTimer;
let lastPasswordFieldState;
const isTextLikeInput = (input) => {
    const type = input.type.toLowerCase();
    return type === 'text' || type === 'email' || type === 'tel' || type === '';
};
const findUsername = (form, passwordInput) => {
    const candidates = Array.from(form.querySelectorAll('input'))
        .filter(input => !input.disabled && !input.readOnly && isTextLikeInput(input));
    const beforePassword = candidates.filter(input => (input.compareDocumentPosition(passwordInput) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    const pool = beforePassword.length > 0 ? beforePassword : candidates;
    const preferred = pool.find(input => /(?:^|\s)(?:username|email)(?:\s|$)/i.test(input.autocomplete))
        ?? pool.find(input => input.type.toLowerCase() === 'email')
        ?? pool.find(input => USERNAME_HINT_PATTERN.test([
            input.name,
            input.id,
            input.placeholder,
            input.getAttribute('aria-label') ?? '',
        ].join(' ')))
        ?? pool.at(-1);
    return preferred?.value.trim() ?? '';
};
const captureForm = (form) => {
    if (!form)
        return;
    const now = Date.now();
    const lastCapturedAt = recentForms.get(form) ?? 0;
    if (now - lastCapturedAt < RECENT_CAPTURE_WINDOW_MS)
        return;
    const passwordInputs = Array.from(form.querySelectorAll('input[type="password"]'))
        .filter(input => !input.disabled && !input.readOnly && input.value.length > 0);
    if (passwordInputs.length === 0)
        return;
    const passwords = passwordInputs.map(input => input.value);
    const password = passwords[0];
    if (!password || (passwords.length > 1 && passwords.some(value => value !== password))) {
        return;
    }
    const username = findUsername(form, passwordInputs[0]);
    if (!username)
        return;
    recentForms.set(form, now);
    const event = {
        type: manualCredentialCaptureProtocol_1.ManualCredentialCaptureEventType.Submitted,
        username,
        password,
        formKind: passwordInputs.length > 1
            ? manualCredentialCaptureProtocol_1.ManualCredentialFormKind.Registration
            : manualCredentialCaptureProtocol_1.ManualCredentialFormKind.Login,
    };
    electron_1.ipcRenderer.send(manualCredentialCaptureProtocol_1.ManualCredentialCaptureChannel.Event, event);
};
const isVisiblePasswordInput = (input) => {
    if (input.disabled || input.hidden || input.getAttribute('aria-hidden') === 'true')
        return false;
    const style = window.getComputedStyle(input);
    return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && input.getClientRects().length > 0;
};
const hasPasswordField = () => Array.from(document.querySelectorAll('input[type="password"]')).some(isVisiblePasswordInput);
const emitPageState = () => {
    pageStateTimer = undefined;
    const current = hasPasswordField();
    if (current === lastPasswordFieldState)
        return;
    lastPasswordFieldState = current;
    const event = {
        type: manualCredentialCaptureProtocol_1.ManualCredentialCaptureEventType.PageState,
        hasPasswordField: current,
    };
    electron_1.ipcRenderer.send(manualCredentialCaptureProtocol_1.ManualCredentialCaptureChannel.Event, event);
};
const schedulePageState = () => {
    if (pageStateTimer)
        clearTimeout(pageStateTimer);
    pageStateTimer = setTimeout(emitPageState, PAGE_STATE_DEBOUNCE_MS);
};
window.addEventListener('submit', event => {
    captureForm(event.target instanceof HTMLFormElement ? event.target : null);
}, true);
window.addEventListener('click', event => {
    const target = event.target instanceof Element
        ? event.target.closest('button, input')
        : null;
    if (!target)
        return;
    const type = target instanceof HTMLButtonElement
        ? (target.getAttribute('type') ?? 'submit').toLowerCase()
        : target.type.toLowerCase();
    if (type === 'submit' || type === 'image')
        captureForm(target.form);
}, true);
window.addEventListener('keydown', event => {
    if (event.key !== 'Enter')
        return;
    const target = event.target;
    captureForm(target instanceof HTMLInputElement ? target.form : null);
}, true);
const startPageStateObserver = () => {
    schedulePageState();
    const observer = new MutationObserver(schedulePageState);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['type', 'disabled', 'hidden', 'aria-hidden', 'class', 'style'],
    });
};
if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', startPageStateObserver, { once: true });
}
else {
    startPageStateObserver();
}
window.addEventListener('pageshow', schedulePageState);
//# sourceMappingURL=manualCredentialCapturePreload.js.map