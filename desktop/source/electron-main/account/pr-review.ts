import { GetBackgroundComposerUserSettingsRequest } from "../../packages/proto/generated/aiserver/v1/background_composer_pb.js";
import { CloudAgentService, DashboardService } from "../../packages/proto/simeon/v1/services.js";
import { GetTeamAdminSettingsRequest } from "../../packages/proto/generated/aiserver/v1/dashboard_pb.js";
import { createSimeonBackendClient } from "../../shared/node/simeon-backend/simeon-inference.js";
import { getOrCreateMachineId } from "./machine-id.js";

export const PR_REVIEW_REQUEST_TIMEOUT_MS = 10_000;
export type PrReviewDestination = "github" | "graphite" | "reviewApp";
export interface SandPrReviewPreferences { readonly user: PrReviewDestination | undefined; readonly team: PrReviewDestination | undefined }
export type PrReviewAccessTokenReader = (options?: { readonly backendUrl?: string }) => Promise<string>;

export function narrowDestination(mode: number): PrReviewDestination | undefined {
  switch (mode) {
    case 1: return "github";
    case 2: return "graphite";
    case 3: return "reviewApp";
    default: return undefined;
  }
}

export function teamDestination(response: {
  readonly pullRequestPreferences?: { readonly prReviewOpenDestination: number };
  readonly backgroundAgentSettings?: { readonly prReviewOpenDestination: number };
}): PrReviewDestination | undefined {
  return narrowDestination(response.pullRequestPreferences?.prReviewOpenDestination ?? 0)
    ?? narrowDestination(response.backgroundAgentSettings?.prReviewOpenDestination ?? 0);
}

async function fetchUserDestination(getAccessToken: PrReviewAccessTokenReader): Promise<PrReviewDestination | undefined> {
  const client = createSimeonBackendClient(CloudAgentService, {
    getAccessToken,
    getMachineId: () => getOrCreateMachineId(),
  });
  const response = await client.getBackgroundComposerUserSettings(
    new GetBackgroundComposerUserSettingsRequest({}),
    { timeoutMs: PR_REVIEW_REQUEST_TIMEOUT_MS },
  );
  return narrowDestination(response.prReviewOpenDestination ?? 0);
}

async function fetchTeamDestination(getAccessToken: PrReviewAccessTokenReader): Promise<PrReviewDestination | undefined> {
  const client = createSimeonBackendClient(DashboardService, {
    getAccessToken,
    getMachineId: () => getOrCreateMachineId(),
  });
  const response = await (client as unknown as {
    getTeamAdminSettingsOrEmptyIfNotInTeam(request: GetTeamAdminSettingsRequest, options: { readonly timeoutMs: number }): Promise<Parameters<typeof teamDestination>[0]>;
  }).getTeamAdminSettingsOrEmptyIfNotInTeam(
    new GetTeamAdminSettingsRequest({}),
    { timeoutMs: PR_REVIEW_REQUEST_TIMEOUT_MS },
  );
  return teamDestination(response);
}

export async function fetchSandPrReviewPreferences(
  getAccessToken: PrReviewAccessTokenReader,
  ports?: {
    readonly fetchUser: (getAccessToken: PrReviewAccessTokenReader, timeoutMs: number) => Promise<{ readonly prReviewOpenDestination: number }>;
    readonly fetchTeam: (getAccessToken: PrReviewAccessTokenReader, timeoutMs: number) => Promise<Parameters<typeof teamDestination>[0]>;
  }
): Promise<SandPrReviewPreferences> {
  if (ports === undefined) return await Promise.all([fetchUserDestination(getAccessToken), fetchTeamDestination(getAccessToken)]).then(([user, team]) => ({ user, team }));
  const [user, team] = await Promise.all([
    ports.fetchUser(getAccessToken, PR_REVIEW_REQUEST_TIMEOUT_MS).then((response) => narrowDestination(response.prReviewOpenDestination)),
    ports.fetchTeam(getAccessToken, PR_REVIEW_REQUEST_TIMEOUT_MS).then(teamDestination),
  ]);
  return { user, team };
}
