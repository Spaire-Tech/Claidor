"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoworkEngineRouter = void 0;
const events_1 = require("events");
const types_1 = require("./types");
class CoworkEngineRouter extends events_1.EventEmitter {
    getCurrentEngine;
    runtime;
    sessionEngine = new Map();
    requestEngine = new Map();
    requestSession = new Map();
    currentEngine;
    constructor(deps) {
        super();
        this.getCurrentEngine = deps.getCurrentEngine;
        this.runtime = deps.openclawRuntime;
        this.currentEngine = this.safeResolveEngine();
        this.bindRuntimeEvents('openclaw', deps.openclawRuntime);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    off(event, listener) {
        return super.off(event, listener);
    }
    async startSession(sessionId, prompt, options = {}) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        try {
            await this.runtime.startSession(sessionId, prompt, options);
        }
        catch (error) {
            this.sessionEngine.delete(sessionId);
            this.clearRequestEngineBySession(sessionId);
            throw error;
        }
    }
    async continueSession(sessionId, prompt, options = {}) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        try {
            await this.runtime.continueSession(sessionId, prompt, options);
        }
        catch (error) {
            this.sessionEngine.delete(sessionId);
            this.clearRequestEngineBySession(sessionId);
            throw error;
        }
    }
    async submitSteer(sessionId, text, clientSteerId) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.submitSteer) {
            throw new Error(`Steer is not supported by engine: ${engine}`);
        }
        return this.runtime.submitSteer(sessionId, text, clientSteerId);
    }
    async submitBtw(sessionId, question, runId) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.submitBtw) {
            throw new Error(`BTW side questions are not supported by engine: ${engine}`);
        }
        return this.runtime.submitBtw(sessionId, question, runId);
    }
    async abortBtw(sessionId, runId) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.abortBtw) {
            throw new Error(`Stopping BTW side questions is not supported by engine: ${engine}`);
        }
        return this.runtime.abortBtw(sessionId, runId);
    }
    async runGoalCommand(sessionId, command) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.runGoalCommand) {
            throw new Error(`Goal commands are not supported by engine: ${engine}`);
        }
        return this.runtime.runGoalCommand(sessionId, command);
    }
    async patchSession(sessionId, patch) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.patchSession) {
            throw new Error(`Session patch is not supported by engine: ${engine}`);
        }
        return this.runtime.patchSession(sessionId, patch);
    }
    async getContextUsage(sessionId) {
        if (!this.runtime.getContextUsage) {
            return null;
        }
        return this.runtime.getContextUsage(sessionId);
    }
    async compactContext(sessionId) {
        const engine = this.safeResolveEngine();
        this.sessionEngine.set(sessionId, engine);
        if (!this.runtime.compactContext) {
            throw new Error(`Context compaction is not supported by engine: ${engine}`);
        }
        return this.runtime.compactContext(sessionId);
    }
    async getForkCompactionSummary(sessionId, beforeCreatedAt) {
        if (!this.runtime.getForkCompactionSummary) {
            return null;
        }
        return this.runtime.getForkCompactionSummary(sessionId, beforeCreatedAt);
    }
    stopSession(sessionId) {
        this.runtime.stopSession(sessionId);
        this.sessionEngine.delete(sessionId);
        this.clearRequestEngineBySession(sessionId);
    }
    stopAllSessions() {
        this.runtime.stopAllSessions();
        this.sessionEngine.clear();
        this.requestEngine.clear();
        this.requestSession.clear();
    }
    respondToPermission(requestId, result) {
        const engine = this.requestEngine.get(requestId);
        if (engine) {
            this.runtime.respondToPermission(requestId, result);
            if (result.behavior === 'allow' || result.behavior === 'deny') {
                this.requestEngine.delete(requestId);
                this.requestSession.delete(requestId);
            }
            return;
        }
        this.runtime.respondToPermission(requestId, result);
    }
    isSessionActive(sessionId) {
        return this.runtime.isSessionActive(sessionId);
    }
    getActiveSessionIds() {
        return Array.from(this.sessionEngine.keys())
            .filter((sessionId) => this.runtime.isSessionActive(sessionId));
    }
    getSessionConfirmationMode(sessionId) {
        return this.runtime.getSessionConfirmationMode(sessionId);
    }
    async deleteSubagentSession(parentSessionId, runId) {
        if (!this.runtime.deleteSubagentSession) {
            return false;
        }
        return this.runtime.deleteSubagentSession(parentSessionId, runId);
    }
    onSessionDeleted(sessionId) {
        this.sessionEngine.delete(sessionId);
        this.clearRequestEngineBySession(sessionId);
        this.runtime.onSessionDeleted?.(sessionId);
    }
    handleEngineConfigChanged(nextEngine) {
        if (nextEngine === this.currentEngine) {
            return;
        }
        this.currentEngine = nextEngine;
        const activeSessionIds = Array.from(this.sessionEngine.keys())
            .filter((sessionId) => this.runtime.isSessionActive(sessionId));
        this.stopAllSessions();
        activeSessionIds.forEach((sessionId) => {
            this.emit('error', sessionId, types_1.ENGINE_SWITCHED_CODE);
        });
    }
    bindRuntimeEvents(engine, runtime) {
        runtime.on('message', (sessionId, message, beforeMessageId) => {
            this.sessionEngine.set(sessionId, engine);
            this.emit('message', sessionId, message, beforeMessageId);
        });
        runtime.on('messageUpdate', (sessionId, messageId, content, metadata) => {
            this.sessionEngine.set(sessionId, engine);
            this.emit('messageUpdate', sessionId, messageId, content, metadata);
        });
        runtime.on('sessionStatus', (sessionId, status) => {
            if (status === 'running') {
                this.sessionEngine.set(sessionId, engine);
            }
            this.emit('sessionStatus', sessionId, status);
        });
        runtime.on('btwResult', (sessionId, result) => {
            this.sessionEngine.set(sessionId, engine);
            this.emit('btwResult', sessionId, result);
        });
        runtime.on('contextUsageUpdate', (sessionId, usage) => {
            this.sessionEngine.set(sessionId, engine);
            this.emit('contextUsageUpdate', sessionId, usage);
        });
        runtime.on('contextMaintenance', (sessionId, active) => {
            this.sessionEngine.set(sessionId, engine);
            this.emit('contextMaintenance', sessionId, active);
        });
        runtime.on('permissionRequest', (sessionId, request) => {
            this.sessionEngine.set(sessionId, engine);
            this.requestEngine.set(request.requestId, engine);
            this.requestSession.set(request.requestId, sessionId);
            this.emit('permissionRequest', sessionId, request);
        });
        runtime.on('permissionResolved', (sessionId, requestId) => {
            this.requestEngine.delete(requestId);
            this.requestSession.delete(requestId);
            this.emit('permissionResolved', sessionId, requestId);
        });
        runtime.on('complete', (sessionId, claudeSessionId) => {
            this.sessionEngine.delete(sessionId);
            this.clearRequestEngineBySession(sessionId);
            this.emit('complete', sessionId, claudeSessionId);
        });
        runtime.on('error', (sessionId, error) => {
            this.sessionEngine.delete(sessionId);
            this.clearRequestEngineBySession(sessionId);
            this.emit('error', sessionId, error);
        });
        runtime.on('sessionStopped', (sessionId) => {
            this.emit('sessionStopped', sessionId);
        });
    }
    clearRequestEngineBySession(sessionId) {
        for (const [requestId, requestSessionId] of this.requestSession.entries()) {
            if (requestSessionId !== sessionId)
                continue;
            this.requestSession.delete(requestId);
            this.requestEngine.delete(requestId);
        }
    }
    safeResolveEngine() {
        this.currentEngine = this.getCurrentEngine();
        return this.currentEngine;
    }
}
exports.CoworkEngineRouter = CoworkEngineRouter;
//# sourceMappingURL=coworkEngineRouter.js.map