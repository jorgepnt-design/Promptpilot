import type { SupabaseClient } from '@supabase/supabase-js'

const env = (import.meta.env ?? {}) as ImportMetaEnv
const url = env.VITE_SUPABASE_URL?.trim() || ''
const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim() || ''

/**
 * Es werden ausschließlich die beiden öffentlichen Werte verwendet, die für den
 * Browser vorgesehen sind. Der service_role-Key gehört niemals ins Frontend.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey && url.startsWith('http'))
}

let client: SupabaseClient | null = null

/** Der Supabase-Client wird erst geladen, wenn die Synchronisierung wirklich genutzt wird. */
export async function getSupabase(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) return null
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js')
    client = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'promptpilot-auth' },
    })
  }
  return client
}

export const IMAGE_BUCKET = 'prompt-bilder'
