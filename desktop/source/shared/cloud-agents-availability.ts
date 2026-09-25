/**
 * Cloud agents are served, and messaging channels are served (both since
 * 25 September 2026, later the same day; they were Coming Soon that
 * morning, design-audit-ledger.md cluster `cloud-agents-channels`).
 *
 * A cloud agent is Cursor's BackgroundComposerService (launch, reply,
 * artifacts, the cloud-agent card's link); `polar/sand/cloud_agents.py`
 * serves it over the maty queue. A messaging channel is a Discord or Slack
 * connector the box runs itself (`host/extensions/channels/`, no server in
 * the path; docs/product/channels-served.md). The reach points below keep
 * their Coming Soon branch behind the switches: `SAND_CLOUD_AGENTS_SERVED=0`
 * withholds the `cursor-agent` type, the CloudAgent tool and the brief's
 * cloud-agent sections; `SAND_CHANNELS_SERVED=0` (`shared/channels.ts`)
 * withholds the `channel` target and the `secret-request` type, marks every
 * connector manifest coming soon so the Channels tab draws it, and
 * `connectChannel` takes no credential.
 */
import { connectorManifests } from "./channels.js";

export const CLOUD_AGENTS_SERVED_ENV = "SAND_CLOUD_AGENTS_SERVED";

/**
 * Where a cloud agent's page lives, for the card's "open" and the plain
 * link a channel gets. Grok Bot opened `https://cursor.com/agents/<bcId>`;
 * ours is Simeon's dashboard on Vercel. The page itself does not exist
 * yet (needs-web, `docs/product/cloud-agents-served.md`): until it does,
 * the card's conversation in the app is the record of the run.
 */
export const CLOUD_AGENTS_WEB_BASE_ENV = "SAND_CLOUD_AGENTS_WEB_BASE";
export const DEFAULT_CLOUD_AGENTS_WEB_BASE = "https://app.simeonlabs.com";
export function cloudAgentsWebBase(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env[CLOUD_AGENTS_WEB_BASE_ENV]?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_CLOUD_AGENTS_WEB_BASE;
}
export function cloudAgentWebUrl(bcId: string, env: NodeJS.ProcessEnv = process.env): string {
  return new URL(`/agents/${encodeURIComponent(bcId)}`, cloudAgentsWebBase(env)).toString();
}

export const CLOUD_AGENTS_COMING_SOON_SENTENCE =
  "Cloud agents are coming soon in Simeon, so the CloudAgent tool and cloud-agent cards are not available here yet. Never claim you can launch or manage one.";

export const CHANNELS_COMING_SOON_SENTENCE =
  "Messaging channels (Slack, Discord) are coming soon on Simeon: there is no channel to deliver to and no channel credential store to write to yet. Never ask the user to paste a key, token or password into the chat; if the service is a connector, use its connect card instead.";

// On by default since 25 September 2026: `polar/sand/cloud_agents.py`
// serves BackgroundComposerService over the maty queue. "0" turns the
// paths off again.
export function isCloudAgentsServed(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[CLOUD_AGENTS_SERVED_ENV]?.trim();
  if (raw === "0") return false;
  if (raw === "1") return true;
  return isConnectServed(env, "aiserver.v1.BackgroundComposerService");
}

// Which Connect services Simeon Labs' server answers (25 September 2026,
// docs/product/cursor-dependencies-map.md). Until then one switch,
// SAND_CONNECT_SERVED=1, turned every client on at once, and every call
// 404ed on a server that served no Connect RPC at all. Now `polar/sand`
// serves these at the root of the API host and answers `unimplemented`
// for anything else, so a client is served by service name:
//   - unset: the services below;
//   - "1": every service (Grok Bot's own behaviour, for a Cursor backend);
//   - "0": none (the 24 September behaviour);
//   - "a.b.C,d.e.F": exactly those.
// A name that is not a Connect service (Cursor's Statsig bootstrap is a
// REST fetch) is never in the default set.
export const CONNECT_SERVED_ENV = "SAND_CONNECT_SERVED";
export const CONNECT_SERVED_SERVICES: ReadonlySet<string> = new Set([
  "aiserver.v1.GrokBotService",
  "aiserver.v1.BackgroundComposerService",
  "aiserver.v1.DashboardService",
  "aiserver.v1.AutomationsService",
  "aiserver.v1.AiService",
  "agent.v1.AgentService",
]);
export function isConnectServed(env: NodeJS.ProcessEnv = process.env, serviceTypeName?: string): boolean {
  const raw = env[CONNECT_SERVED_ENV]?.trim() ?? "";
  if (raw === "1") return true;
  if (raw === "0") return false;
  if (raw.length > 0) return serviceTypeName == null ? true : raw.split(",").map((name) => name.trim()).includes(serviceTypeName);
  return serviceTypeName == null ? true : CONNECT_SERVED_SERVICES.has(serviceTypeName);
}

export function isAnyChannelAvailable(manifests?: readonly { readonly availability: string }[], env: NodeJS.ProcessEnv = process.env): boolean {
  return (manifests ?? connectorManifests(env)).some((manifest) => manifest.availability === "available");
}
