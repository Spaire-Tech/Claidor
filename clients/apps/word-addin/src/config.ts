/**
 * Runtime configuration for the add-in.
 *
 * A client bundle cannot hold secrets: everything here ships to every user's
 * browser. So the split is by *what varies*, not by secrecy:
 *
 *  - apiBase:      where the Claidor API lives. Injected at build time.
 *  - addinOrigin:  the origin we are served from. Derived at runtime, never
 *                  configured, so it cannot be set wrong.
 *  - supabaseUrl / supabaseAnonKey: the one project identifier + its PUBLIC
 *                  anon key. Injected at build time (Docker build args) so they
 *                  stay out of git history and can be rotated without a code
 *                  change. The anon key is safe in a client (Row Level Security
 *                  is what protects data). The service_role key is a real secret
 *                  and MUST NEVER appear in this repo or the bundle.
 *
 * Upstream hard-coded its own two production hostnames here and chose between
 * them with `import.meta.env.PROD`. Claidor is not deployed yet, so there is no
 * hostname to hard-code and inventing one would only produce a build that fails
 * at runtime rather than at build time. Both bases come from the environment,
 * default to the local development servers, and are checked at boot by
 * `assertConfigured` — a production build with no API host is a configuration
 * error the developer sees immediately.
 */

const apiBase = import.meta.env.VITE_API_BASE ?? (import.meta.env.PROD ? "" : "http://localhost:8000");
// The Claidor web app, for deep-linking back to saved drafts, matters, etc.
const appBase = import.meta.env.VITE_APP_BASE ?? (import.meta.env.PROD ? "" : "http://localhost:3000");

// Build version, injected by Vite (see vite.config.ts `define`). Reported in the
// anonymous BYOK usage ping so we can see which build is in use.
declare const __APP_VERSION__: string;
const appVersion = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";

export const config = {
  apiBase,
  appBase,
  appVersion,
  // Where a new user registers. There is no sign-up inside Word (by design): the
  // login screen sends people here to create an account, then they sign in.
  signupUrl: `${appBase}/auth/signup`,
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? "",
  // The add-in is served from its own origin; derive it rather than configure it.
  addinOrigin: typeof window !== "undefined" ? window.location.origin : "",
} as const;

/** URL of the PKCE redirect page opened inside the Office auth dialog. */
export const authRedirectUrl = `${config.addinOrigin}/auth.html`;

export function assertConfigured(): void {
  // The community (bring-your-own-key) build talks to no server of ours, so it
  // needs the add-in origin and nothing else. VITE_EDITION is a build constant,
  // so this is safe at boot and does not block the community build on missing
  // Supabase config. The hosted build needs an API host: without one every
  // request would resolve against the add-in's own origin and 404.
  const community = import.meta.env.VITE_EDITION === "community";
  const required = community
    ? (["addinOrigin"] as const)
    : (["apiBase", "supabaseUrl", "supabaseAnonKey", "addinOrigin"] as const);
  const missing = required.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Claidor add-in misconfigured. Missing: ${missing.join(", ")}`);
  }
}
