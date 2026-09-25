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

export function isCloudAgentsServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CLOUD_AGENTS_SERVED_ENV]?.trim() === "1";
}

// Cursor's Connect RPC surface (aiserver.v1.*) is not served by Simeon Labs'
// server; a pre-flight that only ever 404s is skipped unless this is set.
export const CONNECT_SERVED_ENV = "SAND_CONNECT_SERVED";
export function isConnectServed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CONNECT_SERVED_ENV]?.trim() === "1";
}

export function isAnyChannelAvailable(manifests: readonly { readonly availability: string }[] = CONNECTOR_MANIFESTS): boolean {
  return manifests.some((manifest) => manifest.availability === "available");
}
