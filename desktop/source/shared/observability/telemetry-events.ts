/**
 * The names the engine's events go out under, and the few fixed words that
 * go with them.
 *
 * Every text here is read outside this code, by whatever stores and searches
 * the logs. A name is found there only by its exact text, so none of them
 * changes with the code around it.
 */

/** The key every log entry of the engine is sent under. */
export const SAND_LOG_KEY = "sand";

// The log transport's own events: what it lost, and a shipment that ran out of time.

/** A report of entries lost before they could be delivered: one per reason, with that reason's count so far. */
export const TELEMETRY_DROPPED_EVENT = "sand.telemetry.dropped";

/** Why entries are lost. Reports of losses go out in this order. */
export const TELEMETRY_DROP_REASONS = [
  "ship_failed",
  "overflow_evicted",
  "replay_expired",
  "backend_dropped",
  "account_rotated",
] as const;

export type TelemetryDropReason = (typeof TELEMETRY_DROP_REASONS)[number];

/** What a reason's count is a count of: tries to ship, or entries. */
export const TELEMETRY_DROP_UNIT_BY_REASON: Record<TelemetryDropReason, "attempts" | "entries"> = {
  ship_failed: "attempts",
  overflow_evicted: "entries",
  replay_expired: "entries",
  backend_dropped: "entries",
  account_rotated: "entries",
};

/** Sent once when a run of shipments that ran out of time begins. */
export const TELEMETRY_SHIP_TIMEOUT_EVENT = "sand.telemetry.ship_timeout";

// Lines of the host's and the box's own logs. When the transport's buffer is full these are the first to go.

export const HOST_LOG_EVENT = "sand.host.log";
export const BOX_LOG_EVENT = "sand.box.log";

// A turn, from the person's message to its outcome.

export const USER_MESSAGE_RECEIVED_EVENT = "sand.user_message.received";
export const TURN_START_EVENT = "agent.turn.start";
export const TTFT_EVENT = "sand.ttft";
export const TURN_AWAIT_EVENT = "sand.turn.await";
export const TURN_INTERRUPT_EVENT = "sand.turn.interrupt";
export const TURN_RETRY_EVENT = "sand.turn.retry";
export const CLOSING_SEND_NUDGE_EVENT = "sand.turn.closing_send_nudge";
export const TURN_EMPTY_DELIVERY_EVENT = "sand.turn.empty_delivery";
export const TURN_OUTCOME_EVENT = "agent.turn.outcome";
export const TURN_OUTCOME_DETAIL_EVENT = "sand.turn.outcome_detail";
export const TURN_USAGE_EVENT = "sand.turn.usage";
/** The version of the shape a turn's usage is reported in. */
export const TURN_USAGE_SCHEMA_VERSION = "2";

// Messages on their way in: sent, queued, taken from the queue, acknowledged, and wakes that wait.

export const SEND_DISPATCH_EVENT = "sand.send_dispatch";
export const QUEUE_ACCEPTED_EVENT = "sand.queue.accepted";
export const QUEUE_DEQUEUED_EVENT = "sand.queue.dequeued";
export const QUEUE_WATCHDOG_EVENT = "sand.queue.watchdog";
export const ACK_OBLIGATION_EVENT = "sand.ack.obligation";
export const PENDING_WAKE_EVENT = "sand.pending_wake";

// The agent at work: its tool calls, its failures, and what it brings back to life.

export const AGENT_OPEN_EVENT = "sand.agent.open";
export const AGENT_ERROR_EVENT = "sand.agent.error";
export const AGENT_ERROR_DETAIL_EVENT = "sand.agent.error.detail";
export const TOOL_CALL_STARTED_EVENT = "sand.tool_call.started";
export const TOOL_CALL_STALLED_EVENT = "sand.tool_call.stalled";
export const TOOL_CALL_ERROR_EVENT = "sand.tool_call.error";
export const SUBAGENT_REVIVAL_EVENT = "sand.subagent.revival";
export const SHELL_REVIVAL_EVENT = "sand.shell.revival";
export const COMPUTER_USE_USAGE_EVENT = "sand.computer_use.usage";
export const ATTACHMENT_READ_MISS_EVENT = "sand.attachment.read_miss";
export const ACTION_AUDIT_DROP_EVENT = "sand.action_audit.drop";

// The host process.

export const HOST_STARTUP_EVENT = "sand.host.startup";
export const HOST_LIFECYCLE_EVENT = "sand.host.lifecycle";
export const HOST_UPGRADE_EVENT = "sand.host.upgrade";
export const HOST_EVENT_LOOP_EVENT = "sand.host.event_loop";
export const HOST_EVENT_BUS_EVENT = "sand.host.event_bus";
export const HOST_CRASH_EVENT = "sand.host.crash";
export const HOST_INVARIANT_VIOLATION_EVENT = "sand.host.invariant_violation";
export const HOST_DIAGNOSTIC_EVENT = "sand.host.diagnostic";
export const EXPERIMENTS_DIAGNOSTIC_EVENT = "sand.experiments.diagnostic";
export const CLIENT_RESOURCE_EVENT = "sand.client_resource";
export const JOURNAL_OUTCOME_EVENT = "sand.journal.outcome";
export const INFERENCE_CREDENTIAL_RENEWAL_EVENT = "sand.inference_credential.renewal";

// Commands that come through the gateway.

