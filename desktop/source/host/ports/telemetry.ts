/**
 * The words telemetry is reported in, and the telemetry that reports
 * nothing. The lists below are the values a field of a report may hold
 * (the log shipper checks the computer's lines against them, and the host's
 * start is told phase by phase in the order given here), so their words
 * and their order are a contract with whoever reads the reports.
 */
import { errorMessage } from "../../shared/errors.js";

/** An error as a report carries it: its message, and its stack when it has one. */
export function sandErrorDetail(error: unknown): { message: string; stack?: string } {
  const detail: { message: string; stack?: string } = { message: errorMessage(error) };
  if (error instanceof Error && error.stack !== undefined) detail.stack = error.stack;
  return detail;
}

// The computer's start.
export const SAND_BOX_BOOT_STAGES = ["entrypoint_started", "daemon_listening", "desktop_up", "ready"] as const;
export const SAND_BOX_BOOT_FAILURE_STAGES = ["desktop"] as const;
export const SAND_BOX_BOOT_FAILURE_REASONS = ["x_display_timeout"] as const;

// The settings read on a computer for its reports, by name.
export const SAND_BOX_BOOT_ID_ENV = "SAND_BOX_BOOT_ID";
export const SAND_BOX_BOOT_STARTED_AT_MS_ENV = "SAND_BOX_BOOT_STARTED_AT_MS";
export const SAND_BOX_AUTH_ID_ENV = "SAND_BOX_AUTH_ID";
export const SAND_BOX_TENANT_ID_ENV = "SAND_BOX_TENANT_ID";
export const SAND_BOX_STORE_ID_ENV = "SAND_BOX_STORE_ID";
export const SAND_BOX_CLUSTER_ENV = "SAND_BOX_CLUSTER";

/**
 * The tags a computer's reports carry, read from its settings with the
 * space around each taken off. All five are always there, undefined where
 * the setting is not, and an empty setting stays an empty tag.
 */
export function resolveSandBoxIdentityTags(env: NodeJS.ProcessEnv = process.env) {
  return {
    auth_id: env[SAND_BOX_AUTH_ID_ENV]?.trim(),
    tenant_id: env[SAND_BOX_TENANT_ID_ENV]?.trim(),
    box_store_id: env[SAND_BOX_STORE_ID_ENV]?.trim(),
    box_boot_id: env[SAND_BOX_BOOT_ID_ENV]?.trim(),
    cluster: env[SAND_BOX_CLUSTER_ENV]?.trim(),
  };
}

// The host's start: its phases in the order they are gone through, then how the fetch made at that start ended and why.
export const SAND_HOST_LIFECYCLE_PHASES = ["plugin_graph", "identity", "log_catchup", "transcript_read", "ready"] as const;
export const SAND_HOST_BOOT_FETCH_OUTCOMES = ["current", "applied", "fallback", "restore_failed"] as const;
export const SAND_HOST_BOOT_FETCH_REASONS = [
  "current",
  "applied",
  "pointer_unreachable",
  "pointer_malformed",
  "target_vetoed",
  "download_failed",
  "swap_refused",
  "swap_failed_restored",
  "restore_failed",
  "budget_exceeded",
  "unexpected_error",
] as const;

// Why a process on the computer was started again, and how one crashed.
export const SAND_EXEC_DAEMON_RESTART_CAUSES = ["daemon_exited", "startup_listener_timeout", "listener_lost"] as const;
export const SAND_SUPERVISOR_RESTART_CAUSES = ["supervisor_exited", "startup_status_timeout", "status_stale", "gave_up"] as const;
export const SAND_PROCESS_CRASH_BINARIES = ["simeon"] as const;
export const SAND_PROCESS_CRASH_SIGNALS = ["sigill", "sigsegv", "sigabrt", "sigbus", "other"] as const;

// Keeping the browser's cookies (captured, then restored), and the tunnel for outgoing traffic.
export const SAND_COOKIE_PERSIST_PHASES = ["capture", "restore"] as const;
export const SAND_COOKIE_PERSIST_OUTCOMES = ["captured", "ok", "partial", "failed", "empty"] as const;
export const SAND_EGRESS_TUNNEL_OUTCOMES = ["ready", "restart", "startup_timeout", "listener_lost", "stale_port"] as const;

/** Takes anything and does nothing. Every verb of the silent telemetry is this one function. */
const noop = (): void => {};

/** The turn the silent telemetry starts: one object, the same for every turn. */
const silentTurn = { setModel: noop, setRequestId: noop, finalize: noop };

/**
 * The telemetry of a host that reports nothing: every verb the host calls
 * is there and does nothing. The list is the whole surface the shipped
 * host relies on; a verb missing here would throw where it is called.
 */
export function createNoopSandTelemetry() {
  return {
    startTurn: () => silentTurn,
    reportToolCallError: noop,
    reportToolCallStalled: noop,
    reportToolCallStarted: noop,
    reportAgentError: noop,
    reportBotBlock: noop,
    reportDaemonPing: noop,
    reportBoxBootStage: noop,
    reportExecDaemonRestart: noop,
    reportSupervisorRestart: noop,
    reportAutomationRun: noop,
    reportAutomationFireDropped: noop,
    reportAutomationLifecycle: noop,
    reportTurnInterrupt: noop,
    reportTurnAwait: noop,
    reportTurnRetry: noop,
    reportUserMessageReceived: noop,
    reportClosingSendNudge: noop,
    reportSubagentRevival: noop,
    reportShellRevival: noop,
    reportComputerUseUsage: noop,
    reportTtft: noop,
    reportSendDispatch: noop,
    reportQueueAccepted: noop,
    reportQueueDequeued: noop,
    reportQueueWatchdog: noop,
    reportAckObligation: noop,
    reportPendingWake: noop,
    reportTurnUsage: noop,
    reportTurnEmptyDelivery: noop,
    reportJournalOutcome: noop,
    reportAutoReviewExpireSweepFailed: noop,
  };
}
