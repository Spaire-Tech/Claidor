"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthCallbackRouter = void 0;
const constants_1 = require("../../shared/auth/constants");
class AuthCallbackRouter {
    options;
    pendingAuthCode = null;
    listenerReady = false;
    constructor(options) {
        this.options = options;
    }
    handleDeepLink(url) {
        try {
            const parsed = new URL(url);
            if (parsed.hostname !== 'auth' || parsed.pathname !== '/callback')
                return;
            const code = parsed.searchParams.get('code');
            if (!code)
                return;
            this.deliverOrBuffer(code);
        }
        catch (error) {
            this.options.onParseError?.(error);
        }
    }
    handleAuthCode(code) {
        if (!code)
            return;
        this.deliverOrBuffer(code);
    }
    markListenerReadyAndConsumePending() {
        this.listenerReady = true;
        const code = this.pendingAuthCode;
        this.pendingAuthCode = null;
        return code;
    }
    markRendererUnavailable() {
        this.listenerReady = false;
    }
    handleNavigationStarted({ isMainFrame, isInPlace }) {
        if (isMainFrame && !isInPlace) {
            this.markRendererUnavailable();
        }
    }
    deliverOrBuffer(code) {
        if (this.listenerReady) {
            const target = this.options.getTarget();
            if (target && !target.isDestroyed()) {
                target.send(constants_1.AuthIpcChannel.Callback, { code });
                return;
            }
        }
        this.pendingAuthCode = code;
    }
}
exports.AuthCallbackRouter = AuthCallbackRouter;
//# sourceMappingURL=authCallbackRouter.js.map