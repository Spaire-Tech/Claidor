"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubagentTracker = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const historyParser_1 = require("./historyParser");
const resolveSpawnDisplayLabel = (...sources) => {
    for (const source of sources) {
        const explicitLabel = typeof source?.label === 'string' ? source.label.trim() : '';
        if (explicitLabel)
            return explicitLabel;
        const taskName = typeof source?.taskName === 'string' ? source.taskName.trim() : '';
        if (taskName)
            return taskName;
    }
    return null;
};
const GATEWAY_SESSION_DELETE_CONCURRENCY = 2;
const GATEWAY_SESSION_DELETE_MAX_ATTEMPTS = 3;
const GATEWAY_SESSION_DELETE_BASE_DELAY_MS = 5_000;
const GATEWAY_SESSION_DELETE_MAX_DELAY_MS = 20_000;
/**
 * Encapsulates all subagent (child session) tracking logic:
 * state maps, lifecycle detection, history fetching, and persistence.
 *
 * All in-memory maps are keyed by toolCallId (unique per spawn invocation)
 * to avoid collisions when multiple subagents share the same agentId.
 */
class SubagentTracker {
    store;
    messageStore;
    getGatewayClient;
    onChildSessionMaterialized;
    shouldMaterializeChildSession;
    /** Maps toolCallId → OpenClaw session key for the subagent session */
    subagentSessionKeys = new Map();
    /** Maps toolCallId → collected conversation messages (CoworkMessage format) */
    subagentMessages = new Map();
    /** Maps toolCallId → agentId for correlating spawn start → result */
    subagentToolCallIdToAgentId = new Map();
    /** Maps toolCallId → lifecycle status */
    subagentStatus = new Map();
    /** Reverse map: agentId → Set of toolCallIds (for lookups from sessions_resume args) */
    agentIdToToolCallIds = new Map();
    /** Run ids explicitly deleted by the user. Suppresses late spawn/backfill re-inserts. */
    deletedSubagentRunIds = new Set();
    gatewaySessionDeleteQueue = new Map();
    gatewaySessionDeleteInFlight = new Set();
    gatewaySessionDeleteRetryTimers = new Map();
    /** Pending spawn info stored at tool start, used for DB insertion when result arrives */
    pendingSpawnInfo = new Map();
    constructor(store, messageStore, getGatewayClient, onChildSessionMaterialized, shouldMaterializeChildSession) {
        this.store = store;
        this.messageStore = messageStore;
        this.getGatewayClient = getGatewayClient;
        this.onChildSessionMaterialized = onChildSessionMaterialized;
        this.shouldMaterializeChildSession = shouldMaterializeChildSession;
    }
    // ── Event hooks (called by adapter at key points) ──────────────────────
    /**
     * Called when a sessions_spawn tool call starts.
     * Stores spawn info in memory only — DB insertion is deferred until the result arrives
     * so we can determine the correct initial status (running vs error).
     */
    onToolStart(toolCallId, args, sessionId) {
        this.deletedSubagentRunIds.delete(toolCallId);
        const agentId = typeof args?.agentId === 'string' && args.agentId
            ? args.agentId
            : typeof args?.taskName === 'string' && args.taskName
                ? args.taskName
                : typeof args?.label === 'string' && args.label
                    ? args.label
                    : toolCallId;
        if (agentId) {
            this.registerPendingSpawn(toolCallId, args, sessionId, agentId, Date.now());
        }
    }
    /**
     * Called when a sessions_spawn tool result arrives (non-empty).
     * Creates the DB record with the correct status based on the result.
     */
    onSpawnResult(toolCallId, resultText, _args) {
        if (!resultText)
            return;
        if (this.deletedSubagentRunIds.has(toolCallId))
            return;
        if (!this.subagentToolCallIdToAgentId.has(toolCallId))
            return;
        try {
            const parsed = JSON.parse(resultText);
            this.commitSpawnResult(toolCallId, parsed);
        }
        catch { /* result may not be JSON */ }
    }
    /**
     * Called when backfill retrieves a sessions_spawn tool result text.
     * Creates the DB record if not already done.
     */
    onBackfillResult(toolCallId, text) {
        if (this.deletedSubagentRunIds.has(toolCallId))
            return;
        if (!this.subagentToolCallIdToAgentId.has(toolCallId))
            return;
        try {
            const parsed = JSON.parse(text);
            this.commitSpawnResult(toolCallId, parsed);
        }
        catch { /* not JSON */ }
    }
    /**
     * Reconstructs a sessions_spawn run from authoritative chat.history. This is
     * used when the realtime tool event was missed after sessions_yield.
     */
    onHistorySpawnResult(params) {
        const { toolCallId, args, resultText, parentSessionId } = params;
        if (!resultText)
            return;
        if (this.deletedSubagentRunIds.has(toolCallId))
            return;
        try {
            const parsed = JSON.parse(resultText);
            const childSessionKey = typeof parsed?.childSessionKey === 'string' ? parsed.childSessionKey : '';
            const agentId = this.resolveSpawnAgentId(args, childSessionKey, toolCallId);
            if (!agentId)
                return;
            this.registerPendingSpawn(toolCallId, args, parentSessionId, agentId, params.createdAt ?? Date.now());
            this.commitSpawnResult(toolCallId, parsed);
        }
        catch { /* result may not be JSON */ }
    }
    /**
     * Called when sessions_resume or sessions_read tool result arrives.
     * Marks matching subagent(s) as done.
     */
    onResumeOrReadResult(args) {
        const agentId = typeof args?.agentId === 'string' ? args.agentId : '';
        if (!agentId)
            return;
        const toolCallIds = this.agentIdToToolCallIds.get(agentId);
        if (!toolCallIds)
            return;
        for (const tcId of toolCallIds) {
            if (this.subagentStatus.get(tcId) === 'running') {
                this.logTerminalState('resume/read', tcId, 'done');
                this.subagentStatus.set(tcId, 'done');
                this.store.updateSubagentRunStatus(tcId, 'done', Date.now());
                // Persist cached messages now that completion is confirmed
                this.tryPersistCachedMessages(tcId);
            }
        }
    }
    /**
     * Detects announce-style runIds that signal subagent completion.
     * Announce runIds follow the pattern: announce:v<N>:agent:<parent>:subagent:<uuid>:<runUuid>
     * Returns true if the runId was an announce pattern (even if no matching subagent was found).
     */
    tryMarkDoneFromAnnounceRunId(runId) {
        const match = runId.match(/^announce:.*:subagent:([0-9a-f-]+)/i);
        if (!match)
            return false;
        const subagentUuid = match[1];
        for (const [toolCallId, sessionKey] of this.subagentSessionKeys) {
            if (sessionKey.includes(subagentUuid)) {
                if (this.subagentStatus.get(toolCallId) !== 'done') {
                    this.logTerminalState('announce', toolCallId, 'done');
                    this.subagentStatus.set(toolCallId, 'done');
                    this.store.updateSubagentRunStatus(toolCallId, 'done', Date.now());
                    console.log('[SubagentTracker] marked subagent as done via announce:', toolCallId);
                    // Persist cached messages now that completion is confirmed
                    this.tryPersistCachedMessages(toolCallId);
                }
                return true;
            }
        }
        console.debug('[SubagentTracker] announce runId detected but no matching subagent:', runId);
        return true;
    }
    /**
     * Child session lifecycle events use the subagent's own sessionKey, not the
     * parent announce runId. Mark the matching parent run terminal before the
     * adapter drops the event as an unknown local session.
     */
    tryMarkTerminalFromSessionKey(sessionKey, status) {
        if (!sessionKey)
            return false;
        for (const [toolCallId, childSessionKey] of this.subagentSessionKeys) {
            if (childSessionKey !== sessionKey)
                continue;
            const currentStatus = this.subagentStatus.get(toolCallId);
            if (currentStatus === 'done' && status === 'error') {
                return true;
            }
            if (currentStatus !== status) {
                this.logTerminalState('session-key', toolCallId, status);
                this.subagentStatus.set(toolCallId, status);
                this.store.updateSubagentRunStatus(toolCallId, status, Date.now());
                console.log('[SubagentTracker] marked subagent as terminal via session key:', toolCallId, status);
                this.tryPersistCachedMessages(toolCallId);
            }
            return true;
        }
        return false;
    }
    /**
     * Clears all in-memory subagent tracking state and removes persisted messages.
     */
    onSessionDeleted(parentSessionId) {
        if (!parentSessionId) {
            this.subagentSessionKeys.clear();
            this.subagentMessages.clear();
            this.subagentStatus.clear();
            this.subagentToolCallIdToAgentId.clear();
            this.agentIdToToolCallIds.clear();
            this.pendingSpawnInfo.clear();
            return;
        }
        if (typeof this.store.clearChildSessionReference === 'function') {
            this.store.clearChildSessionReference(parentSessionId);
        }
        const runs = this.store.listSubagentRuns(parentSessionId);
        if (runs.length === 0) {
            return;
        }
        for (const run of runs) {
            this.deletedSubagentRunIds.add(run.id);
            this.clearSubagentMemory(run.id);
        }
        if (this.messageStore) {
            this.messageStore.deleteByParentSession(parentSessionId);
        }
        this.store.deleteSubagentRunsByParent(parentSessionId);
    }
    async deleteSubagentRun(parentSessionId, runId) {
        const run = this.store.getSubagentRun(runId);
        if (!run || run.parentSessionId !== parentSessionId) {
            return false;
        }
        this.deletedSubagentRunIds.add(runId);
        const sessionKey = this.subagentSessionKeys.get(runId) || run.sessionKey;
        this.clearSubagentMemory(runId);
        if (this.messageStore) {
            this.messageStore.deleteByRunIds([runId]);
        }
        this.store.deleteSubagentRun(runId);
        if (sessionKey) {
            this.enqueueGatewaySessionDelete(sessionKey);
        }
        return true;
    }
    // ── Public query API ───────────────────────────────────────────────────
    /**
     * Returns persisted subagent runs for a parent session.
     * Merges in-memory status with database records for real-time accuracy.
     * Records stuck in 'running' from a previous app session (no in-memory state)
     * are automatically marked as 'error'.
     */
    listSubagentRuns(parentSessionId) {
        const runs = this.store.listSubagentRuns(parentSessionId);
        return runs.map((run) => {
            const memoryStatus = this.subagentStatus.get(run.id);
            const memorySessionKey = this.subagentSessionKeys.get(run.id);
            // Stale 'running' record from a previous session: no in-memory tracking means
            // it was never committed in this app lifecycle → mark as error and persist.
            if (run.status === 'running' && !memoryStatus && !this.pendingSpawnInfo.has(run.id)) {
                const endedAt = Date.now();
                this.store.updateSubagentRunStatus(run.id, 'error', endedAt);
                return {
                    id: run.id,
                    agentId: run.agentId,
                    task: run.task,
                    label: run.label,
                    sessionKey: memorySessionKey ?? run.sessionKey,
                    childCoworkSessionId: run.childCoworkSessionId,
                    status: 'error',
                    createdAt: run.createdAt,
                    endedAt,
                };
            }
            return {
                id: run.id,
                agentId: run.agentId,
                task: run.task,
                label: run.label,
                sessionKey: memorySessionKey ?? run.sessionKey,
                childCoworkSessionId: run.childCoworkSessionId,
                status: memoryStatus ?? run.status,
                createdAt: run.createdAt,
                endedAt: run.endedAt,
            };
        });
    }
    listSubagentRunsByAgent(agentId, limit, offset) {
        const normalizedLimit = Math.max(1, Math.min(100, Math.floor(limit)));
        const normalizedOffset = Math.max(0, Math.floor(offset));
        const runs = this.store.listSubagentRunsByAgent(agentId, normalizedLimit, normalizedOffset)
            .map((run) => {
            const memoryStatus = this.subagentStatus.get(run.id);
            const memorySessionKey = this.subagentSessionKeys.get(run.id);
            if (run.status === 'running' && !memoryStatus && !this.pendingSpawnInfo.has(run.id)) {
                const endedAt = Date.now();
                this.store.updateSubagentRunStatus(run.id, 'error', endedAt);
                return {
                    ...run,
                    status: 'error',
                    sessionKey: memorySessionKey ?? run.sessionKey,
                    endedAt,
                };
            }
            return {
                ...run,
                status: memoryStatus ?? run.status,
                sessionKey: memorySessionKey ?? run.sessionKey,
            };
        });
        const total = this.store.countSubagentRunsByAgent(agentId);
        return {
            runs,
            hasMore: normalizedOffset + runs.length < total,
        };
    }
    /**
     * Fetch conversation history for a subagent session.
     * Tries local cache first, then falls back to gateway RPC.
     * Note: runId parameter is the unique run identifier (toolCallId stored as DB id).
     */
    async getSubTaskHistory(parentSessionId, runId, sessionKey) {
        const storedRun = this.store?.getSubagentRun(runId) ?? null;
        const storedRunBelongsToParent = storedRun?.parentSessionId === parentSessionId;
        const persistedSessionKey = storedRunBelongsToParent ? storedRun?.sessionKey : null;
        const resolvedStatus = this.subagentStatus.get(runId) ?? storedRun?.status;
        const key = sessionKey || this.subagentSessionKeys.get(runId) || persistedSessionKey || '';
        if (!key) {
            console.log('[SubagentTracker] getSubTaskHistory: no session key for runId:', runId, 'parentSession:', parentSessionId, 'status:', resolvedStatus ?? 'unknown');
            return [];
        }
        if (sessionKey && !this.subagentSessionKeys.has(runId)) {
            this.subagentSessionKeys.set(runId, sessionKey);
        }
        // 1. Try locally collected messages (only serve cache if subagent is done/error)
        const local = this.subagentMessages.get(runId);
        if (local && local.length > 0 && (resolvedStatus === 'done' || resolvedStatus === 'error')) {
            return local;
        }
        // 2. Try persisted messages from local database
        const persisted = this.loadPersistedMessages(runId);
        if (persisted)
            return persisted;
        console.log('[SubagentTracker] getSubTaskHistory: fetching history for runId:', runId, 'key:', key);
        return this.fetchSubagentHistory(key, runId);
    }
    // ── Private helpers ────────────────────────────────────────────────────
    /**
     * Shared logic for onSpawnResult and onBackfillResult.
     * Inserts the DB record (if not already done) with the correct status.
     */
    commitSpawnResult(toolCallId, parsed) {
        if (this.deletedSubagentRunIds.has(toolCallId))
            return;
        if (!this.store)
            return;
        const childSessionKey = typeof parsed?.childSessionKey === 'string' ? parsed.childSessionKey : '';
        const isAccepted = parsed?.status === 'accepted' && Boolean(childSessionKey);
        const isError = !isAccepted;
        const status = isError ? 'error' : 'running';
        // Store session key in memory
        const hadSessionKey = this.subagentSessionKeys.has(toolCallId);
        if (childSessionKey) {
            this.subagentSessionKeys.set(toolCallId, childSessionKey);
        }
        // If already committed (e.g., onSpawnResult fired then backfill also fires), just update
        if (this.subagentStatus.has(toolCallId)) {
            // Update session key in DB if newly discovered
            if (childSessionKey && !hadSessionKey) {
                this.store.updateSubagentRunSessionKey(toolCallId, childSessionKey);
            }
            if (isError && this.subagentStatus.get(toolCallId) !== 'error') {
                this.subagentStatus.set(toolCallId, 'error');
                this.store.updateSubagentRunStatus(toolCallId, 'error', Date.now());
            }
            return;
        }
        const existingRun = typeof this.store.getSubagentRun === 'function'
            ? this.store.getSubagentRun(toolCallId)
            : null;
        if (existingRun) {
            const nextStatus = isError && existingRun.status !== 'done' ? 'error' : existingRun.status;
            this.subagentStatus.set(toolCallId, nextStatus);
            if (nextStatus !== existingRun.status) {
                this.store.updateSubagentRunStatus(toolCallId, nextStatus, Date.now());
            }
            if (childSessionKey && existingRun.sessionKey !== childSessionKey) {
                this.store.updateSubagentRunSessionKey(toolCallId, childSessionKey);
            }
            const candidate = {
                runId: toolCallId,
                parentSessionId: existingRun.parentSessionId,
                childSessionKey,
                agentId: existingRun.agentId || this.resolveSpawnAgentId({}, childSessionKey, toolCallId),
                task: existingRun.task,
                label: existingRun.label,
                status: nextStatus,
                createdAt: existingRun.createdAt,
            };
            const shouldMaterialize = !isError
                && Boolean(childSessionKey)
                && (this.shouldMaterializeChildSession?.(candidate) ?? true);
            if (shouldMaterialize) {
                const childCoworkSessionId = existingRun.childCoworkSessionId || node_crypto_1.default.randomUUID();
                if (!existingRun.childCoworkSessionId && typeof this.store.updateSubagentRunChildSession === 'function') {
                    this.store.updateSubagentRunChildSession(toolCallId, childCoworkSessionId);
                }
                this.materializeChildSession({
                    ...candidate,
                    childCoworkSessionId,
                });
            }
            return;
        }
        // First time: insert the DB record
        this.subagentStatus.set(toolCallId, status);
        const pending = this.pendingSpawnInfo.get(toolCallId);
        if (pending) {
            const displayLabel = pending.label ?? resolveSpawnDisplayLabel(parsed);
            const candidate = {
                runId: toolCallId,
                parentSessionId: pending.parentSessionId,
                childSessionKey,
                agentId: pending.agentId,
                task: pending.task,
                label: displayLabel,
                status,
                createdAt: pending.createdAt,
            };
            const shouldMaterialize = !isError
                && Boolean(childSessionKey)
                && (this.shouldMaterializeChildSession?.(candidate) ?? true);
            const childCoworkSessionId = shouldMaterialize ? node_crypto_1.default.randomUUID() : null;
            this.store.insertSubagentRun({
                id: toolCallId,
                parentSessionId: pending.parentSessionId,
                sessionKey: childSessionKey || null,
                childCoworkSessionId,
                agentId: pending.agentId,
                task: pending.task,
                label: displayLabel,
                status,
                createdAt: pending.createdAt,
                endedAt: isError ? Date.now() : null,
            });
            if (shouldMaterialize && childCoworkSessionId) {
                this.materializeChildSession({
                    ...candidate,
                    childCoworkSessionId,
                });
            }
            this.pendingSpawnInfo.delete(toolCallId);
            console.log('[SubagentTracker] committed spawn result:', toolCallId, status, isError ? parsed.error : '');
        }
    }
    clearSubagentMemory(runId) {
        const agentId = this.subagentToolCallIdToAgentId.get(runId);
        this.subagentSessionKeys.delete(runId);
        this.subagentMessages.delete(runId);
        this.subagentStatus.delete(runId);
        this.subagentToolCallIdToAgentId.delete(runId);
        this.pendingSpawnInfo.delete(runId);
        if (agentId) {
            const toolCallIds = this.agentIdToToolCallIds.get(agentId);
            toolCallIds?.delete(runId);
            if (toolCallIds?.size === 0) {
                this.agentIdToToolCallIds.delete(agentId);
            }
        }
    }
    materializeChildSession(params) {
        try {
            console.log('[SubagentTracker] materialize child session:', `runId=${params.runId}`, `agentId=${params.agentId}`, `childCoworkSessionId=${params.childCoworkSessionId}`, `childSessionKey=${params.childSessionKey}`, `status=${params.status}`);
            this.onChildSessionMaterialized?.(params);
        }
        catch (error) {
            console.warn('[SubagentTracker] failed to materialize child session:', error);
        }
    }
    logTerminalState(reason, runId, status) {
        const run = typeof this.store?.getSubagentRun === 'function'
            ? this.store.getSubagentRun(runId)
            : null;
        console.log('[SubagentTracker] terminal state:', `reason=${reason}`, `runId=${runId}`, `status=${status}`, `memoryStatus=${this.subagentStatus.get(runId) ?? 'none'}`, `dbStatus=${run?.status ?? 'none'}`, `childCoworkSessionId=${run?.childCoworkSessionId ?? 'none'}`, `sessionKey=${this.subagentSessionKeys.get(runId) ?? run?.sessionKey ?? 'none'}`);
    }
    resolveSpawnAgentId(args, childSessionKey, fallback) {
        if (typeof args?.agentId === 'string' && args.agentId.trim()) {
            return args.agentId.trim();
        }
        const match = childSessionKey.match(/^agent:([^:]+):subagent:/);
        if (match?.[1]) {
            return match[1];
        }
        if (typeof args?.taskName === 'string' && args.taskName.trim()) {
            return args.taskName.trim();
        }
        if (typeof args?.label === 'string' && args.label.trim()) {
            return args.label.trim();
        }
        return fallback;
    }
    registerPendingSpawn(toolCallId, args, parentSessionId, agentId, createdAt) {
        if (!this.subagentMessages.has(toolCallId)) {
            this.subagentMessages.set(toolCallId, []);
        }
        this.subagentToolCallIdToAgentId.set(toolCallId, agentId);
        let toolCallIds = this.agentIdToToolCallIds.get(agentId);
        if (!toolCallIds) {
            toolCallIds = new Set();
            this.agentIdToToolCallIds.set(agentId, toolCallIds);
        }
        toolCallIds.add(toolCallId);
        const task = typeof args?.task === 'string' ? args.task : '';
        const label = resolveSpawnDisplayLabel(args);
        this.pendingSpawnInfo.set(toolCallId, {
            agentId,
            task: task || null,
            label,
            parentSessionId,
            createdAt,
        });
    }
    enqueueGatewaySessionDelete(sessionKey) {
        if (this.gatewaySessionDeleteQueue.has(sessionKey)
            || this.gatewaySessionDeleteInFlight.has(sessionKey)
            || this.gatewaySessionDeleteRetryTimers.has(sessionKey)) {
            return;
        }
        this.gatewaySessionDeleteQueue.set(sessionKey, { sessionKey, attempt: 1 });
        this.processGatewaySessionDeleteQueue();
    }
    processGatewaySessionDeleteQueue() {
        while (this.gatewaySessionDeleteInFlight.size < GATEWAY_SESSION_DELETE_CONCURRENCY
            && this.gatewaySessionDeleteQueue.size > 0) {
            const task = this.gatewaySessionDeleteQueue.values().next().value;
            if (!task)
                return;
            this.gatewaySessionDeleteQueue.delete(task.sessionKey);
            this.gatewaySessionDeleteInFlight.add(task.sessionKey);
            void this.runGatewaySessionDeleteTask(task);
        }
    }
    async runGatewaySessionDeleteTask(task) {
        try {
            const deleted = await this.deleteGatewaySession(task.sessionKey);
            if (!deleted) {
                this.scheduleGatewaySessionDeleteRetry(task);
            }
        }
        finally {
            this.gatewaySessionDeleteInFlight.delete(task.sessionKey);
            this.processGatewaySessionDeleteQueue();
        }
    }
    scheduleGatewaySessionDeleteRetry(task) {
        if (task.attempt >= GATEWAY_SESSION_DELETE_MAX_ATTEMPTS) {
            console.warn('[SubagentTracker] gateway subagent session cleanup reached the retry limit');
            return;
        }
        const delayMs = Math.min(GATEWAY_SESSION_DELETE_BASE_DELAY_MS * (2 ** (task.attempt - 1)), GATEWAY_SESSION_DELETE_MAX_DELAY_MS);
        const timer = setTimeout(() => {
            this.gatewaySessionDeleteRetryTimers.delete(task.sessionKey);
            this.gatewaySessionDeleteQueue.set(task.sessionKey, {
                sessionKey: task.sessionKey,
                attempt: task.attempt + 1,
            });
            this.processGatewaySessionDeleteQueue();
        }, delayMs);
        this.gatewaySessionDeleteRetryTimers.set(task.sessionKey, timer);
        console.warn('[SubagentTracker] gateway subagent session cleanup failed, retrying later');
    }
    async deleteGatewaySession(sessionKey) {
        const client = this.getGatewayClient();
        if (!client)
            return false;
        try {
            await client.request('sessions.delete', {
                key: sessionKey,
                deleteTranscript: true,
            }, { timeoutMs: 5_000 });
            return true;
        }
        catch (error) {
            console.warn('[SubagentTracker] Failed to delete gateway subagent session:', error);
            return false;
        }
    }
    async fetchSubagentHistory(sessionKey, runId) {
        const client = this.getGatewayClient();
        if (!client)
            return [];
        try {
            const history = await client.request('chat.history', {
                sessionKey,
                limit: 100,
            }, { timeoutMs: 10_000 });
            if (!Array.isArray(history?.messages) || history.messages.length === 0) {
                console.log('[SubagentTracker] fetchSubagentHistory: no messages returned for key:', sessionKey);
                return [];
            }
            console.log('[SubagentTracker] fetchSubagentHistory: got', history.messages.length, 'raw messages for key:', sessionKey);
            const messages = (0, historyParser_1.parseSubagentGatewayHistoryMessages)(history.messages);
            // Cache locally
            this.subagentMessages.set(runId, messages);
            // Only persist to database if the subagent is confirmed done/error.
            // If still running, the history may be incomplete — persist later when
            // done is confirmed via announce/resume/read events.
            const currentStatus = this.subagentStatus.get(runId)
                || this.store.getRunStatus(runId);
            if (currentStatus === 'done' || currentStatus === 'error') {
                this.persistMessages(runId, messages);
            }
            console.log('[SubagentTracker] fetchSubagentHistory: extracted', messages.length, 'display messages for runId:', runId);
            return messages;
        }
        catch (error) {
            console.warn('[SubagentTracker] Failed to fetch subagent history:', error);
            return [];
        }
    }
    /**
     * Load messages from the persisted subagent_messages table.
     * Returns null if no persisted messages are found.
     */
    loadPersistedMessages(runId) {
        if (!this.messageStore)
            return null;
        if (!this.store)
            return null;
        if (!this.store.isMessagesPersisted(runId))
            return null;
        const rows = this.messageStore.getMessages(runId);
        if (rows.length === 0)
            return null;
        const messages = rows.map((row) => ({
            id: row.id,
            type: row.type,
            content: row.content,
            timestamp: row.createdAt,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        }));
        // Populate in-memory cache so subsequent reads skip the DB
        this.subagentMessages.set(runId, messages);
        return messages;
    }
    /**
     * Persist fetched messages to local database for instant future reads.
     */
    persistMessages(runId, messages) {
        if (!this.messageStore)
            return;
        if (messages.length === 0)
            return;
        if (this.store.isMessagesPersisted(runId))
            return;
        try {
            this.messageStore.insertMessages(runId, messages.map((msg, idx) => ({
                id: msg.id,
                type: msg.type,
                content: msg.content,
                metadata: msg.metadata ?? null,
                timestamp: msg.timestamp,
                sequence: idx + 1,
            })));
            this.store.markMessagesPersisted(runId);
            console.log('[SubagentTracker] persisted', messages.length, 'messages for runId:', runId);
        }
        catch (error) {
            console.warn('[SubagentTracker] Failed to persist messages for runId:', runId, error);
        }
    }
    /**
     * When a subagent is confirmed done, clear stale in-memory cache so that the
     * next getSubTaskHistory call fetches fresh complete data from the gateway.
     * We do NOT persist the cached messages here because they may have been fetched
     * while the subagent was still running (incomplete). Persistence will happen
     * on the next getSubTaskHistory call which will see status=done and persist.
     */
    tryPersistCachedMessages(runId) {
        // Clear potentially stale/incomplete cached messages
        this.subagentMessages.delete(runId);
    }
}
exports.SubagentTracker = SubagentTracker;
//# sourceMappingURL=tracker.js.map