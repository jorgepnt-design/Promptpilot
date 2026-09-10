import type { Category, Collection, Prompt, StoredImage } from '../types'
import * as db from './db'
import { STORES } from './db'
import { emptyPrompt } from './defaults'
import { newId } from './id'
import { ApiError, api, clearToken, forgetGoogleSession, setToken } from './api'

/**
 * Zwei-Wege-Abgleich mit dem eigenen Dienst.
 *
 * Die Regeln entsprechen denen des Servers: neuere Änderung gewinnt, bei
 * gleichzeitiger Änderung bleiben beide Fassungen erhalten, Löschungen reisen
 * als Tombstone mit. Der Server entscheidet, der Client übernimmt das Ergebnis.
 */

export interface SyncResult {
  pushed: number
  pulled: number
  conflicts: number
  imagesUp: number
  imagesDown: number
  at: number
}

export class SyncError extends Error {}

interface SyncResponse {
  prompts: Prompt[]
  categories: Category[]
  collections: Collection[]
  conflicts: Prompt[]
  pushed: number
  pulled: number
  at: number
}

function wrap(e: unknown): SyncError {
  if (e instanceof SyncError) return e
  if (e instanceof ApiError) return new SyncError(e.message)
  // Unerwartetes nicht verschlucken: die Ursache gehört in die Meldung,
  // sonst steht der Nutzer vor einem nichtssagenden "fehlgeschlagen".
  const detail = e instanceof Error ? e.message : String(e)
  console.error('Abgleich fehlgeschlagen:', e)
  return new SyncError(`Der Abgleich ist fehlgeschlagen: ${detail}`)
}

/* ------------------------------ Anmeldung ------------------------------ */

export interface Account {
  email: string
  name: string
}

/** Tauscht Googles Token gegen eine Sitzung bei unserem Dienst. */
export async function signInWithGoogle(credential: string): Promise<Account> {
  try {
    const r = await api<{ token: string; user: Account }>('/api/auth/google', {
      method: 'POST',
      body: { credential },
      auth: false,
    })
    await setToken(r.token)
    return r.user
  } catch (e) {
    throw wrap(e)
  }
}

export async function currentAccount(): Promise<Account | null> {
  try {
    const r = await api<{ user: Account }>('/api/me')
    return r.user
  } catch {
    return null
  }
}

export async function signOut(): Promise<void> {
  await clearToken()
  forgetGoogleSession()
}

/* ------------------------------- Abgleich ------------------------------- */

export async function syncAll(lastSyncAt: number | null): Promise<SyncResult> {
  try {
    return await runSync(lastSyncAt)
  } catch (e) {
    throw wrap(e)
  }
}

async function runSync(lastSyncAt: number | null): Promise<SyncResult> {
  if (!navigator.onLine) throw new SyncError('Offline – der Abgleich wird nachgeholt.')

  const [prompts, categories, collections] = await Promise.all([
    db.getAll<Prompt>(STORES.prompts),
    db.getAll<Category>(STORES.categories),
    db.getAll<Collection>(STORES.collections),
  ])

  const res = await api<SyncResponse>('/api/sync', {
    method: 'POST',
    body: { lastSyncAt, prompts, categories, collections },
  })

  const now = Date.now()

  // Konflikte: die eigene Fassung als zusätzlichen Prompt bewahren, damit
  // nichts stillschweigend verloren geht.
  const conflictCopies: Prompt[] = (res.conflicts ?? []).map((p) =>
    emptyPrompt({
      ...p,
      id: newId(),
      title: `${p.title} (Konflikt, lokale Fassung)`,
      createdAt: now,
      updatedAt: now,
    }),
  )

  if (res.prompts?.length) {
    await db.putMany(STORES.prompts, res.prompts.map((p) => emptyPrompt(p)))
  }
  if (conflictCopies.length) {
    await db.putMany(STORES.prompts, conflictCopies)
  }
  if (res.categories?.length) await db.putMany(STORES.categories, res.categories)
  if (res.collections?.length) await db.putMany(STORES.collections, res.collections)

  const images = await syncImages(res.prompts ?? [])

  return {
    pushed: res.pushed ?? 0,
    pulled: res.pulled ?? 0,
    conflicts: conflictCopies.length,
    imagesUp: images.up,
    imagesDown: images.down,
    at: res.at ?? now,
  }
}

/** Bilder werden getrennt übertragen – nur die, die noch fehlen. */
async function syncImages(pulled: Prompt[]): Promise<{ up: number; down: number }> {
  let up = 0
  let down = 0

  const local = await db.getAll<StoredImage>(STORES.images)
  let remoteIds = new Set<string>()
  try {
    const r = await api<{ ids: string[] }>('/api/images')
    remoteIds = new Set(r.ids)
  } catch {
    return { up, down }
  }

  for (const img of local) {
    if (remoteIds.has(img.id)) continue
    try {
      const base64 = await blobToBase64(img.blob)
      await api('/api/images/' + encodeURIComponent(img.id), {
        method: 'POST',
        body: {
          base64,
          promptId: img.promptId,
          name: img.name,
          type: img.type,
          createdAt: img.createdAt,
        },
      })
      up++
    } catch {
      /* Einzelne Bilder dürfen den Abgleich nicht scheitern lassen. */
    }
  }

  const have = new Set(local.map((i) => i.id))
  const wanted = new Set<string>()
  pulled.forEach((p) => (p.imageIds ?? []).forEach((id) => wanted.add(id)))

  for (const id of wanted) {
    if (have.has(id)) continue
    try {
      const r = await api<{
        promptId: string
        name: string
        type: string
        createdAt: number
        base64: string
      }>('/api/images/' + encodeURIComponent(id))
      const blob = base64ToBlob(r.base64, r.type)
      await db.putOne(STORES.images, {
        id,
        promptId: r.promptId,
        name: r.name,
        type: r.type,
        size: blob.size,
        blob,
        createdAt: r.createdAt,
        remotePath: id,
      } as StoredImage)
      down++
    } catch {
      /* fehlendes Bild ist kein Grund, den Abgleich abzubrechen */
    }
  }

  return { up, down }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string, type: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: type || 'image/jpeg' })
}
