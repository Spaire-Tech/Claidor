"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBrowserCredentialLogin = void 0;
const crypto_1 = __importDefault(require("crypto"));
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const constants_1 = require("../../shared/browserCredentials/constants");
const browserCredentialService_1 = require("./browserCredentialService");
const credentialLoginProtocol_1 = require("./credentialLoginProtocol");
const FORM_DISCOVERY_TIMEOUT_MS = 8_000;
const LOGIN_TRANSITION_TIMEOUT_MS = 12_000;
const GUEST_COMMAND_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 500;
const delay = (milliseconds) => new Promise(resolve => {
    setTimeout(resolve, milliseconds);
});
const readOrigin = (value) => {
    try {
        return new URL(value).origin;
    }
    catch {
        return undefined;
    }
};
const resolveCredentialPreloadPath = () => {
    const candidates = [
        path_1.default.join(__dirname, '..', 'agentBrowserCredentialPreload.js'),
        path_1.default.join(__dirname, 'agentBrowserCredentialPreload.js'),
    ];
    return candidates.find(candidate => fs_1.default.existsSync(candidate)) ?? candidates[1];
};
const outcomeMessage = (outcome) => {
    switch (outcome) {
        case constants_1.BrowserCredentialLoginOutcome.Authenticated:
            return 'The saved credential was submitted and the shared browser session appears to be signed in.';
        case constants_1.BrowserCredentialLoginOutcome.Submitted:
            return 'The saved credential was submitted. Inspect the page to confirm whether sign-in completed.';
        case constants_1.BrowserCredentialLoginOutcome.NeedsMfa:
            return 'The website requires a verification code or another authentication factor before sign-in can continue.';
        case constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha:
            return 'The website requires a CAPTCHA before sign-in can continue.';
        case constants_1.BrowserCredentialLoginOutcome.Denied:
            return 'The user did not allow the Agent to use a saved credential.';
        case constants_1.BrowserCredentialLoginOutcome.Failed:
            return 'Caisra could not complete the saved-credential sign-in.';
    }
};
class AgentBrowserCredentialLogin {
    deps;
    secureView = null;
    active = false;
    crossOriginNavigationBlocked = false;
    constructor(deps) {
        this.deps = deps;
    }
    get isActive() {
        return this.active;
    }
    async login(request) {
        if (this.active) {
            return this.failedResult(request.url, 'Another saved-credential sign-in is already in progress.');
        }
        let origin;
        try {
            origin = (0, browserCredentialService_1.normalizeBrowserCredentialOrigin)(request.url);
        }
        catch (error) {
            return this.failedResult(request.url, error instanceof Error ? error.message : 'The current page cannot use saved credentials.');
        }
        if (!this.deps.credentialService.getAvailability().available) {
            return this.failedResult(origin, 'Secure browser credential storage is unavailable on this device.');
        }
        const candidates = this.deps.credentialService.list(origin);
        if (candidates.length === 0) {
            return this.failedResult(origin, 'No saved credential matches the current website.');
        }
        this.active = true;
        this.setState({ status: constants_1.BrowserCredentialLoginStatus.AwaitingApproval, origin });
        try {
            const approval = await this.deps.approvalService.requestApproval({
                sessionId: request.sessionId,
                sessionKey: this.deps.resolveSessionKey(request.sessionId),
                origin,
                candidates,
                accountHint: request.accountHint,
                reason: request.reason,
                useMode: this.deps.getUseMode(),
            });
            if (!approval.approved || !approval.credential) {
                return this.finishResult(constants_1.BrowserCredentialLoginOutcome.Denied, origin);
            }
            const secret = this.deps.credentialService.getSecret(approval.credential.id, origin);
            this.setState({
                status: constants_1.BrowserCredentialLoginStatus.SigningIn,
                origin,
                username: secret.summary.username,
            });
            const outcome = await this.runSecureLogin(request.url, origin, secret);
            if (outcome === constants_1.BrowserCredentialLoginOutcome.Authenticated
                || outcome === constants_1.BrowserCredentialLoginOutcome.Submitted
                || outcome === constants_1.BrowserCredentialLoginOutcome.NeedsMfa) {
                this.deps.credentialService.markUsed(secret.summary.id);
                this.deps.browserSession.flushStorageData();
                await this.deps.browserSession.cookies.flushStore();
            }
            return this.finishResult(outcome, origin, secret.summary.username);
        }
        catch (error) {
            return this.failedResult(origin, error instanceof Error ? error.message : 'Saved-credential sign-in failed.');
        }
        finally {
            await this.closeSecureView();
            this.active = false;
        }
    }
    async dispose() {
        await this.closeSecureView();
        this.active = false;
    }
    async runSecureLogin(url, expectedOrigin, secret) {
        const view = this.createSecureView(expectedOrigin);
        this.secureView = view;
        this.deps.onViewChanged(view);
        await view.webContents.loadURL(url);
        this.assertNoCrossOriginNavigation();
        let inspection = await this.waitForLoginForm(view.webContents);
        this.assertNoCrossOriginNavigation();
        if (inspection.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha) {
            return constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha;
        }
        if (inspection.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm) {
            return constants_1.BrowserCredentialLoginOutcome.NeedsMfa;
        }
        if (inspection.kind !== credentialLoginProtocol_1.BrowserCredentialGuestResultKind.PasswordForm
            && inspection.kind !== credentialLoginProtocol_1.BrowserCredentialGuestResultKind.UsernameForm) {
            throw new Error('No supported username or password form was found on the current page.');
        }
        let submission = await this.sendGuestCommand(view.webContents, {
            requestId: crypto_1.default.randomUUID(),
            type: credentialLoginProtocol_1.BrowserCredentialGuestCommandType.FillAndSubmit,
            username: secret.summary.username,
            password: secret.password,
        });
        if (submission.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.SubmittedUsername) {
            inspection = await this.waitForLoginForm(view.webContents, LOGIN_TRANSITION_TIMEOUT_MS, credentialLoginProtocol_1.BrowserCredentialGuestResultKind.UsernameForm);
            this.assertNoCrossOriginNavigation();
            if (inspection.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha) {
                return constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha;
            }
            if (inspection.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm) {
                return constants_1.BrowserCredentialLoginOutcome.NeedsMfa;
            }
            if (inspection.kind !== credentialLoginProtocol_1.BrowserCredentialGuestResultKind.PasswordForm) {
                return inspection.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm
                    ? constants_1.BrowserCredentialLoginOutcome.Submitted
                    : constants_1.BrowserCredentialLoginOutcome.Failed;
            }
            submission = await this.sendGuestCommand(view.webContents, {
                requestId: crypto_1.default.randomUUID(),
                type: credentialLoginProtocol_1.BrowserCredentialGuestCommandType.FillAndSubmit,
                username: secret.summary.username,
                password: secret.password,
            });
        }
        if (submission.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha) {
            return constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha;
        }
        if (submission.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm) {
            return constants_1.BrowserCredentialLoginOutcome.NeedsMfa;
        }
        if (submission.kind !== credentialLoginProtocol_1.BrowserCredentialGuestResultKind.SubmittedPassword) {
            throw new Error(submission.message || 'The login form could not be submitted.');
        }
        const deadline = Date.now() + LOGIN_TRANSITION_TIMEOUT_MS;
        while (Date.now() < deadline) {
            await delay(POLL_INTERVAL_MS);
            this.assertNoCrossOriginNavigation();
            const currentOrigin = readOrigin(view.webContents.getURL());
            if (currentOrigin && currentOrigin !== expectedOrigin) {
                throw new Error('Cross-origin sign-in redirects are not supported yet.');
            }
            const current = await this.sendGuestCommand(view.webContents, {
                requestId: crypto_1.default.randomUUID(),
                type: credentialLoginProtocol_1.BrowserCredentialGuestCommandType.Inspect,
            }).catch(() => null);
            if (!current)
                continue;
            if (current.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.Captcha) {
                return constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha;
            }
            if (current.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.MfaForm) {
                return constants_1.BrowserCredentialLoginOutcome.NeedsMfa;
            }
            if (current.kind === credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm) {
                return constants_1.BrowserCredentialLoginOutcome.Authenticated;
            }
        }
        return constants_1.BrowserCredentialLoginOutcome.Submitted;
    }
    createSecureView(expectedOrigin) {
        this.crossOriginNavigationBlocked = false;
        const view = new electron_1.WebContentsView({
            webPreferences: {
                session: this.deps.browserSession,
                preload: this.deps.preloadPath ?? resolveCredentialPreloadPath(),
                nodeIntegration: false,
                nodeIntegrationInSubFrames: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                plugins: false,
                devTools: false,
                spellcheck: false,
                navigateOnDragDrop: false,
                backgroundThrottling: false,
            },
        });
        view.setBackgroundColor('#ffffff');
        const blockCrossOrigin = (event, targetUrl) => {
            const targetOrigin = readOrigin(targetUrl);
            if (targetOrigin && targetOrigin !== expectedOrigin) {
                this.crossOriginNavigationBlocked = true;
                event.preventDefault();
            }
        };
        view.webContents.on('will-navigate', blockCrossOrigin);
        view.webContents.on('will-redirect', blockCrossOrigin);
        view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        return view;
    }
    async waitForLoginForm(webContents, timeoutMs = FORM_DISCOVERY_TIMEOUT_MS, ignoredKind) {
        const deadline = Date.now() + timeoutMs;
        let lastResult = null;
        while (Date.now() < deadline) {
            if (webContents.isLoading()) {
                await delay(POLL_INTERVAL_MS);
                continue;
            }
            lastResult = await this.sendGuestCommand(webContents, {
                requestId: crypto_1.default.randomUUID(),
                type: credentialLoginProtocol_1.BrowserCredentialGuestCommandType.Inspect,
            }).catch(() => null);
            if (lastResult
                && lastResult.kind !== credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm
                && lastResult.kind !== ignoredKind) {
                return lastResult;
            }
            await delay(POLL_INTERVAL_MS);
        }
        return lastResult ?? {
            requestId: crypto_1.default.randomUUID(),
            kind: credentialLoginProtocol_1.BrowserCredentialGuestResultKind.NoLoginForm,
            url: webContents.getURL(),
        };
    }
    sendGuestCommand(webContents, command) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('The secure login page did not respond.'));
            }, GUEST_COMMAND_TIMEOUT_MS);
            const handler = (event, result) => {
                if (event.sender.id !== webContents.id || result?.requestId !== command.requestId)
                    return;
                cleanup();
                resolve(result);
            };
            const cleanup = () => {
                clearTimeout(timer);
                electron_1.ipcMain.removeListener(credentialLoginProtocol_1.BrowserCredentialGuestChannel.Result, handler);
            };
            electron_1.ipcMain.on(credentialLoginProtocol_1.BrowserCredentialGuestChannel.Result, handler);
            webContents.send(credentialLoginProtocol_1.BrowserCredentialGuestChannel.Command, command);
        });
    }
    async closeSecureView() {
        const view = this.secureView;
        if (!view)
            return;
        this.secureView = null;
        this.deps.onViewChanged(null);
        if (view.webContents.isDestroyed())
            return;
        try {
            await this.sendGuestCommand(view.webContents, {
                requestId: crypto_1.default.randomUUID(),
                type: credentialLoginProtocol_1.BrowserCredentialGuestCommandType.ClearPasswordFields,
            });
        }
        catch {
            // Navigation or shutdown can make the isolated preload unavailable.
        }
        view.webContents.close();
    }
    assertNoCrossOriginNavigation() {
        if (this.crossOriginNavigationBlocked) {
            throw new Error('Cross-origin sign-in redirects are not supported yet.');
        }
    }
    finishResult(outcome, origin, username) {
        const statusByOutcome = {
            [constants_1.BrowserCredentialLoginOutcome.Authenticated]: constants_1.BrowserCredentialLoginStatus.Authenticated,
            [constants_1.BrowserCredentialLoginOutcome.Submitted]: constants_1.BrowserCredentialLoginStatus.Submitted,
            [constants_1.BrowserCredentialLoginOutcome.NeedsMfa]: constants_1.BrowserCredentialLoginStatus.NeedsMfa,
            [constants_1.BrowserCredentialLoginOutcome.NeedsCaptcha]: constants_1.BrowserCredentialLoginStatus.NeedsCaptcha,
            [constants_1.BrowserCredentialLoginOutcome.Denied]: constants_1.BrowserCredentialLoginStatus.Denied,
            [constants_1.BrowserCredentialLoginOutcome.Failed]: constants_1.BrowserCredentialLoginStatus.Failed,
        };
        const message = outcomeMessage(outcome);
        this.setState({ status: statusByOutcome[outcome], origin, username, message });
        return { outcome, origin, username, message };
    }
    failedResult(urlOrOrigin, message) {
        const origin = readOrigin(urlOrOrigin) ?? urlOrOrigin;
        this.setState({ status: constants_1.BrowserCredentialLoginStatus.Failed, origin, message });
        return {
            outcome: constants_1.BrowserCredentialLoginOutcome.Failed,
            origin,
            message,
        };
    }
    setState(state) {
        this.deps.onStateChanged(state);
    }
}
exports.AgentBrowserCredentialLogin = AgentBrowserCredentialLogin;
//# sourceMappingURL=agentBrowserCredentialLogin.js.map