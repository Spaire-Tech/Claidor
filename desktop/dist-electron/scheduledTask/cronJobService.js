"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CronJobService = void 0;
exports.isInternalScheduledTaskJob = isInternalScheduledTaskJob;
exports.mapGatewaySchedule = mapGatewaySchedule;
exports.mapGatewayTaskState = mapGatewayTaskState;
exports.mapGatewayJob = mapGatewayJob;
exports.mapGatewayRun = mapGatewayRun;
const electron_1 = require("electron");
const openclawChannelSessionSync_1 = require("../main/libs/openclawChannelSessionSync");
const platform_1 = require("../shared/platform");
const constants_1 = require("./constants");
const CRON_RUNS_MIN_PAGE_SIZE = 50;
const CRON_RUNS_MAX_PAGE_SIZE = 200;
function normalizeRunPageNumber(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.floor(value));
}
function getGatewayRunPageSize(visibleLimit) {
    if (visibleLimit <= 0)
        return 0;
    return Math.min(Math.max(visibleLimit, CRON_RUNS_MIN_PAGE_SIZE), CRON_RUNS_MAX_PAGE_SIZE);
}
function getGatewayRunRequestLimit(pageSize, remainingVisible) {
    return Math.min(pageSize, Math.max(remainingVisible, CRON_RUNS_MIN_PAGE_SIZE));
}
function logGatewayRunPageClamp(scope, visibleLimit, visibleOffset, pageSize) {
    if (visibleLimit <= CRON_RUNS_MAX_PAGE_SIZE)
        return;
    console.debug(`[CronJobService] paginating ${scope} run history within gateway limit: requestedLimit=${visibleLimit}, offset=${visibleOffset}, gatewayPageSize=${pageSize}.`);
}
function isInternalScheduledTaskJob(job) {
    const description = job.description?.trim() ?? '';
    if (description.startsWith(constants_1.InternalTaskMarker.MemoryCoreManagedDescriptionPrefix)) {
        return true;
    }
    const payload = job.payload;
    let payloadText;
    if (payload?.kind === constants_1.PayloadKind.SystemEvent) {
        payloadText = payload.text;
    }
    else if (payload?.kind === constants_1.PayloadKind.AgentTurn) {
        payloadText = payload.message;
    }
    return (typeof payloadText === 'string' &&
        payloadText.trim().startsWith(constants_1.InternalTaskMarker.MemoryCorePayloadPrefix));
}
/**
 * Coerce a value to a finite number, returning `fallback` when the value is
 * undefined, null, NaN, Infinity, or not a number at all.
 * Used to guard against malformed Gateway responses that could surface NaN in the UI.
 */
function safeFiniteNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    return fallback;
}
/**
 * Same as {@link safeFiniteNumber} but returns `null` when the value is absent
 * instead of a numeric fallback.  Suitable for optional timestamp fields.
 */
function safeFiniteNumberOrNull(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    return null;
}
function mapGatewayResultStatus(status) {
    if (status === constants_1.GatewayStatus.Ok)
        return constants_1.TaskStatus.Success;
    if (status === constants_1.GatewayStatus.Error)
        return constants_1.TaskStatus.Error;
    if (status === constants_1.GatewayStatus.Skipped)
        return constants_1.TaskStatus.Skipped;
    return null;
}
function matchesRunFilter(run, filter) {
    if (filter?.status && run.status !== filter.status)
        return false;
    return true;
}
/**
 * Returns true when a gateway error is exclusively a delivery failure —
 * the agent turn itself completed successfully but the gateway reports an
 * error because delivery was attempted and failed (or was not requested).
 *
 * The gateway currently conflates delivery failure with job failure for
 * `delivery.mode: "none"` jobs, setting `status: "error"` even though the
 * agent turn produced a valid summary.  This helper lets callers downgrade
 * such errors to success.
 */
