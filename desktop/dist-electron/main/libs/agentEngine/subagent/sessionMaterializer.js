"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentSessionMaterializer = void 0;
const sessionKeys_1 = require("./sessionKeys");
class SubagentSessionMaterializer {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    materialize(params) {
        if (!params.childSessionKey.trim() || !params.childCoworkSessionId.trim())
            return;
        const title = this.buildTitle(params);
        try {
            const status = params.status === 'error' ? 'error' : 'running';
            if (typeof this.deps.store.upsertSubagentChildSession !== 'function') {
                return;
            }
            const session = this.deps.store.upsertSubagentChildSession({
                id: params.childCoworkSessionId,
                parentSessionId: params.parentSessionId,
                childSessionKey: params.childSessionKey,
                agentId: params.agentId || 'main',
                title,
                task: params.task,
                status,
                createdAt: params.createdAt,
            });
            console.log('[EngineRuntime] materialized subagent child session:', `runId=${params.runId}`, `childSessionId=${session.id}`, `parentSessionId=${params.parentSessionId}`, `childSessionKey=${params.childSessionKey}`, `agentId=${params.agentId}`, `runStatus=${params.status}`, `sessionStatus=${status}`);
            this.deps.rememberSessionKey(session.id, params.childSessionKey);
            this.deps.markSessionHistoryUnsynced(session.id);
            this.deps.notifySessionsChanged(session.id);
            void this.deps.syncSessionHistory(session.id, params.childSessionKey)
                .catch((error) => {
                console.warn('[EngineRuntime] subagent child history sync failed:', error);
            });
        }
        catch (error) {
            console.warn('[EngineRuntime] failed to materialize subagent child session:', error);
        }
    }
    shouldMaterialize(params) {
        const childAgentId = (0, sessionKeys_1.parseAgentIdFromSubagentSessionKey)(params.childSessionKey);
        if (!childAgentId)
            return true;
        const parentSession = this.deps.store.getSession(params.parentSessionId, 0);
        const parentAgentId = parentSession?.agentId?.trim() || 'main';
        return childAgentId !== parentAgentId;
    }
    finalizePassive(sessionKey, status) {
        const sessionId = this.deps.resolveSessionIdBySessionKey(sessionKey);
        if (!sessionId) {
            console.log('[EngineRuntime] passive subagent finalize skipped: no session mapping', `sessionKey=${sessionKey}`, `status=${status}`);
            return;
        }
        const nextStatus = status === 'done' ? 'completed' : 'error';
        const previousStatus = this.deps.store.getSession(sessionId, 0)?.status ?? 'unknown';
        console.log('[EngineRuntime] passive subagent finalize:', `sessionId=${sessionId}`, `sessionKey=${sessionKey}`, `status=${status}`, `previousSessionStatus=${previousStatus}`, `nextSessionStatus=${nextStatus}`);
        this.deps.store.updateSession(sessionId, { status: nextStatus });
        this.deps.emitSessionStatus(sessionId, nextStatus);
        if (nextStatus === 'completed') {
            this.deps.emitComplete(sessionId, sessionKey);
        }
        else {
            this.deps.emitError(sessionId, 'Subagent session failed.');
        }
        this.deps.notifySessionsChanged(sessionId);
        void this.deps.syncSessionHistory(sessionId, sessionKey)
            .catch((error) => {
            console.warn('[EngineRuntime] passive subagent final history sync failed:', error);
        });
    }
    buildTitle(params) {
        const label = params.label?.trim();
        if (label)
            return label;
        const task = params.task?.split(/\r?\n/).map(line => line.trim()).find(Boolean);
        if (task)
            return task.length > 80 ? `${task.slice(0, 77)}...` : task;
        const agent = this.deps.store.getAgent?.(params.agentId || 'main');
        return agent?.name?.trim() || params.agentId || 'Subagent';
    }
}
exports.SubagentSessionMaterializer = SubagentSessionMaterializer;
//# sourceMappingURL=sessionMaterializer.js.map