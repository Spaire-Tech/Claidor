"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualCredentialCaptureService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const constants_1 = require("../../shared/browserCredentials/constants");
const browserCredentialService_1 = require("./browserCredentialService");
const manualCredentialCaptureProtocol_1 = require("./manualCredentialCaptureProtocol");
const MAX_USERNAME_LENGTH = 512;
const MAX_PASSWORD_LENGTH = 8_192;
const CANDIDATE_TTL_MS = 30_000;
const PROMPT_TTL_MS = 120_000;
const SUCCESS_CONFIRMATION_MS = 1_200;
const armTimer = (callback, timeoutMs) => {
    const timer = setTimeout(callback, timeoutMs);
    timer.unref?.();
    return timer;
};
const normalizedPageUrl = (value) => {
    const parsed = new URL(value);
    (0, browserCredentialService_1.normalizeBrowserCredentialOrigin)(parsed.origin);
    return parsed.href;
};
class ManualCredentialCaptureService {
    deps;
    pendingByPage = new Map();
    activePrompt;
    constructor(deps) {
        this.deps = deps;
    }
    capture(submission) {
        if (!this.canCapture()) {
            this.clearPage(submission.pageId);
            return;
        }
        const username = submission.username.trim();
        if (!Number.isSafeInteger(submission.pageId)
            || submission.pageId <= 0
            || !username
            || username.length > MAX_USERNAME_LENGTH
            || !submission.password
            || submission.password.length > MAX_PASSWORD_LENGTH
            || !Object.values(manualCredentialCaptureProtocol_1.ManualCredentialFormKind).includes(submission.formKind)) {
            return;
        }
        let submittedUrl;
        let origin;
        try {
            submittedUrl = normalizedPageUrl(submission.url);
            origin = (0, browserCredentialService_1.normalizeBrowserCredentialOrigin)(submittedUrl);
        }
        catch {
            return;
        }
        this.clearPage(submission.pageId);
        const requestId = crypto_1.default.randomUUID();
        const pending = {
            requestId,
            pageId: submission.pageId,
            origin,
            submittedUrl,
            username,
            password: submission.password,
            formKind: submission.formKind,
            expiresTimer: armTimer(() => this.clearPending(requestId), CANDIDATE_TTL_MS),
        };
        this.pendingByPage.set(submission.pageId, pending);
    }
    observePageState(state) {
        const pending = this.pendingByPage.get(state.pageId);
        if (!pending)
            return;
        let currentUrl;
        try {
            currentUrl = normalizedPageUrl(state.url);
        }
        catch {
            this.clearPage(state.pageId);
            return;
        }
        const registrationRedirected = pending.formKind === manualCredentialCaptureProtocol_1.ManualCredentialFormKind.Registration
            && currentUrl !== pending.submittedUrl;
        const looksSuccessful = !state.hasPasswordField || registrationRedirected;
        if (!looksSuccessful) {
            if (pending.successTimer)
                clearTimeout(pending.successTimer);
            pending.successTimer = undefined;
            return;
        }
        if (pending.successTimer)
            return;
        pending.successTimer = armTimer(() => this.promotePending(pending.requestId), SUCCESS_CONFIRMATION_MS);
    }
    resolvePrompt(requestId, decision) {
        const active = this.activePrompt;
        if (!active || active.prompt.requestId !== requestId.trim()) {
            throw new Error('The browser credential save prompt is no longer available.');
        }
        if (!Object.values(constants_1.BrowserCredentialSaveDecision).includes(decision)) {
            throw new Error('A valid browser credential save decision is required.');
        }
        if (decision === constants_1.BrowserCredentialSaveDecision.Dismiss) {
            this.clearActivePrompt();
            return undefined;
        }
        try {
            return this.deps.credentialService.save({
                origin: active.prompt.origin,
                username: active.prompt.username,
                password: active.password,
            });
        }
        finally {
            this.clearActivePrompt();
        }
    }
    clearPage(pageId) {
        const pending = this.pendingByPage.get(pageId);
        if (pending)
            this.clearPending(pending.requestId);
        if (this.activePrompt?.prompt.pageId === pageId)
            this.clearActivePrompt();
    }
    refreshConfig() {
        if (this.canCapture())
            return;
        this.dispose();
    }
    dispose() {
        for (const pending of this.pendingByPage.values())
            this.disposePending(pending);
        this.pendingByPage.clear();
        this.clearActivePrompt();
    }
    canCapture() {
        return this.deps.getSaveMode() === constants_1.BrowserCredentialSaveMode.Ask
            && this.deps.credentialService.getAvailability().available;
    }
    promotePending(requestId) {
        const pending = Array.from(this.pendingByPage.values())
            .find(candidate => candidate.requestId === requestId);
        if (!pending)
            return;
        this.pendingByPage.delete(pending.pageId);
        this.disposePending(pending, false);
        if (!this.canCapture()) {
            pending.password = '';
            return;
        }
        this.clearActivePrompt();
        const updatesExisting = this.deps.credentialService.list(pending.origin)
            .some(credential => credential.username.localeCompare(pending.username, undefined, { sensitivity: 'accent' }) === 0);
        const prompt = {
            requestId: pending.requestId,
            pageId: pending.pageId,
            origin: pending.origin,
            username: pending.username,
            updatesExisting,
        };
        this.activePrompt = {
            prompt,
            password: pending.password,
            expiresTimer: armTimer(() => this.clearActivePrompt(), PROMPT_TTL_MS),
        };
        pending.password = '';
        this.deps.onPromptChanged(prompt);
    }
    clearPending(requestId) {
        const pending = Array.from(this.pendingByPage.values())
            .find(candidate => candidate.requestId === requestId);
        if (!pending)
            return;
        this.pendingByPage.delete(pending.pageId);
        this.disposePending(pending);
    }
    disposePending(pending, clearPassword = true) {
        clearTimeout(pending.expiresTimer);
        if (pending.successTimer)
            clearTimeout(pending.successTimer);
        if (clearPassword)
            pending.password = '';
    }
    clearActivePrompt() {
        if (!this.activePrompt)
            return;
        clearTimeout(this.activePrompt.expiresTimer);
        this.activePrompt.password = '';
        this.activePrompt = undefined;
        this.deps.onPromptChanged(undefined);
    }
}
exports.ManualCredentialCaptureService = ManualCredentialCaptureService;
//# sourceMappingURL=manualCredentialCaptureService.js.map