function isDeliveryOnlyError(opts) {
    if (opts.status !== constants_1.GatewayStatus.Error)
        return false;
    if (!opts.error)
        return false;
    // The error is delivery-only when its text matches the deliveryError exactly.
    return !!opts.deliveryError && opts.error === opts.deliveryError;
}
function mapGatewaySchedule(schedule) {
    switch (schedule.kind) {
        case constants_1.ScheduleKind.At:
            return { kind: constants_1.ScheduleKind.At, at: schedule.at };
        case constants_1.ScheduleKind.Every: {
            const everyMs = safeFiniteNumber(schedule.everyMs, 60_000);
            const anchorMs = safeFiniteNumberOrNull(schedule.anchorMs);
            return {
                kind: constants_1.ScheduleKind.Every,
                everyMs,
                ...(anchorMs !== null ? { anchorMs } : {}),
            };
        }
        case constants_1.ScheduleKind.Cron: {
            const staggerMs = safeFiniteNumberOrNull(schedule.staggerMs);
            return {
                kind: constants_1.ScheduleKind.Cron,
                expr: schedule.expr,
                ...(schedule.tz ? { tz: schedule.tz } : {}),
                ...(staggerMs !== null ? { staggerMs } : {}),
            };
        }
    }
}
function toGatewaySchedule(schedule) {
    switch (schedule.kind) {
        case constants_1.ScheduleKind.At:
            return { kind: constants_1.ScheduleKind.At, at: schedule.at };
        case constants_1.ScheduleKind.Every:
            return {
                kind: constants_1.ScheduleKind.Every,
                everyMs: schedule.everyMs,
                ...(typeof schedule.anchorMs === 'number' ? { anchorMs: schedule.anchorMs } : {}),
            };
        case constants_1.ScheduleKind.Cron:
            return {
                kind: constants_1.ScheduleKind.Cron,
                expr: schedule.expr,
                ...(schedule.tz ? { tz: schedule.tz } : {}),
                ...(typeof schedule.staggerMs === 'number' ? { staggerMs: schedule.staggerMs } : {}),
            };
    }
}
function toGatewayPayload(payload) {
    if (payload.kind === constants_1.PayloadKind.SystemEvent) {
        return {
            kind: constants_1.PayloadKind.SystemEvent,
            text: payload.text,
        };
    }
    return {
        kind: constants_1.PayloadKind.AgentTurn,
        message: payload.message,
        ...(typeof payload.timeoutSeconds === 'number'
            ? { timeoutSeconds: payload.timeoutSeconds }
            : {}),
        ...(payload.model ? { model: payload.model } : {}),
    };
}
function toGatewayDelivery(delivery) {
    console.log('[CronJobService][toGatewayDelivery] input delivery:', JSON.stringify(delivery, null, 2));
    if (!delivery) {
        console.log('[CronJobService][toGatewayDelivery] no delivery, returning undefined');
        return undefined;
    }
    if (delivery.mode === constants_1.DeliveryMode.None) {
        // mode='none' means no notification; send a clean { mode: 'none' } patch.
        // The gateway patch-merges delivery and cannot clear a previously-set
        // channel/to, but mapGatewayJob strips any residual target on the way back
        // so the UI never surfaces a notification target for none-mode tasks.
        const result = { mode: constants_1.DeliveryMode.None };
        console.log('[CronJobService][toGatewayDelivery] mode=none, cleared channel/to:', JSON.stringify(result));
        return result;
    }
    // Translate logical UI channel names to OpenClaw channel names.
    // e.g. 'popo' (UI/config key) → 'moltbot-popo' (OpenClaw plugin name).
    const openclawChannel = delivery.channel
        ? (() => {
            const platform = platform_1.PlatformRegistry.platformOfChannel(delivery.channel);
            return platform ? platform_1.PlatformRegistry.channelOf(platform) : delivery.channel;
        })()
        : undefined;
    const result = {
        mode: delivery.mode,
        ...(openclawChannel ? { channel: openclawChannel } : {}),
        ...(delivery.to ? { to: delivery.to } : {}),
        ...(delivery.accountId ? { accountId: delivery.accountId } : {}),
        ...(typeof delivery.bestEffort === 'boolean' ? { bestEffort: delivery.bestEffort } : {}),
    };
    console.log('[CronJobService][toGatewayDelivery] output gatewayDelivery:', JSON.stringify(result, null, 2));
    return result;
}
function mapGatewayTaskState(state, deliveryMode) {
    let lastStatus = state.runningAtMs
        ? constants_1.TaskStatus.Running
        : mapGatewayResultStatus(state.lastRunStatus ?? state.lastStatus);
    // When delivery.mode is "none" and the gateway reports an error that is
    // purely a delivery failure, downgrade to success.
    if (lastStatus === constants_1.TaskStatus.Error &&
        deliveryMode === constants_1.DeliveryMode.None &&
        isDeliveryOnlyError({
            status: state.lastRunStatus ?? state.lastStatus,
            error: state.lastError,
            deliveryError: state.lastDeliveryError,
            deliveryStatus: state.lastDeliveryStatus,
        })) {
        lastStatus = constants_1.TaskStatus.Success;
    }
    return {
        nextRunAtMs: safeFiniteNumberOrNull(state.nextRunAtMs),
        lastRunAtMs: safeFiniteNumberOrNull(state.lastRunAtMs),
        lastStatus,
        lastError: lastStatus === constants_1.TaskStatus.Success ? null : (state.lastError ?? null),
        lastDurationMs: safeFiniteNumberOrNull(state.lastDurationMs),
        runningAtMs: safeFiniteNumberOrNull(state.runningAtMs),
        consecutiveErrors: safeFiniteNumber(state.consecutiveErrors ?? 0, 0),
    };
}
/**
 * Maps a non-`none` gateway delivery onto the UI model, inferring channel/to
 * from `sessionKey` when the gateway job has no explicit delivery target
 * (common for agent-initiated cron.add tasks). Callers must handle
 * `mode === 'none'` separately so stale gateway-retained targets are stripped.
 */
