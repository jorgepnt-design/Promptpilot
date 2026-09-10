import type { Category, Collection, Prompt, StoredImage } from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'
import { IMAGE_BUCKET, getSupabase } from './supabase'
import * as db from './db'
import { STORES } from './db'
import { emptyPrompt } from './defaults'
import { newId } from './id'

/**
 * Zwei-Wege-Abgleich zwischen lokaler IndexedDB und Supabase.
 *
 * Regeln:
 *  - Jeder Datensatz trägt user_id; der Zugriffsschutz wird zusätzlich im Backend
 *    per Row Level Security erzwungen (siehe supabase/schema.sql).
 *  - Neuere Änderung gewinnt (updated_at). Wurden beide Seiten seit dem letzten
 *    Abgleich geändert, bleibt die Gegenfassung als zusätzlicher Prompt erhalten.
 *  - Löschungen reisen als Tombstone (deleted_at) mit, damit gelöschte Inhalte
 *    nicht durch ein anderes Gerät zurückkehren.
 *  - Der Abgleich ist wiederholbar: gleiche IDs führen zu Updates, nie zu Dubletten.
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

interface RemotePrompt {
  id: string
  user_id: string
  data: Prompt
  updated_at: string
  deleted_at: string | null
}

function toIso(ms: number): string {
  return new Date(ms).toISOString()
}
function fromIso(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0
}

async function requireSession() {
  const sb = await getSupabase()
  if (!sb) throw new SyncError('Es sind keine Cloud-Zugangsdaten hinterlegt.')
  const { data, error } = await sb.auth.getSession()
  if (error) throw new SyncError(error.message)
  if (!data.session) throw new SyncError('Nicht angemeldet.')
  return { sb, userId: data.session.user.id }
}

export async function syncAll(lastSyncAt: number | null): Promise<SyncResult> {
  if (!navigator.onLine) throw new SyncError('Offline – der Abgleich wird nachgeholt.')
  const { sb, userId } = await requireSession()
  const now = Date.now()

  const [localPrompts, localCats, localCols] = await Promise.all([
    db.getAll<Prompt>(STORES.prompts),
    db.getAll<Category>(STORES.categories),
    db.getAll<Collection>(STORES.collections),
  ])

  /* ---- Kategorien und Sammlungen (einfacher Abgleich nach updated_at) ---- */
  const catStats = await syncSimple(sb, userId, 'categories', localCats, STORES.categories)
  const colStats = await syncSimple(sb, userId, 'collections', localCols, STORES.collections)

  /* ---- Prompts ---- */
  const { data: remoteRows, error } = await sb
    .from('prompts')
    .select('id, user_id, data, updated_at, deleted_at')
    .eq('user_id', userId)
  if (error) throw new SyncError(error.message)

  const remote = new Map<string, RemotePrompt>((remoteRows ?? []).map((r) => [r.id, r as RemotePrompt]))
  const localMap = new Map(localPrompts.map((p) => [p.id, p]))

  const toUpsert: RemotePrompt[] = []
  const toStoreLocally: Prompt[] = []
  let conflicts = 0

  for (const local of localPrompts) {
    const rem = remote.get(local.id)
    const localTs = local.updatedAt
    if (!rem) {
      toUpsert.push({
        id: local.id,
        user_id: userId,
        data: local,
        updated_at: toIso(localTs),
        deleted_at: local.deletedAt ? toIso(local.deletedAt) : null,
      })
      continue
    }
    const remTs = fromIso(rem.updated_at)
    if (localTs > remTs) {
      toUpsert.push({
        id: local.id,
        user_id: userId,
        data: local,
        updated_at: toIso(localTs),
        deleted_at: local.deletedAt ? toIso(local.deletedAt) : null,
      })
    } else if (remTs > localTs) {
      const localChangedSinceSync = lastSyncAt != null && localTs > lastSyncAt
      if (localChangedSinceSync && !local.deletedAt && !rem.deleted_at) {
        // Beide Seiten geändert: beide Fassungen erhalten.
        conflicts++
        const kept = emptyPrompt({
          ...local,
          id: newId(),
          title: `${local.title} (Konflikt, lokale Fassung)`,
          updatedAt: now,
          createdAt: now,
        })
        toStoreLocally.push(kept)
        toUpsert.push({
          id: kept.id,
          user_id: userId,
          data: kept,
          updated_at: toIso(now),
          deleted_at: null,
        })
      }
      toStoreLocally.push(normalizeRemote(rem))
    }
  }

  for (const [id, rem] of remote) {
    if (!localMap.has(id)) toStoreLocally.push(normalizeRemote(rem))
  }

  if (toUpsert.length) {
    const { error: upErr } = await sb.from('prompts').upsert(toUpsert, { onConflict: 'id' })
    if (upErr) throw new SyncError(upErr.message)
  }
  if (toStoreLocally.length) {
    await db.putMany(STORES.prompts, toStoreLocally)
  }

  /* ---- Bilder ---- */
  const images = await db.getAll<StoredImage>(STORES.images)
  let imagesUp = 0
  for (const img of images) {
    if (img.remotePath) continue
    const path = `${userId}/${img.id}`
    const { error: upErr } = await sb.storage
      .from(IMAGE_BUCKET)
      .upload(path, img.blob, { upsert: true, contentType: img.type })
    if (!upErr) {
      await db.putOne(STORES.images, { ...img, remotePath: path })
      imagesUp++
    }
  }

  let imagesDown = 0
  const haveIds = new Set(images.map((i) => i.id))
  const wantedIds = new Set<string>()
  for (const p of toStoreLocally) p.imageIds.forEach((i) => wantedIds.add(i))
  for (const id of wantedIds) {
    if (haveIds.has(id)) continue
    const path = `${userId}/${id}`
    const { data: file, error: dlErr } = await sb.storage.from(IMAGE_BUCKET).download(path)
    if (dlErr || !file) continue
    const owner = toStoreLocally.find((p) => p.imageIds.includes(id))
    await db.putOne(STORES.images, {
      id,
      promptId: owner?.id ?? '',
      name: id,
      type: file.type || 'image/jpeg',
      size: file.size,
      blob: file,
      createdAt: Date.now(),
      remotePath: path,
    } as StoredImage)
    imagesDown++
  }

  return {
    pushed: toUpsert.length + catStats.pushed + colStats.pushed,
    pulled: toStoreLocally.length + catStats.pulled + colStats.pulled,
    conflicts,
    imagesUp,
    imagesDown,
    at: now,
  }
}

