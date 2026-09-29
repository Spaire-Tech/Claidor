// Whether Simeon Labs' server serves apps right now (28 September 2026).
//
// The apps in the catalog (`appsToolkit`) sign in and run through our server
// (`server/simeon/desktop/apps.py`). The first time they shipped, the server
// had not been deployed and every card's sign-in went nowhere. So the
// marketplace asks first: `GET /desktop/api/apps` answering
// `{"available": true}` offers Connect; anything else (a 404 from a server
// that predates the route, a 503 without the provider's key, no network, no
// sign-in) keeps the cards Coming soon, the way Grok Bot only offers Connect
// for what can actually connect.

import { getConfiguredBackendUrl } from "../cursor-token.js";

export const APPS_AVAILABILITY_TTL_MS = 60_000;
export const APPS_AVAILABILITY_TIMEOUT_MS = 5_000;

const cache = new Map<string, { readonly atMs: number; readonly available: boolean }>();

export function appsServiceUrl(backendUrl: string = getConfiguredBackendUrl()): string {
  return new URL("desktop/api/apps", backendUrl.endsWith("/") ? backendUrl : `${backendUrl}/`).toString();
}

export function resetAppsAvailabilityCache(): void {
  cache.clear();
}

export async function isAppsServiceAvailable(args: {
  readonly getAccessToken: () => Promise<unknown>;
  readonly backendUrl?: string;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}): Promise<boolean> {
  const now = args.now ?? Date.now;
  let url: string;
  try {
    url = appsServiceUrl(args.backendUrl);
  } catch {
    return false;
  }
  const cached = cache.get(url);
  if (cached != null && now() - cached.atMs < APPS_AVAILABILITY_TTL_MS) return cached.available;
  let token: unknown = null;
  try {
    token = await args.getAccessToken();
  } catch {
    token = null;
  }
  // Signed out is not an answer about the server; nothing is cached.
  if (typeof token !== "string" || token.length === 0) return false;
  let available = false;
  try {
    const response = await (args.fetch ?? fetch)(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(APPS_AVAILABILITY_TIMEOUT_MS),
    });
    if (response.ok) {
      const body = (await response.json()) as { available?: unknown };
      available = body.available === true;
    }
  } catch {
    available = false;
  }
  cache.set(url, { atMs: now(), available });
  return available;
}
