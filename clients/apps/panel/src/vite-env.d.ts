/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_SIGN_IN_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
