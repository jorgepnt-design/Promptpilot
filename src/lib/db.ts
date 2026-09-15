/**
 * Dauerhafte Speicherung in IndexedDB.
 *
 * Grundsätze:
 *  - Migrationen legen fehlende Stores/Indizes nur an, sie löschen nie Daten.
 *  - Steht IndexedDB nicht zur Verfügung (privater Modus, eingebettete Vorschau),
 *    fällt die App auf einen Speicher im Arbeitsspeicher zurück. Die Oberfläche
 *    bleibt vollständig bedienbar, weist aber darauf hin, dass nichts gesichert wird.
 */

export const DB_NAME = 'promptpilot'
export const DB_VERSION = 3

export const STORES = {
  prompts: 'prompts',
  categories: 'categories',
  collections: 'collections',
  images: 'images',
  notes: 'notes',
  meta: 'meta',
} as const

export type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null
let memoryMode = false

/** Einfacher Ersatzspeicher, falls IndexedDB blockiert ist. */
const memory: Record<string, Map<string, unknown>> = {
  prompts: new Map(),
  categories: new Map(),
  collections: new Map(),
  images: new Map(),
  notes: new Map(),
  meta: new Map(),
}

export function isMemoryMode(): boolean {
  return memoryMode
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB nicht verfügbar'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION)
    } catch (err) {
      reject(err)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      // Nur anlegen, was fehlt – bestehende Daten bleiben unangetastet.
      if (!db.objectStoreNames.contains(STORES.prompts)) {
        const s = db.createObjectStore(STORES.prompts, { keyPath: 'id' })
        s.createIndex('status', 'status')
        s.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORES.categories)) {
        db.createObjectStore(STORES.categories, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.collections)) {
        db.createObjectStore(STORES.collections, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORES.images)) {
        const s = db.createObjectStore(STORES.images, { keyPath: 'id' })
        s.createIndex('promptId', 'promptId')
      }
      if (!db.objectStoreNames.contains(STORES.notes)) {
        const s = db.createObjectStore(STORES.notes, { keyPath: 'id' })
        s.createIndex('updatedAt', 'updatedAt')
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
    request.onerror = () => reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden'))
    request.onblocked = () => reject(new Error('IndexedDB blockiert'))
  })
}

export async function getDb(): Promise<IDBDatabase | null> {
  if (memoryMode) return null
  if (!dbPromise) {
    dbPromise = openDatabase()
  }
  try {
    return await dbPromise
  } catch {
    memoryMode = true
    dbPromise = null
    return null
  }
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode)
    const req = run(t.objectStore(store))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    t.onabort = () => reject(t.error)
  })
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await getDb()
  if (!db) return Array.from(memory[store].values()) as T[]
  return tx<T[]>(db, store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}

export async function getOne<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await getDb()
  if (!db) return memory[store].get(key) as T | undefined
  return tx<T | undefined>(db, store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}

export async function putOne<T extends { id?: string; key?: string }>(
  store: StoreName,
  value: T,
): Promise<void> {
  const db = await getDb()
  const key = (value.id ?? value.key) as string
  if (!db) {
    memory[store].set(key, value)
    return
  }
  await tx(db, store, 'readwrite', (s) => s.put(value))
}

export async function putMany<T extends { id?: string; key?: string }>(
  store: StoreName,
  values: T[],
): Promise<void> {
  if (!values.length) return
  const db = await getDb()
  if (!db) {
    values.forEach((v) => memory[store].set((v.id ?? v.key) as string, v))
    return
  }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const s = t.objectStore(store)
    values.forEach((v) => s.put(v))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

export async function deleteOne(store: StoreName, key: string): Promise<void> {
  const db = await getDb()
  if (!db) {
    memory[store].delete(key)
    return
  }
  await tx(db, store, 'readwrite', (s) => s.delete(key))
}

export async function deleteMany(store: StoreName, keys: string[]): Promise<void> {
  if (!keys.length) return
  const db = await getDb()
  if (!db) {
    keys.forEach((k) => memory[store].delete(k))
    return
  }
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const s = t.objectStore(store)
    keys.forEach((k) => s.delete(k))
    t.oncomplete = () => resolve()
    t.onerror = () => reject(t.error)
  })
}

export async function clearStore(store: StoreName): Promise<void> {
  const db = await getDb()
  if (!db) {
    memory[store].clear()
    return
  }
  await tx(db, store, 'readwrite', (s) => s.clear())
}

/* ---------- Meta-Store (Einstellungen, Entwürfe, Sync-Zustand) ---------- */

export async function metaGet<T>(key: string): Promise<T | undefined> {
  const rec = await getOne<{ key: string; value: T }>(STORES.meta, key)
  return rec?.value
}

export async function metaSet<T>(key: string, value: T): Promise<void> {
  await putOne(STORES.meta, { key, value } as { key: string; value: T })
}

export async function metaDelete(key: string): Promise<void> {
  await deleteOne(STORES.meta, key)
}

export async function metaAll<T>(prefix: string): Promise<{ key: string; value: T }[]> {
  const all = await getAll<{ key: string; value: T }>(STORES.meta)
  return all.filter((r) => r.key.startsWith(prefix))
}

/** Schätzt den belegten Speicher, sofern der Browser es erlaubt. */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  try {
    const est = await navigator.storage.estimate()
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 }
  } catch {
    return null
  }
}
