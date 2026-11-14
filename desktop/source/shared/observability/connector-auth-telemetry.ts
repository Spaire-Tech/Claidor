/**
 * What a connector's sign-in may say about itself in the logs.
 *
 * A person can name a connector's server anything, so the name itself never
 * goes out: it is matched against a short list of well-known connectors and
 * goes out as one of those, or as one of two fixed words. The server's id
 * goes out only when it has the shape of an id, and a failure only as its
 * registered labels.
 */
import { brandedId } from "../errors/bounded.js";
import { sandErrorTags, type SandErrorValue } from "../errors/registry.js";

/** The connectors that may be named in the logs, as small letters and digits with nothing between. */
export const KNOWN_CONNECTOR_TAGS = new Set([
  "asana",
  "atlassian",
  "buildkite",
  "confluence",
  "context7",
  "databricks",
  "datadog",
  "deepwiki",
  "dock",
  "figma",
  "filesystem",
  "github",
  "gmail",
  "google",
  "googlecalendar",
  "googledocs",
  "googledrive",
  "googlesheets",
  "googleworkspace",
  "huggingface",
  "jira",
  "linear",
  "memory",
  "notion",
  "playwright",
  "salesforce",
  "sentry",
  "sequentialthinking",
  "slack",
  "stripe",
  "telegram",
  "todoist",
  "zoominfo",
]);

/** What a server with a name that is not on the list goes out as. */
export const OTHER_CONNECTOR_TAG = "other";
/** What a server with no name, or a name with no letter or digit in it, goes out as. */
export const UNKNOWN_CONNECTOR_TAG = "unknown";

/**
 * A server's name as it may go out. Capitals are made small and everything
 * but the letters a to z and the digits is taken out, so "Google Calendar"
 * and "google-calendar" are the same connector; what is left must be on the
 * list, as the list stands when asked.
 */
export function boundedConnectorTag(serverName?: string): string {
  if (serverName === undefined) {
    return UNKNOWN_CONNECTOR_TAG;
  }
  const plainName = serverName.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (plainName.length === 0) {
    return UNKNOWN_CONNECTOR_TAG;
  }
  if (KNOWN_CONNECTOR_TAGS.has(plainName)) {
    return plainName;
  }
  return OTHER_CONNECTOR_TAG;
}

/** One step of a connector's sign-in, as the code that ran it tells it. */
export interface ConnectorAuthReport {
  readonly phase: string;
  readonly outcome: string;
  readonly serverName?: string;
  readonly serverId?: string;
  readonly reauth?: boolean;
  readonly error?: SandErrorValue;
}

/** The outcomes that are logged as warnings; every other is information. */
const WARNING_OUTCOMES: ReadonlySet<string> = new Set(["failed", "timeout"]);

/**
 * A sign-in report as a log entry's level and labels. The labels come in a
 * fixed order: the phase, the connector, the outcome, where it happened, the
 * server's id, whether it was a second sign-in, then the failure's own. A
 * label with nothing to say is still there, holding nothing.
 */
export function connectorAuthTelemetry(report: ConnectorAuthReport, surface: string): { level: "info" | "warn"; metadata: Record<string, string | undefined> } {
  const level = WARNING_OUTCOMES.has(report.outcome) ? "warn" : "info";
  const metadata: Record<string, string | undefined> = {
    phase: report.phase,
    connector: boundedConnectorTag(report.serverName),
    outcome: report.outcome,
    surface,
    server_id: brandedId(report.serverId),
    reauth: report.reauth === undefined ? undefined : String(report.reauth),
  };
  if (report.error !== undefined) {
    // A failure's label with the name of one above takes that one's place, where that one stood.
    Object.assign(metadata, sandErrorTags(report.error));
  }
  return { level, metadata };
}
