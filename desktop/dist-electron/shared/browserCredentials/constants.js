"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrowserCredentialMcpServer = exports.BrowserCredentialLoginTool = exports.BrowserCredentialLoginOutcome = exports.BrowserCredentialLoginStatus = exports.BrowserCredentialAvailabilityReason = exports.BrowserCredentialIpc = exports.BrowserCredentialSaveDecision = exports.BrowserCredentialSaveMode = exports.BrowserCredentialUseMode = void 0;
exports.BrowserCredentialUseMode = {
    AlwaysAsk: 'always-ask',
    OncePerTask: 'once-per-task',
    Disabled: 'disabled',
};
exports.BrowserCredentialSaveMode = {
    Ask: 'ask',
    Never: 'never',
};
exports.BrowserCredentialSaveDecision = {
    Save: 'save',
    Dismiss: 'dismiss',
};
exports.BrowserCredentialIpc = {
    GetAvailability: 'openclaw:browser:credentials:getAvailability',
    List: 'openclaw:browser:credentials:list',
    Save: 'openclaw:browser:credentials:save',
    Delete: 'openclaw:browser:credentials:delete',
};
exports.BrowserCredentialAvailabilityReason = {
    EncryptionUnavailable: 'encryption-unavailable',
    InsecureStorageBackend: 'insecure-storage-backend',
};
exports.BrowserCredentialLoginStatus = {
    AwaitingApproval: 'awaiting-approval',
    SigningIn: 'signing-in',
    Authenticated: 'authenticated',
    Submitted: 'submitted',
    NeedsMfa: 'needs-mfa',
    NeedsCaptcha: 'needs-captcha',
    Denied: 'denied',
    Failed: 'failed',
};
exports.BrowserCredentialLoginOutcome = {
    Authenticated: 'authenticated',
    Submitted: 'submitted',
    NeedsMfa: 'needs-mfa',
    NeedsCaptcha: 'needs-captcha',
    Denied: 'denied',
    Failed: 'failed',
};
exports.BrowserCredentialLoginTool = {
    Name: 'login_with_saved_credential',
};
exports.BrowserCredentialMcpServer = {
    Name: 'caisra-browser-credentials',
    ToolSetArgument: '--lobster-tool-set=credentials',
    ModelToolName: 'caisra-browser-credentials__login_with_saved_credential',
};
//# sourceMappingURL=constants.js.map