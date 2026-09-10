/// <reference types="vite/client" />

declare const __BASE_PATH__: string
declare const __SINGLE_FILE__: boolean
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  /** Adresse des Sync-Dienstes, z. B. https://promptpilot-server.onrender.com */
  readonly VITE_API_URL?: string
  /** OAuth-Client-ID aus der Google Cloud Console. Nicht geheim. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
