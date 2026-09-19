"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawTurnHistorySync = void 0;
const THINKING_SYNC_DEBOUNCE_MS = 250;
const TOOL_RESULT_BACKFILL_DEBOUNCE_MS = 2_000;
class OpenClawTurnHistorySync {
    dependencies;
    thinkingTimers = new Map();
    pendingThinkingToolCallIds = new Map();
    backfillTimers = new Map();
    pendingBackfillToolCallIds = new Map();
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    scheduleThinking(sessionId, toolCallId) {
        this.addPending(this.pendingThinkingToolCallIds, sessionId, toolCallId);
        this.schedule(this.thinkingTimers, sessionId, THINKING_SYNC_DEBOUNCE_MS, () => this.executeThinking(sessionId));
    }
    scheduleToolResultBackfill(sessionId, toolCallId) {
        this.addPending(this.pendingBackfillToolCallIds, sessionId, toolCallId);
        this.schedule(this.backfillTimers, sessionId, TOOL_RESULT_BACKFILL_DEBOUNCE_MS, () => this.executeBackfill(sessionId));
    }
    clearSession(sessionId) {
        this.clearTimer(this.thinkingTimers, sessionId);
        this.clearTimer(this.backfillTimers, sessionId);
        this.pendingThinkingToolCallIds.delete(sessionId);
        this.pendingBackfillToolCallIds.delete(sessionId);
    }
    dispose() {
        for (const timer of [...this.thinkingTimers.values(), ...this.backfillTimers.values()]) {
            clearTimeout(timer);
        }
        this.thinkingTimers.clear();
        this.backfillTimers.clear();
        this.pendingThinkingToolCallIds.clear();
        this.pendingBackfillToolCallIds.clear();
    }
    addPending(pendingBySession, sessionId, toolCallId) {
        const pending = pendingBySession.get(sessionId) ?? new Set();
        pending.add(toolCallId);
        pendingBySession.set(sessionId, pending);
    }
    schedule(timers, sessionId, delayMs, execute) {
        this.clearTimer(timers, sessionId);
        timers.set(sessionId, setTimeout(() => {
            timers.delete(sessionId);
            void execute();
        }, delayMs));
    }
    clearTimer(timers, sessionId) {
        const timer = timers.get(sessionId);
        if (timer)
            clearTimeout(timer);
        timers.delete(sessionId);
    }
    async executeThinking(sessionId) {
        const pending = this.pendingThinkingToolCallIds.get(sessionId);
        if (!pending?.size)
            return;
        const toolCallIds = new Set(pending);
        pending.clear();
        const turn = this.dependencies.getTurn(sessionId);
        if (!turn?.sessionKey)
            return;
        try {
            const messages = await this.dependencies.requestHistory(turn.sessionKey, Math.min(toolCallIds.size * 3 + 5, 30));
            const currentTurn = this.dependencies.getTurn(sessionId);
            if (!messages || currentTurn?.turnToken !== turn.turnToken)
                return;
            this.dependencies.handleThinkingHistory(sessionId, messages);
        }
        catch (error) {
            console.warn('[EngineRuntime] tool-boundary thinking history sync failed:', error);
        }
        finally {
            if (this.pendingThinkingToolCallIds.get(sessionId)?.size && this.dependencies.getTurn(sessionId)) {
                this.schedule(this.thinkingTimers, sessionId, THINKING_SYNC_DEBOUNCE_MS, () => this.executeThinking(sessionId));
            }
        }
    }
    async executeBackfill(sessionId) {
        const pending = this.pendingBackfillToolCallIds.get(sessionId);
        if (!pending?.size)
            return;
        const toolCallIds = new Set(pending);
        pending.clear();
        const turn = this.dependencies.getTurn(sessionId);
        if (!turn?.sessionKey) {
            this.pendingBackfillToolCallIds.delete(sessionId);
            return;
        }
        try {
            const messages = await this.dependencies.requestHistory(turn.sessionKey, Math.min(toolCallIds.size * 3 + 5, 30));
            const currentTurn = this.dependencies.getTurn(sessionId);
            if (!messages || currentTurn?.turnToken !== turn.turnToken)
                return;
            this.dependencies.handleBackfillHistory(sessionId, messages);
        }
        catch (error) {
            console.warn('[EngineRuntime] incremental backfill chat.history fetch failed:', error);
            const currentPending = this.pendingBackfillToolCallIds.get(sessionId) ?? new Set();
            toolCallIds.forEach((toolCallId) => currentPending.add(toolCallId));
            this.pendingBackfillToolCallIds.set(sessionId, currentPending);
        }
        finally {
            if (this.pendingBackfillToolCallIds.get(sessionId)?.size && this.dependencies.getTurn(sessionId)) {
                this.schedule(this.backfillTimers, sessionId, TOOL_RESULT_BACKFILL_DEBOUNCE_MS, () => this.executeBackfill(sessionId));
            }
        }
    }
}
exports.OpenClawTurnHistorySync = OpenClawTurnHistorySync;
//# sourceMappingURL=openclawTurnHistorySync.js.map