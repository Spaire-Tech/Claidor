"use strict";
/**
 * Centralized constants for the scheduledTask module.
 *
 * Every discriminated-union kind value, delivery mode, session target, wake mode,
 * status code, IPC channel name, and magic string lives here as an `as const`
 * object.  Types are derived from these objects so that values and types share
 * a single source of truth.
 *
 * Usage:
 *   import { ScheduleKind, SessionTarget } from './constants';
 *   const s: SessionTarget = SessionTarget.Main;
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationKey = exports.IpcChannel = exports.RunBehavior = exports.InternalTaskMarker = exports.DefaultAgentId = exports.GatewayStatus = exports.ScheduledTaskDataStatus = exports.TaskStatus = exports.BindingKind = exports.OriginKind = exports.WakeMode = exports.SessionTarget = exports.DeliveryChannel = exports.DeliveryMode = exports.PayloadKind = exports.ScheduleKind = void 0;
// ─── Schedule Kind ──────────────────────────────────────────────────────────
exports.ScheduleKind = {
    At: 'at',
    Every: 'every',
    Cron: 'cron',
};
// ─── Payload Kind ───────────────────────────────────────────────────────────
exports.PayloadKind = {
    AgentTurn: 'agentTurn',
    SystemEvent: 'systemEvent',
};
// ─── Delivery Mode ──────────────────────────────────────────────────────────
exports.DeliveryMode = {
    None: 'none',
    Announce: 'announce',
    Webhook: 'webhook',
};
// ─── Delivery Channel (magic values) ────────────────────────────────────────
exports.DeliveryChannel = {
    Last: 'last',
};
// ─── Session Target ─────────────────────────────────────────────────────────
exports.SessionTarget = {
    Main: 'main',
    Isolated: 'isolated',
};
// ─── Wake Mode ──────────────────────────────────────────────────────────────
exports.WakeMode = {
    Now: 'now',
    NextHeartbeat: 'next-heartbeat',
};
// ─── Task Origin Kind ───────────────────────────────────────────────────────
exports.OriginKind = {
    Legacy: 'legacy',
    IM: 'im',
    Cowork: 'cowork',
    Manual: 'manual',
};
// ─── Execution Binding Kind ─────────────────────────────────────────────────
exports.BindingKind = {
    NewSession: 'new_session',
    UISession: 'ui_session',
    IMSession: 'im_session',
    SessionKey: 'session_key',
};
// ─── Task / Run Status ──────────────────────────────────────────────────────
exports.TaskStatus = {
    Success: 'success',
    Error: 'error',
    Skipped: 'skipped',
    Running: 'running',
};
exports.ScheduledTaskDataStatus = {
    Starting: 'starting',
    Loading: 'loading',
    Ready: 'ready',
    Error: 'error',
};
// ─── Gateway Status (OpenClaw wire format) ────────────────────────────────���─
exports.GatewayStatus = {
    Ok: 'ok',
    Error: 'error',
    Skipped: 'skipped',
};
// ─── Default Agent ID ───────────────────────────────────────────────────────
exports.DefaultAgentId = 'main';
// ─── Internal OpenClaw Task Markers ─────────────────────────────────────────
exports.InternalTaskMarker = {
    MemoryCoreManagedDescriptionPrefix: '[managed-by=memory-core',
    MemoryCorePayloadPrefix: '__openclaw_memory_core_',
};
// ─── Policy Run-Behavior Descriptions ───────────────────────────────────────
exports.RunBehavior = {
    newSession: 'Creates a new session on each trigger',
    uiSession: 'Runs within the associated UI session',
    imSession: (platform) => `Triggers and delivers results via ${platform}`,
    sessionKey: 'Runs with an explicit engine session key',
};
// ─── IPC Channels ───────────────────────────────────────────────────────────
exports.IpcChannel = {
    List: 'scheduledTask:list',
    Get: 'scheduledTask:get',
    Create: 'scheduledTask:create',
    Update: 'scheduledTask:update',
    Delete: 'scheduledTask:delete',
    Toggle: 'scheduledTask:toggle',
    RunManually: 'scheduledTask:runManually',
    Stop: 'scheduledTask:stop',
    ListRuns: 'scheduledTask:listRuns',
    CountRuns: 'scheduledTask:countRuns',
    ListAllRuns: 'scheduledTask:listAllRuns',
    ResolveSession: 'scheduledTask:resolveSession',
    ListChannels: 'scheduledTask:listChannels',
    ListChannelConversations: 'scheduledTask:listChannelConversations',
    StatusUpdate: 'scheduledTask:statusUpdate',
    RunUpdate: 'scheduledTask:runUpdate',
    Refresh: 'scheduledTask:refresh',
};
// ─── Migration Keys ─────────────────────────────────────────────────────────
exports.MigrationKey = {
    TasksToOpenclaw: 'scheduled_tasks_migrated_to_openclaw_v1',
    RunsToOpenclaw: 'scheduled_task_runs_migrated_to_openclaw_v1',
};
//# sourceMappingURL=constants.js.map