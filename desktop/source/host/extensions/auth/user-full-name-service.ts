import { parseJwtPayload } from "../../../shared/node/cursor-token.js";
import { getSandInferenceBackendUrl } from "../../../shared/node/cursor-backend/cursor-inference.js";

export const GET_ME_TIMEOUT_MS = 10_000;
export const USER_NAME_REFRESH_MS = 5 * 60_000;
/** A failed read is not asked again by every turn: once a minute at most. */
export const USER_NAME_RETRY_MS = 60_000;
// Until 25 September 2026 the name was asked of the upstream's DashboardService
// (GetMe), which Simeon Labs' server does not serve, so the agent never
// had it. The profile route answers the box's own credential too
// (`get_desktop_or_box_session`, server/simeon/desktop/auth.py).
export const USER_PROFILE_PATH = "/desktop/api/user/profile";

export function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : undefined;
}

export function displayNameFrom(name: { readonly firstName?: string | undefined; readonly lastName?: string | undefined }): string | undefined {
  const parts = [name.firstName?.trim(), name.lastName?.trim()].filter((part): part is string => part != null && part.length > 0);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export function fullNameFromProfileBody(body: unknown): string | undefined {
  if (body == null || typeof body !== "object") return undefined;
  const record = body as { readonly code?: unknown; readonly data?: unknown };
  if (record.code !== 0 || record.data == null || typeof record.data !== "object") return undefined;
  // What the person asked to be called (the app's name sheet), else the name
  // Google gave. Never `nickname`: the server makes it from the e-mail's local
  // part ("bxss.fall" is "Bxss Fall"), which is not a name (1 October 2026).
  const data = record.data as { readonly preferredName?: unknown; readonly name?: unknown };
  return nonEmpty(typeof data.preferredName === "string" ? data.preferredName : typeof data.name === "string" ? data.name : undefined);
}

async function fetchFullNameOverBackend(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const response = await fetchImpl(new URL(USER_PROFILE_PATH, getSandInferenceBackendUrl()), {
    headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    signal: AbortSignal.timeout(GET_ME_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`profile answered ${response.status}`);
  return fullNameFromProfileBody(await response.json());
}

export function createSandUserFullNameResolver(options: {
  readonly getAccessToken: (options: { readonly backendUrl: string }) => Promise<string>;
  readonly peekAccessToken: () => string | null;
  readonly getMachineId: () => Promise<string>;
  readonly fetchFullName?: (accessToken: string) => Promise<string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly log: (message: string) => void;
  readonly now?: () => number;
}) {
  const fetchFullName = options.fetchFullName ?? ((accessToken: string) => fetchFullNameOverBackend(accessToken, options.fetchImpl));
  let resolvedPrincipal: string | undefined;
  let resolvedFullName: string | undefined;
  let resolvedAtMs = 0;
  let attemptedAtMs = 0;
  const now = options.now ?? Date.now;
  let inFlight: { principal: string; done: Promise<void> } | undefined;
  let inFlightGeneration = 0;
  const currentPrincipal = () => {
    const token = options.peekAccessToken();
    return token == null ? undefined : parseJwtPayload(token)?.sub;
  };
  const resolve = async (principal: string) => {
    attemptedAtMs = now();
    try {
      const accessToken = await options.getAccessToken({ backendUrl: getSandInferenceBackendUrl() });
      if (parseJwtPayload(accessToken)?.sub !== principal) return;
      const fullName = await fetchFullName(accessToken);
      if (currentPrincipal() !== principal) return;
      resolvedPrincipal = principal;
      resolvedFullName = fullName;
      resolvedAtMs = now();
    } catch (error) { options.log(`user full-name resolve failed: ${String(error)}`); }
  };
  return {
    // A name the person changes reaches the next turn after at most
    // `USER_NAME_REFRESH_MS`: a read after that asks the server again.
    getUserFullName(): string | undefined {
      const principal = currentPrincipal();
      if (principal !== undefined && now() - resolvedAtMs >= USER_NAME_REFRESH_MS && now() - attemptedAtMs >= USER_NAME_RETRY_MS) void this.refresh();
      return resolvedPrincipal !== undefined && resolvedPrincipal === principal ? resolvedFullName : undefined;
    },
    async refresh(): Promise<void> {
      const principal = currentPrincipal();
      if (principal === undefined || (resolvedPrincipal === principal && now() - resolvedAtMs < USER_NAME_REFRESH_MS)) return;
      let pending = inFlight;
      if (pending === undefined || pending.principal !== principal) {
        const generation = ++inFlightGeneration;
        pending = { principal, done: resolve(principal).finally(() => { if (inFlightGeneration === generation) inFlight = undefined; }) };
        inFlight = pending;
      }
      await pending.done;
    }
  };
}
