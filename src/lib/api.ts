/**
 * Anbindung an den eigenen Sync-Dienst (Render).
 *
 * Das Sitzungstoken liegt in der IndexedDB der App, nicht im localStorage –
 * so bleibt alles an einer Stelle und verschwindet mit den übrigen App-Daten,
 * wenn jemand die Websitedaten löscht.
 */

import * as db from './db'

const API_BASE = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')
export const GOOGLE_CLIENT_ID = import.meta.env?.VITE_GOOGLE_CLIENT_ID ?? ''

const TOKEN_KEY = 'sync-token'

export function isSyncConfigured(): boolean {
  return Boolean(API_BASE && GOOGLE_CLIENT_ID)
}

export async function getToken(): Promise<string> {
  return (await db.metaGet<string>(TOKEN_KEY)) ?? ''
}

export async function setToken(token: string): Promise<void> {
  await db.metaSet(TOKEN_KEY, token)
}

export async function clearToken(): Promise<void> {
  await db.metaDelete(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

interface CallOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

export async function api<T>(path: string, opts: CallOptions = {}): Promise<T> {
  if (!API_BASE) throw new ApiError('Für diese App ist kein Abgleich eingerichtet.')
  const { method = 'GET', body, auth = true } = opts

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = await getToken()
    if (!token) throw new ApiError('Nicht angemeldet.', 401)
    headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Der Dienst ist nicht erreichbar.')
  }

  if (res.status === 401) {
    await clearToken()
    throw new ApiError('Die Sitzung ist abgelaufen. Bitte neu anmelden.', 401)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    /* Antwort ohne JSON – wird unten als Fehler behandelt. */
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : '') || 'Der Dienst hat einen Fehler gemeldet.'
    throw new ApiError(message, res.status)
  }

  return data as T
}

/* --------------------------- Google-Anmeldung --------------------------- */

interface GoogleAccounts {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string
        callback: (r: { credential?: string }) => void
        auto_select?: boolean
        cancel_on_tap_outside?: boolean
      }) => void
      renderButton: (el: HTMLElement, options: Record<string, unknown>) => void
      disableAutoSelect: () => void
    }
  }
}

let scriptPromise: Promise<void> | null = null

/** Lädt Googles Anmelde-Bibliothek genau einmal nach. */
export function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    if ((window as unknown as { google?: GoogleAccounts }).google?.accounts?.id) return resolve()
    const el = document.createElement('script')
    el.src = 'https://accounts.google.com/gsi/client'
    el.async = true
    el.defer = true
    el.onload = () => resolve()
    el.onerror = () => {
      scriptPromise = null
      reject(new ApiError('Googles Anmeldedienst konnte nicht geladen werden.'))
    }
    document.head.appendChild(el)
  })
  return scriptPromise
}

/** Zeichnet den Google-Knopf in das übergebene Element. */
export async function renderGoogleButton(
  target: HTMLElement,
  onCredential: (credential: string) => void,
  dark: boolean,
): Promise<void> {
  await loadGoogleScript()
  const g = (window as unknown as { google?: GoogleAccounts }).google
  if (!g?.accounts?.id) throw new ApiError('Googles Anmeldedienst steht nicht bereit.')
  g.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (r) => {
      if (r.credential) onCredential(r.credential)
    },
    cancel_on_tap_outside: true,
  })
  target.innerHTML = ''
  g.accounts.id.renderButton(target, {
    type: 'standard',
    theme: dark ? 'filled_black' : 'outline',
    size: 'large',
    text: 'signin_with',
    shape: 'pill',
    locale: 'de',
  })
}

export function forgetGoogleSession(): void {
  const g = (window as unknown as { google?: GoogleAccounts }).google
  g?.accounts?.id?.disableAutoSelect()
}
