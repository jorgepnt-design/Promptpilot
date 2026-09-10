/// <reference types="vite/client" />

declare const __BASE_PATH__: string
declare const __SINGLE_FILE__: boolean
declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
