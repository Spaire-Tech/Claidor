/**
 * Cloud agents and messaging channels are Coming Soon on Simeon (25
 * September 2026, design-audit-ledger.md cluster `cloud-agents-channels`).
 *
 * A cloud agent is Cursor's BackgroundComposerService (launch, reply,
 * artifacts, the cloud-agent card's link); a messaging channel needs a
 * Slack or Discord connector plus a relay. Simeon Labs' server serves none
 * of it and no connector manifest is `available` (`shared/channels.ts`),
 * so by the founder's rule both are Coming Soon and say so at every reach
 * point: the SendMessage tool does not offer the `cursor-agent` type or
 * the `channel` target and refuses a `secret-request` (its only store is
 * a channel credential), the CloudAgent tool is not built, the brief's
 * cloud-agent sections are off and its disabled section says coming soon
 * instead of "disabled by your team's admin", and the gateway's channel
 * manifests carry `availability` so the Channels tab draws Coming Soon.
 *
 * When the service exists, `SAND_CLOUD_AGENTS_SERVED=1` in the box's
 * environment restores Grok Bot's cloud-agent paths unchanged; channels
 * follow the manifests in `shared/channels.ts`.
 */
import { CONNECTOR_MANIFESTS } from "./channels.js";

export const CLOUD_AGENTS_SERVED_ENV = "SAND_CLOUD_AGENTS_SERVED";

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

export function isAnyChannelAvailable(manifests: readonly { readonly availability: string }[] = CONNECTOR_MANIFESTS): boolean {
  return manifests.some((manifest) => manifest.availability === "available");
}
