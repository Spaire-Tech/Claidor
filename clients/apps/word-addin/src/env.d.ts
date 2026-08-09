/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the API lives. Set per environment at build time. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