function mapGatewayDeliveryTarget(delivery, sessionKey) {
    let inferredChannel;
    let inferredTo;
    if (!delivery.channel && sessionKey) {
        const parsed = (0, openclawChannelSessionSync_1.parseChannelSessionKey)(sessionKey);
        if (parsed) {
            const channelName = platform_1.PlatformRegistry.channelOf(parsed.platform);
            if (channelName) {
                inferredChannel = channelName;
                inferredTo = parsed.conversationId;
            }
        }
    }
    return {
        mode: delivery.mode,
        ...(delivery.channel || inferredChannel
            ? { channel: delivery.channel ?? inferredChannel }
            : {}),
        ...(delivery.to || inferredTo ? { to: delivery.to ?? inferredTo } : {}),
        ...(delivery.accountId ? { accountId: delivery.accountId } : {}),
        ...(typeof delivery.bestEffort === 'boolean' ? { bestEffort: delivery.bestEffort } : {}),
    };
}
function mapGatewayJob(job) {
    const delivery = job.delivery ?? { mode: constants_1.DeliveryMode.None };
    // mode='none' means no notification. The gateway patch-merges delivery on
    // cron.update and cannot clear a previously-set channel/to, so a job that was
    // switched to "不通知" still carries the stale target on subsequent reads.
    // Strip any residual channel/to/accountId here so update/list/get/refresh
    // all surface a clean { mode: 'none' } to the UI. This is the single
    // chokepoint for gateway→UI job mapping, so it covers every read path.
    const mappedDelivery = delivery.mode === constants_1.DeliveryMode.None
        ? { mode: constants_1.DeliveryMode.None }
        : mapGatewayDeliveryTarget(delivery, job.sessionKey);
    return {
        id: job.id,
        name: job.name,
        description: job.description ?? '',
        enabled: job.enabled,
        schedule: mapGatewaySchedule(job.schedule),
        sessionTarget: job.sessionTarget,
        wakeMode: job.wakeMode,
        payload: job.payload.kind === constants_1.PayloadKind.SystemEvent
            ? { kind: constants_1.PayloadKind.SystemEvent, text: job.payload.text }
            : {
                kind: constants_1.PayloadKind.AgentTurn,
                message: job.payload.message,
                ...(typeof job.payload.timeoutSeconds === 'number'
                    ? { timeoutSeconds: job.payload.timeoutSeconds }
                    : {}),
                ...(job.payload.model ? { model: job.payload.model } : {}),
            },
        delivery: mappedDelivery,
        agentId: job.agentId ?? null,
        sessionKey: job.sessionKey ?? null,
        state: mapGatewayTaskState(job.state, delivery.mode),
        createdAt: new Date(safeFiniteNumber(job.createdAtMs, Date.now())).toISOString(),
        updatedAt: new Date(safeFiniteNumber(job.updatedAtMs, Date.now())).toISOString(),
    };
}
function mapGatewayRun(entry) {
    let status = entry.action && entry.action !== 'finished'
        ? constants_1.TaskStatus.Running
        : (mapGatewayResultStatus(entry.status) ?? constants_1.TaskStatus.Error);
    // Suppress delivery-only errors: the agent turn succeeded but the
    // gateway conflated a delivery failure with the job status.
    if (status === constants_1.TaskStatus.Error &&
        isDeliveryOnlyError({
            status: entry.status,
            error: entry.error,
            deliveryError: entry.deliveryError,
            deliveryStatus: entry.deliveryStatus,
        })) {
        status = constants_1.TaskStatus.Success;
    }
    const tsMs = safeFiniteNumber(entry.runAtMs ?? entry.ts, Date.now());
    return {
        id: `${entry.jobId}-${entry.ts}`,
        taskId: entry.jobId,
        sessionId: entry.sessionId ?? null,
        sessionKey: entry.sessionKey ?? null,
        status,
        startedAt: new Date(tsMs).toISOString(),
        finishedAt: status === constants_1.TaskStatus.Running
            ? null
            : new Date(safeFiniteNumber(entry.ts, tsMs)).toISOString(),
        durationMs: safeFiniteNumberOrNull(entry.durationMs),
        error: status === constants_1.TaskStatus.Success ? null : (entry.error ?? null),
        summary: entry.summary ?? null,
        deliveryError: entry.deliveryError ?? null,
    };
}
/** Extract a short title from a run's summary (first line, trimmed to 30 chars). */
function extractRunTitle(summary) {
    if (!summary)
        return undefined;
    const firstLine = summary.split('\n')[0].trim();
    if (!firstLine)
        return undefined;
    return firstLine.length > 30 ? firstLine.slice(0, 30) + '…' : firstLine;
}
class CronJobService {
    getGatewayClient;
    ensureGatewayReady;
    pollingTimer = null;
    lastKnownStates = new Map();
    lastKnownRunAtMs = new Map();
    polling = false;
    firstPollDone = false;
    /** Synchronous jobId → name cache, populated during polling. */
    jobNameCache = new Map();
    /** Synchronous jobId → delivery routing cache, populated during polling.
     *  Used by channel session sync to decide whether a cron run needs a local
     *  "[定时]" session or delivers into an IM conversation instead. */
    jobDeliveryCache = new Map();
    /** Job IDs currently running (non-null `runningAtMs`), updated during polling. */
    runningJobIds = new Set();
    /** Keep the fast poll cadence until this timestamp (set by manual runs). */
    fastPollUntilMs = 0;
    /** Closed lid: this Mac is suspended. The local engine is the only runner, so no job starts. */
    lidClosed = false;
    setLidClosed(closed) {
        this.lidClosed = closed;
        if (closed && this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
        if (!closed && this.polling && !this.pollingTimer) {
            this.scheduleNextPoll();
        }
    }
    static POLL_INTERVAL_MS = 15_000;
    /** Faster cadence while a job is running so status changes land quickly. */
    static ACTIVE_POLL_INTERVAL_MS = 3_000;
    /** Fast-poll window after a manual trigger, covering the gap before the
     *  gateway reports the job as running. */
    static MANUAL_RUN_BOOST_MS = 30_000;
    constructor(deps) {
        this.getGatewayClient = deps.getGatewayClient;
        this.ensureGatewayReady = deps.ensureGatewayReady;
    }
    /**
     * Look up a job name synchronously from the polling cache.
     * Returns the job name if known, or null if the cache hasn't been populated yet.
     */
    getJobNameSync(jobId) {
        return this.jobNameCache.get(jobId) ?? null;
    }
    /**
     * Look up a job's delivery routing synchronously from the polling cache.
     * Returns null if the cache hasn't been populated yet.
     */
    getJobDeliverySync(jobId) {
        return this.jobDeliveryCache.get(jobId) ?? null;
    }
    cacheJobDelivery(jobId, delivery) {
        this.jobDeliveryCache.set(jobId, {
            mode: delivery?.mode ?? constants_1.DeliveryMode.None,
            ...(delivery?.channel ? { channel: delivery.channel } : {}),
        });
    }
    hasRunningJobs() {
        return this.runningJobIds.size > 0;
    }
    async client() {
        let client = this.getGatewayClient();
        if (!client) {
            await this.ensureGatewayReady();
            client = this.getGatewayClient();
        }
        if (!client) {
            throw new Error('The engine is unavailable for scheduled tasks.');
        }
        return client;
    }
    async listGatewayJobs(params = {}) {
        const client = await this.client();
        const result = await client.request('cron.list', {
            includeDisabled: true,
            limit: 200,
            ...params,
        });
        return Array.isArray(result.jobs) ? result.jobs : [];
    }
    async addJob(input) {
        console.log('[CronJobService][addJob] full input:', JSON.stringify(input, null, 2));
        console.log('[CronJobService][addJob] delivery details:', JSON.stringify({
            deliveryMode: input.delivery?.mode,
            deliveryChannel: input.delivery?.channel,
            deliveryTo: input.delivery?.to,
            deliveryAccountId: input.delivery?.accountId,
            sessionTarget: input.sessionTarget,
            sessionKey: input.sessionKey,
        }, null, 2));
        const client = await this.client();
        const gatewayDelivery = toGatewayDelivery(input.delivery);
        console.log('[CronJobService][addJob] resolved gatewayDelivery:', JSON.stringify(gatewayDelivery));
        const job = await client.request('cron.add', {
            name: input.name,
            description: input.description || undefined,
            enabled: input.enabled,
            schedule: toGatewaySchedule(input.schedule),
            sessionTarget: input.sessionTarget,
            wakeMode: input.wakeMode,
            payload: toGatewayPayload(input.payload),
            ...(gatewayDelivery ? { delivery: gatewayDelivery } : {}),
            ...(input.agentId?.trim() ? { agentId: input.agentId.trim() } : {}),
            ...(input.sessionKey?.trim() ? { sessionKey: input.sessionKey.trim() } : {}),
        });
        const mapped = mapGatewayJob(job);
        this.jobNameCache.set(mapped.id, mapped.name);
        this.cacheJobDelivery(mapped.id, mapped.delivery);
        console.log('[CronJobService][addJob] created job id:', mapped.id, 'name:', mapped.name);
        return mapped;
    }
    async updateJob(id, input) {
        console.log('[CronJobService][updateJob] id:', id, 'input:', JSON.stringify(input, null, 2));
        console.log('[CronJobService][updateJob] delivery details:', JSON.stringify({
            deliveryMode: input.delivery?.mode,
            deliveryChannel: input.delivery?.channel,
            deliveryTo: input.delivery?.to,
            deliveryAccountId: input.delivery?.accountId,
            sessionTarget: input.sessionTarget,
            sessionKey: input.sessionKey,
        }, null, 2));
        const client = await this.client();
        const patch = {};
        if (input.name !== undefined)
            patch.name = input.name;
        if (input.description !== undefined) {
            patch.description = input.description || undefined;
        }
        if (input.enabled !== undefined)
            patch.enabled = input.enabled;
        if (input.schedule !== undefined)
            patch.schedule = toGatewaySchedule(input.schedule);
        if (input.sessionTarget !== undefined)
            patch.sessionTarget = input.sessionTarget;
        if (input.wakeMode !== undefined)
            patch.wakeMode = input.wakeMode;
        if (input.payload !== undefined)
            patch.payload = toGatewayPayload(input.payload);
        if (input.delivery !== undefined)
            patch.delivery = toGatewayDelivery(input.delivery) ?? { mode: constants_1.DeliveryMode.None };
        if (input.agentId !== undefined)
            patch.agentId = input.agentId?.trim() || null;
        if (input.sessionKey !== undefined)
            patch.sessionKey = input.sessionKey?.trim() || null;
        console.log('[CronJobService][updateJob] final patch:', JSON.stringify(patch, null, 2));
        const job = await client.request('cron.update', { id, patch });
        const mapped = mapGatewayJob(job);
        this.jobNameCache.set(mapped.id, mapped.name);
        this.cacheJobDelivery(mapped.id, mapped.delivery);
        console.log('[CronJobService][updateJob] updated job id:', mapped.id, 'name:', mapped.name);
        return mapped;
    }
    async removeJob(id) {
        const client = await this.client();
        await client.request('cron.remove', { id });
        this.lastKnownStates.delete(id);
        this.lastKnownRunAtMs.delete(id);
        this.jobNameCache.delete(id);
        this.jobDeliveryCache.delete(id);
    }
    async listJobs() {
        const jobs = await this.listGatewayJobs();
        return jobs.filter(job => !isInternalScheduledTaskJob(job)).map(mapGatewayJob);
    }
    async getJob(id) {
        const raw = await this.getJobRaw(id);
        if (raw && isInternalScheduledTaskJob(raw))
            return null;
        return raw ? mapGatewayJob(raw) : null;
    }
    async getJobRaw(id) {
        try {
            const jobs = await this.listGatewayJobs({
                query: id,
                limit: 20,
            });
            return jobs.find(job => job.id === id) ?? null;
        }
        catch {
            return null;
        }
    }
    async toggleJob(id, enabled) {
        const client = await this.client();
        const job = await client.request('cron.update', { id, patch: { enabled } });
        return mapGatewayJob(job);
    }
    async runJob(id) {
        if (this.lidClosed)
            return;
        const client = await this.client();
        await client.request('cron.run', { id });
        // The gateway enqueues the run and returns immediately. Poll right away
        // and keep a fast cadence briefly so renderers see the running state and
        // the finished run without waiting for the regular poll interval.
        this.fastPollUntilMs = Date.now() + CronJobService.MANUAL_RUN_BOOST_MS;
        void this.pollOnce().finally(() => this.scheduleNextPoll());
    }
    async listRuns(jobId, limit = 20, offset = 0, filter) {
        const job = await this.getJobRaw(jobId);
        if (job && isInternalScheduledTaskJob(job))
            return [];
        const client = await this.client();
        const visibleLimit = normalizeRunPageNumber(limit);
        const visibleOffset = normalizeRunPageNumber(offset);
        if (visibleLimit === 0)
            return [];
        const visibleRuns = [];
        let skippedVisible = 0;
        let rawOffset = 0;
        const pageSize = getGatewayRunPageSize(visibleLimit);
        logGatewayRunPageClamp('job', visibleLimit, visibleOffset, pageSize);
        while (visibleRuns.length < visibleLimit) {
            const requestLimit = getGatewayRunRequestLimit(pageSize, visibleLimit - visibleRuns.length);
            const result = await client.request('cron.runs', {
                scope: 'job',
                id: jobId,
                limit: requestLimit,
                offset: rawOffset,
                sortDir: 'desc',
                ...(filter?.startDate && { startMs: new Date(filter.startDate + 'T00:00:00').getTime() }),
                ...(filter?.endDate && { endMs: new Date(filter.endDate + 'T23:59:59').getTime() }),
            });
            const entries = Array.isArray(result.entries) ? result.entries : [];
            if (entries.length === 0)
                break;
            for (const entry of entries) {
                const run = mapGatewayRun(entry);
                if (!matchesRunFilter(run, filter))
                    continue;
                if (skippedVisible < visibleOffset) {
                    skippedVisible += 1;
                    continue;
                }
                visibleRuns.push(run);
                if (visibleRuns.length >= visibleLimit)
                    break;
            }
            rawOffset += entries.length;
            if (entries.length < requestLimit)
                break;
        }
        return visibleRuns;
    }
    async countRuns(jobId) {
        const job = await this.getJobRaw(jobId);
        if (job && isInternalScheduledTaskJob(job))
            return 0;
        const client = await this.client();
        const result = await client.request('cron.runs', {
            scope: 'job',
            id: jobId,
            limit: 0,
        });
        return typeof result.total === 'number' ? result.total : 0;
    }
    async listAllRuns(limit = 20, offset = 0, filter) {
        const client = await this.client();
        const visibleLimit = normalizeRunPageNumber(limit);
        const visibleOffset = normalizeRunPageNumber(offset);
        if (visibleLimit === 0)
            return [];
        let jobs = [];
        try {
            jobs = await this.listGatewayJobs();
        }
        catch {
            jobs = [];
        }
        const internalJobIds = new Set(jobs.filter(job => isInternalScheduledTaskJob(job)).map(job => job.id));
        const nameMap = new Map(jobs.map(job => [job.id, job.name]));
        const visibleRuns = [];
        let skippedVisible = 0;
        let rawOffset = 0;
        const pageSize = getGatewayRunPageSize(visibleLimit);
        logGatewayRunPageClamp('all', visibleLimit, visibleOffset, pageSize);
        while (visibleRuns.length < visibleLimit) {
            const requestLimit = getGatewayRunRequestLimit(pageSize, visibleLimit - visibleRuns.length);
            const result = await client.request('cron.runs', {
                scope: 'all',
                limit: requestLimit,
                offset: rawOffset,
                sortDir: 'desc',
                ...(filter?.startDate && { startMs: new Date(filter.startDate + 'T00:00:00').getTime() }),
                ...(filter?.endDate && { endMs: new Date(filter.endDate + 'T23:59:59').getTime() }),
            });
            const entries = Array.isArray(result.entries) ? result.entries : [];
            if (entries.length === 0)
                break;
            for (const entry of entries) {
                if (internalJobIds.has(entry.jobId))
                    continue;
                const run = mapGatewayRun(entry);
                if (!matchesRunFilter(run, filter))
                    continue;
                if (skippedVisible < visibleOffset) {
                    skippedVisible += 1;
                    continue;
                }
                visibleRuns.push({ entry, run });
                if (visibleRuns.length >= visibleLimit)
                    break;
            }
            rawOffset += entries.length;
            if (entries.length < requestLimit)
                break;
        }
        return visibleRuns.map(({ entry, run }) => ({
            ...run,
            taskName: entry.jobName || nameMap.get(entry.jobId) || extractRunTitle(entry.summary) || entry.jobId,
        }));
    }
    startPolling() {
        if (this.polling)
            return;
        this.polling = true;
        if (this.lidClosed)
            return;
        void this.pollOnce().finally(() => this.scheduleNextPoll());
    }
    notifyGatewayReady() {
        if (this.lidClosed) {
            this.polling = true;
            return;
        }
        if (!this.polling) {
            this.startPolling();
            return;
        }
        void this.pollOnce(true).finally(() => this.scheduleNextPoll());
    }
    stopPolling() {
        this.polling = false;
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
        this.lastKnownStates.clear();
        this.lastKnownRunAtMs.clear();
        this.jobNameCache.clear();
        this.jobDeliveryCache.clear();
        this.runningJobIds.clear();
        this.fastPollUntilMs = 0;
        this.firstPollDone = false;
    }
    /**
     * (Re-)arm the poll timer with an adaptive delay: fast while a job is
     * running or a manual run was just triggered, relaxed otherwise.
     */
    scheduleNextPoll() {
        if (!this.polling || this.lidClosed)
            return;
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
        }
        const fast = this.runningJobIds.size > 0 || Date.now() < this.fastPollUntilMs;
        const delay = fast
            ? CronJobService.ACTIVE_POLL_INTERVAL_MS
            : CronJobService.POLL_INTERVAL_MS;
        this.pollingTimer = setTimeout(() => {
            void this.pollOnce().finally(() => this.scheduleNextPoll());
        }, delay);
    }
    async pollOnce(forceFullRefresh = false) {
        if (!this.polling || this.lidClosed)
            return;
        try {
            // await this.ensureGatewayReady();
            const client = this.getGatewayClient();
            if (!client)
                return;
            const result = await client.request('cron.list', {
                includeDisabled: true,
                limit: 200,
            });
            const jobs = Array.isArray(result.jobs) ? result.jobs : [];
            const visibleJobs = jobs.filter(job => !isInternalScheduledTaskJob(job));
            // Refresh jobId → name/delivery caches for synchronous lookups
            // (used by session naming and cron session routing).
            this.jobNameCache.clear();
            this.jobDeliveryCache.clear();
            this.runningJobIds.clear();
            for (const job of jobs) {
                this.jobNameCache.set(job.id, job.name);
                this.cacheJobDelivery(job.id, job.delivery);
                if (job.state.runningAtMs) {
                    this.runningJobIds.add(job.id);
                }
            }
            for (const job of visibleJobs) {
                const stateHash = JSON.stringify(job.state);
                const previousHash = this.lastKnownStates.get(job.id);
                if (previousHash !== stateHash) {
                    this.lastKnownStates.set(job.id, stateHash);
                    if (previousHash !== undefined) {
                        const task = mapGatewayJob(job);
                        this.emitStatusUpdate(task.id, task.state);
                    }
                }
                const lastRunAtMs = job.state.lastRunAtMs ?? 0;
                const previousRunAtMs = this.lastKnownRunAtMs.get(job.id) ?? 0;
                if (lastRunAtMs > previousRunAtMs && previousRunAtMs > 0) {
                    try {
                        const runs = await this.listRuns(job.id, 1, 0);
                        if (runs[0]) {
                            const task = mapGatewayJob(job);
                            this.emitRunUpdate({ ...runs[0], taskName: task.name });
                        }
                    }
                    catch {
                        // Ignore run fetch failures during polling.
                    }
                }
                this.lastKnownRunAtMs.set(job.id, lastRunAtMs);
            }
            const currentIds = new Set(visibleJobs.map(job => job.id));
            for (const knownId of this.lastKnownStates.keys()) {
                if (!currentIds.has(knownId)) {
                    this.lastKnownStates.delete(knownId);
                    this.lastKnownRunAtMs.delete(knownId);
                }
            }
            if (forceFullRefresh || !this.firstPollDone) {
                this.firstPollDone = true;
                this.emitFullRefresh();
            }
        }
        catch (error) {
            console.warn('[CronJobService] Polling error:', error);
        }
    }
    emitStatusUpdate(taskId, state) {
        electron_1.BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send(constants_1.IpcChannel.StatusUpdate, { taskId, state });
            }
        });
    }
    emitRunUpdate(run) {
        electron_1.BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send(constants_1.IpcChannel.RunUpdate, { run });
            }
        });
    }
    emitFullRefresh() {
        electron_1.BrowserWindow.getAllWindows().forEach(window => {
            if (!window.isDestroyed()) {
                window.webContents.send(constants_1.IpcChannel.Refresh);
            }
        });
    }
}
exports.CronJobService = CronJobService;
//# sourceMappingURL=cronJobService.js.map