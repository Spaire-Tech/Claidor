import type { MethodInfoUnary } from "@bufbuild/protobuf";
import { countListenerPlatforms, type ListenerPlatform } from "../../automations/listener-integrations.js";
import { DashboardService } from "../../../packages/proto/generated/aiserver/v1/dashboard_connect.js";
import {
  GetScmConnectionStatusRequest,
  type GetScmConnectionStatusResponse,
  GetSlackInstallUrlRequest,
  type GetSlackInstallUrlResponse,
  GetSlackUserSettingsRequest,
  type GetSlackUserSettingsResponse
} from "../../../packages/proto/generated/aiserver/v1/dashboard_pb.js";
import { createSandCursorBackendClient } from "../../../shared/node/cursor-backend/cursor-inference.js";
import { LISTENERS_COMING_SOON_SENTENCE, isListenerRelayServed } from "../../../shared/listener-availability.js";
import { connectorManifests } from "../../../shared/channels.js";
// Grok Bot sent "Connect" to cursor.com/dashboard?tab=integrations. There is
// no such page for Simeon. Since 25 September 2026 the connect pages are on
// Simeon Labs' server (polar/sand/listeners_connections.py): Slack's is
// what `GetSlackInstallUrl` answers, GitHub's is `GITHUB_INSTALL_PATH` on
// the backend host. This stays null as the fallback when the relay is
// switched off (SAND_LISTENER_RELAY_SERVED=0) or no backend URL is known.
export const DASHBOARD_INTEGRATIONS_URL: string | null = null;
export const SLACK_INSTALL_PATH = "/sand/slack/install";
export const GITHUB_INSTALL_PATH = "/sand/github/install";
export function listenerConnectUrl(platform: ListenerPlatform, backendUrl: string | undefined): string | null {
  if (backendUrl == null || backendUrl.length === 0) return DASHBOARD_INTEGRATIONS_URL;
  return new URL(platform === "slack" ? SLACK_INSTALL_PATH : GITHUB_INSTALL_PATH, backendUrl).toString();
}
export const LISTENER_INTEGRATIONS = [{ platform: "slack" as const }, { platform: "github" as const }];
// The Channels tab draws Coming Soon from `availability`, which the local
// two-field list never carried, so the view failed closed and drew nothing
// (design-audit-ledger.md F-056). The shared manifests are the one list.
export { CONNECTOR_MANIFESTS } from "../../../shared/channels.js";
export interface ListenerDashboardClient { getSlackUserSettings(): Promise<{ hasSlackAuth?: boolean }>; getScmConnectionStatus(): Promise<{ connected?: boolean }>; getSlackInstallUrl(): Promise<{ url: string }> }
export function createListenerIntegrationReads(deps: { readonly auth?: { getAccessToken(args: { backendUrl: string }): Promise<string>; getMachineId(): Promise<string> }; readonly dashboard?: () => ListenerDashboardClient; readonly getBackendUrl?: () => string | undefined; readonly transcript: { listAllAutomationDefinitions(): Promise<readonly { automation: { isEnabled: boolean; trigger: Parameters<typeof countListenerPlatforms>[0][number]["trigger"] } }[]>; getAgentChannels(agentId: string): Promise<readonly { platform: string; [key: string]: unknown }[]> }; readonly sourceStatuses: () => ReadonlyMap<string, { state: string; detail?: string; scopeIssues?: readonly unknown[] }>; readonly log?: (message: string) => void }) {
  const log = deps.log ?? ((message: string) => console.log(`[sand-listener-integrations] ${message}`));
  const dashboard = deps.dashboard ?? (() => {
    if (deps.auth === undefined) throw new TypeError("listener integrations require auth");
    const service = DashboardService as typeof DashboardService & {
      readonly methods: typeof DashboardService.methods & {
        readonly getSlackUserSettings: MethodInfoUnary<GetSlackUserSettingsRequest, GetSlackUserSettingsResponse>;
        readonly getScmConnectionStatus: MethodInfoUnary<GetScmConnectionStatusRequest, GetScmConnectionStatusResponse>;
        readonly getSlackInstallUrl: MethodInfoUnary<GetSlackInstallUrlRequest, GetSlackInstallUrlResponse>;
      };
    };
    const client = createSandCursorBackendClient(service, { getAccessToken: deps.auth.getAccessToken, getMachineId: deps.auth.getMachineId });
    return {
      getSlackUserSettings: () => client.getSlackUserSettings(new GetSlackUserSettingsRequest({})),
      getScmConnectionStatus: () => client.getScmConnectionStatus(new GetScmConnectionStatusRequest({})),
      getSlackInstallUrl: () => client.getSlackInstallUrl(new GetSlackInstallUrlRequest({}))
    };
  });
  const isPlatformConnected = async (platform: ListenerPlatform) => platform === "slack" ? (await dashboard().getSlackUserSettings()).hasSlackAuth === true : (await dashboard().getScmConnectionStatus()).connected === true;
  return { isPlatformConnected, async getIntegrations() { const statuses = deps.sourceStatuses(), counts = countListenerPlatforms((await deps.transcript.listAllAutomationDefinitions()).map((entry) => entry.automation)), read = (platform: ListenerPlatform) => isPlatformConnected(platform).catch((error) => { log(`${platform} connection read degraded to disconnected: ${error instanceof Error ? error.name : typeof error}`); return false; }), [slack, github] = await Promise.all([read("slack"), read("github")]), connected = { slack, github }; return { integrations: LISTENER_INTEGRATIONS.map(({ platform }) => { const status = statuses.get(platform); return { platform, isConnected: connected[platform], state: status?.state ?? "idle", ...(status?.detail == null ? {} : { detail: status.detail }), ...(status?.scopeIssues?.length ? { scopeIssues: status.scopeIssues } : {}), neededByCount: counts[platform] }; }) }; }, async getConnectUrl(platform: ListenerPlatform): Promise<string | null> { if (!isListenerRelayServed()) { log(`${platform} connect refused: ${LISTENERS_COMING_SOON_SENTENCE}`); return DASHBOARD_INTEGRATIONS_URL; } const fallback = listenerConnectUrl(platform, deps.getBackendUrl?.()); if (platform !== "slack") { log(`${platform} connect opens ${fallback ?? "nothing: no backend URL"}`); return fallback; } try { const url = (await dashboard().getSlackInstallUrl()).url || fallback; log(`slack connect opens ${url ?? "nothing: no backend URL"}`); return url; } catch (error) { log(`slack connect falls back to ${fallback ?? "nothing"}: ${error instanceof Error ? error.message : String(error)}`); return fallback; } }, async getAgentChannels(agentId: string) { const manifests = connectorManifests(), known = new Set(manifests.map(({ platform }) => platform)); return { manifests, connections: (await deps.transcript.getAgentChannels(agentId)).filter((connection) => known.has(connection.platform)) }; } };
}
