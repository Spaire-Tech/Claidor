import { DEFAULT_CURSOR_BACKEND_URL } from "../../../shared/node/cursor-token.js";

export const SAND_DEV_XUSER_SHARING_ENV = "SAND_DEV_XUSER_SHARING";
export const SAND_XUSER_SHARING_ALLOW_PROD_ENV = "SAND_XUSER_SHARING_ALLOW_PROD";
// Simeon Labs' server is the production relay since 25 September 2026
// (`server/polar/sand/sharing.py`); a dev host pointed at it is pointed at
// its own account's rooms, so it is allowed without the opt-in below. The
// refusal stays for Cursor's production origin, whose rooms are not ours.
export const SIMEON_BACKEND_ORIGIN = "https://api.simeonlabs.com";

export interface XuserSharingEnvironment {
  readonly isAllowed: boolean;
  readonly reason?: string;
}

export function isProductionBackendUrl(backendUrl: string): boolean {
  try {
    return new URL(backendUrl).origin === new URL(DEFAULT_CURSOR_BACKEND_URL).origin;
  } catch {
    return true;
  }
}

export function isSimeonBackendUrl(backendUrl: string): boolean {
  try {
    return new URL(backendUrl).origin === SIMEON_BACKEND_ORIGIN;
  } catch {
    return false;
  }
}

export function resolveXuserSharingEnvironment(args: {
  readonly backendUrl: string;
  readonly env?: NodeJS.ProcessEnv;
}): XuserSharingEnvironment {
  const env = args.env ?? process.env;
  const isDevBuild = env.SAND_PACKAGED !== "1" || env.SAND_HOST_DEV_ERROR_DETAIL === "1";
  if (!isDevBuild) return { isAllowed: true };
  if (env[SAND_DEV_XUSER_SHARING_ENV] !== "1") {
    return {
      isAllowed: false,
      reason: `cross-user sharing stays OFF on this dev host: a second live box on the same account drains the account's relay events and corrupts prod room delivery. Set ${SAND_DEV_XUSER_SHARING_ENV}=1 to opt this box in anyway.`,
    };
  }
  if (isSimeonBackendUrl(args.backendUrl)) return { isAllowed: true };
  if (!isProductionBackendUrl(args.backendUrl)) return { isAllowed: true };
  if (env[SAND_XUSER_SHARING_ALLOW_PROD_ENV] === "1") return { isAllowed: true };
  return {
    isAllowed: false,
    reason: `this dev host is pointed at Cursor's PRODUCTION backend; cross-user sharing stays off so it cannot ingest (or steal relay events from) that account's production rooms. Set ${SAND_XUSER_SHARING_ALLOW_PROD_ENV}=1 to opt in deliberately.`,
  };
}
