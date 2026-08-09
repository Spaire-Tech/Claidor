/// <reference types="vite/client" />

interface ImportMetaEnv {
  // The only build-injected values. Everything else is derived (see
  // src/config.ts).
  /** Origin of the Claidor API, e.g. https://api.example.com. Hosted build only. */
  readonly VITE_API_BASE?: string;
  /** Origin of the Claidor web app, for deep links out of the pane. */
  readonly VITE_APP_BASE?: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** "community" selects the open-source BYOK build; unset selects the cloud build. */
  readonly VITE_EDITION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
