/**
 * Where Simeon is, for the iPhone app (8 October 2026).
 *
 * The app is a native shell round the web version of the Simeon window
 * (`desktop/web/`, served at app.simeonlabs.com/app): the shell signs in,
 * keeps the pair in the Keychain, takes notifications and opens links; the
 * page is the window. The founder, 8 October 2026: "we release, then we
 * build our own window gradually then update. for now, even if its in the
 * app store, its just for friends... i do want a working product".
 *
 * Both addresses can be overridden for a build or a dev run
 * (`EXPO_PUBLIC_SIMEON_API`, `EXPO_PUBLIC_SIMEON_APP`), e.g. the stand-in
 * server on the Mac (`cd desktop && npm run web`).
 */

export const DEFAULT_API = "https://api.simeonlabs.com";
export const DEFAULT_APP = "https://app.simeonlabs.com/app";

/**
 * The app's own URL scheme. `simeon` is the Mac app's (it registers it with
 * macOS for its sign-in); the phone's must differ, or a confirm page meant
 * for one would wake the other.
 */
export const URL_SCHEME = "simeon-ios";

/**
 * What the server's sign-in page opens when the person confirms: it builds
 * `<redirectTarget>://app/v1/open` from the scheme the app names (`_deep_link`
 * in `server/simeon/desktop/app_sign_in.py`). The system's sign-in sheet
 * listens for this scheme and closes on it.
 */
export const SIGN_IN_RETURN_URL = `${URL_SCHEME}://app/v1/open`;

export interface ShellConfig {
  /** Simeon Labs' API: the sign-in, the poll, the refresh, the phone's notification registration. */
  readonly api: string;
  /** The window's page, as configured. */
  readonly app: string;
  /** The page's origin: the only one the web view keeps and the only one the pair is handed to. */
  readonly appOrigin: string;
  /** The URL the web view loads: the page, told where the API is when that is not where it would look. */
  readonly pageUrl: string;
}

const httpUrl = (value: string | undefined): URL | null => {
  if (value == null || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch { return null; }
};

const withoutTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

/**
 * Where the page looks for the API when nobody says: `resolveApiBase` in
 * `desktop/web/api.ts`. app.example.com talks to api.example.com; loopback
 * to a developer's API on 8000.
 */
export function apiThePageWouldUse(app: URL): string {
  const host = app.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "http://127.0.0.1:8000";
  if (host.startsWith("app.")) return `${app.protocol}//api.${host.slice("app.".length)}`;
  return `${app.protocol}//api.${host}`;
}

export function resolveShellConfig(env: { readonly api?: string | undefined; readonly app?: string | undefined }): ShellConfig {
  const apiUrl = httpUrl(env.api);
  const appUrl = httpUrl(env.app) ?? new URL(DEFAULT_APP);
  const api = withoutTrailingSlashes(apiUrl?.toString() ?? DEFAULT_API);
  const app = appUrl.toString();
  const page = new URL(app);
  // The page reads `?api=` (http(s) only) before its own guess.
  if (api !== apiThePageWouldUse(page)) page.searchParams.set("api", api);
  return { api, app, appOrigin: page.origin, pageUrl: page.toString() };
}