function normalizeRemote(rem: RemotePrompt): Prompt {
  return emptyPrompt({
    ...rem.data,
    id: rem.id,
    updatedAt: fromIso(rem.updated_at),
    deletedAt: rem.deleted_at ? fromIso(rem.deleted_at) : null,
  })
}

interface SimpleRecord {
  id: string
  name: string
  updatedAt: number
  deletedAt: number | null
}

async function syncSimple(
  sb: SupabaseClient,
  userId: string,
  table: 'categories' | 'collections',
  local: SimpleRecord[],
  store: (typeof STORES)[keyof typeof STORES],
): Promise<{ pushed: number; pulled: number }> {
  const { data, error } = await sb
    .from(table)
    .select('id, user_id, data, updated_at, deleted_at')
    .eq('user_id', userId)
  if (error) throw new SyncError(error.message)
  const remote = new Map<string, { id: string; data: SimpleRecord; updated_at: string; deleted_at: string | null }>(
    (data ?? []).map((r) => [r.id, r as never]),
  )
  const push: unknown[] = []
  const pull: SimpleRecord[] = []
  for (const rec of local) {
    const rem = remote.get(rec.id)
    if (!rem || fromIso(rem.updated_at) < rec.updatedAt) {
      push.push({
        id: rec.id,
        user_id: userId,
        data: rec,
        updated_at: toIso(rec.updatedAt),
        deleted_at: rec.deletedAt ? toIso(rec.deletedAt) : null,
      })
    } else if (fromIso(rem.updated_at) > rec.updatedAt) {
      pull.push({ ...rem.data, id: rem.id, updatedAt: fromIso(rem.updated_at) })
    }
  }
  const localIds = new Set(local.map((l) => l.id))
  for (const [id, rem] of remote) {
    if (!localIds.has(id)) pull.push({ ...rem.data, id, updatedAt: fromIso(rem.updated_at) })
  }
  if (push.length) {
    const { error: e } = await sb.from(table).upsert(push as never, { onConflict: 'id' })
    if (e) throw new SyncError(e.message)
  }
  if (pull.length) await db.putMany(store, pull as never)
  return { pushed: push.length, pulled: pull.length }
}

/* --------------------------- Anmeldung --------------------------- */

export async function signIn(email: string, password: string) {
  const sb = await getSupabase()
  if (!sb) throw new SyncError('Es sind keine Cloud-Zugangsdaten hinterlegt.')
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new SyncError(uebersetze(error.message))
  return data.user
}

export async function signUp(email: string, password: string) {
  const sb = await getSupabase()
  if (!sb) throw new SyncError('Es sind keine Cloud-Zugangsdaten hinterlegt.')
  const { data, error } = await sb.auth.signUp({ email, password })
  if (error) throw new SyncError(uebersetze(error.message))
  return data.user
}

export async function signOut() {
  const sb = await getSupabase()
  if (!sb) return
  await sb.auth.signOut()
}

export async function currentUser() {
  const sb = await getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getUser()
  return data.user ?? null
}

function uebersetze(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'E-Mail-Adresse oder Passwort stimmt nicht.'
  if (m.includes('already registered')) return 'Für diese E-Mail-Adresse besteht bereits ein Konto.'
  if (m.includes('password')) return 'Das Passwort erfüllt die Anforderungen nicht (mindestens 6 Zeichen).'
  if (m.includes('email')) return 'Bitte eine gültige E-Mail-Adresse eingeben.'
  return message
}
