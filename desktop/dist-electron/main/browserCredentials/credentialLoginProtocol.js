"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserCredentialGuestResultKind = exports.BrowserCredentialGuestCommandType = exports.BrowserCredentialGuestChannel = void 0;
exports.BrowserCredentialGuestChannel = {
    Command: 'lobster:browser-credential:command',
    Result: 'lobster:browser-credential:result',
};
exports.BrowserCredentialGuestCommandType = {
    Inspect: 'inspect',
    FillAndSubmit: 'fill-and-submit',
    ClearPasswordFields: 'clear-password-fields',
};
exports.BrowserCredentialGuestResultKind = {
    PasswordForm: 'password-form',
    UsernameForm: 'username-form',
    MfaForm: 'mfa-form',
    Captcha: 'captcha',
    NoLoginForm: 'no-login-form',
    SubmittedUsername: 'submitted-username',
    SubmittedPassword: 'submitted-password',
    Cleared: 'cleared',
    Failed: 'failed',
};
//# sourceMappingURL=credentialLoginProtocol.js.map