export const GATEWAY_COMMAND_ERROR_EVENT = "sand.gateway_command_error";
export const GATEWAY_COMMAND_TIMING_EVENT = "sand.gateway_command_timing";

// The box: its start, its processes, and what is carried in and out of it.

export const BOX_BOOT_STAGE_EVENT = "sand.box.boot_stage";
export const BOX_BOOT_FAILURE_EVENT = "sand.box.boot_failure";
export const BOX_IMAGE_CHECK_EVENT = "sand.box.image_check";
export const BOX_RECREATE_DECIDED_EVENT = "sand.box.recreate_decided";
export const HOST_BOOT_FETCH_EVENT = "sand.box.host_boot_fetch";
export const EGRESS_TUNNEL_EVENT = "sand.box.egress_tunnel";
export const DAEMON_PING_EVENT = "sand.box.daemon_ping";
export const EXEC_DAEMON_RESTART_EVENT = "sand.box.exec_daemon_restart";
export const SUPERVISOR_RESTART_EVENT = "sand.box.supervisor_restart";
export const BOX_PROCESS_CRASH_EVENT = "sand.box.process_crash";
export const DESKTOP_HEALTH_EVENT = "sand.box.desktop_health";
export const COOKIE_PERSIST_EVENT = "sand.box.cookie_persist";
export const BOX_LOG_SHIP_EVENT = "sand.box.log_ship";
export const BOX_COPY_IN_EVENT = "sand.box_copy_in";
export const BOX_HELP_EVENT = "sand.box_help";

// The box's store.

export const BOX_STORE_SYNC_EVENT = "sand.box_store_sync";
export const BOX_STORE_DB_CAPTURE_EVENT = "sand.box_store_db_capture";
export const BOX_STORE_MANIFEST_CONFLICT_EVENT = "sand.box_store_manifest_conflict";
export const BOX_STORE_DIAGNOSTIC_EVENT = "sand.box_store.diagnostic";

// The browser: its session, the sites that turn it away, and sign-ins with a security key.

export const CHROME_SESSION_STAGE_EVENT = "sand.chrome_session_stage";
export const BOT_BLOCK_EVENT = "sand.bot_block";
export const BOT_BLOCK_DETAIL_EVENT = "sand.bot_block_detail";
export const WEBAUTHN_PROXY_EVENT = "sand.webauthn_proxy";

/** The kinds of failure a sign-in with a security key is reported as. */
export const WEBAUTHN_SIGN_ERROR_CLASSES = [
  "no_credentials",
  "pin_not_set",
  "pin_blocked",
  "pin_other",
  "cancelled_or_timeout",
  "unsupported_option",
  "hid_error",
  "ambiguous_credential",
  "bad_options",
  "create_unsupported",
  "platform_api",
  "signer_other",
  "helper_spawn_failed",
  "helper_no_result",
] as const;

// Connectors, skills and plugins.

export const CONNECTOR_AUTH_EVENT = "sand.connector_auth";
export const MCP_AUTH_CLEANUP_EVENT = "sand.mcp_auth_cleanup";
export const MCP_DISCOVERY_FAILED_EVENT = "sand.mcp.discovery_failed";
export const MCP_HOST_EDGE_FAILED_EVENT = "sand.mcp.host_edge_failed";
export const SKILL_PUBLISH_EDGE_FAILED_EVENT = "sand.skill_publish.edge_failed";
export const PLUGIN_SKILLS_SYNC_EVENT = "sand.plugin_skills.sync";
export const MANAGED_SETUP_LOAD_FAILED_EVENT = "sand.managed_setup.load_failed";

// Automations, automatic reviews and taught recordings.

export const AUTOMATION_LIFECYCLE_EVENT = "sand.automation.lifecycle";
export const AUTOMATION_SHADOW_PRUNE_EVENT = "sand.automation.shadow_prune";
export const AUTOMATION_CLOUD_SYNC_EVENT = "sand.automation.cloud_sync";
export const AUTO_REVIEW_DISPLAY_RECHECK_FAILED_EVENT = "sand.auto_review.display_recheck_failed";
export const AUTO_REVIEW_EXPIRE_SWEEP_FAILED_EVENT = "sand.auto_review.expire_sweep_failed";
export const TEACH_RECORDING_START_FAILED_EVENT = "sand.teach.recording_start_failed";
export const TEACH_RECORDING_CAP_STOP_FAILED_EVENT = "sand.teach.cap_stop_failed";

// Sessions, conversations, search and memory.

export const SESSION_STORE_DB_EVENT = "sand.session.store_db";
export const SESSION_MAINTENANCE_EVENT = "sand.session.maintenance";
export const SESSION_MATERIALIZE_EVENT = "sand.session.materialize";
export const SESSION_SUMMARY_BUILD_EVENT = "sand.session.summary_build";
export const CONVERSATION_GC_EVENT = "sand.conversation.gc";
export const SEARCH_INDEX_HEALTH_EVENT = "sand.search_index.health";
export const MEMORY_SYNTHESIS_EVENT = "sand.memory.synthesis";

// Commands run on the person's own machine.

export const LOCAL_EXEC_PROVIDER_EVENT = "sand.local_exec.provider";
export const LOCAL_EXEC_REFUSED_EVENT = "sand.local_exec.refused";
export const LOCAL_EXEC_FAILED_EVENT = "sand.local_exec.exec_failed";
