import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type {
  Category,
  Collection,
  Draft,
  ID,
  Note,
  Prompt,
  PromptVersion,
  Settings,
  StoredImage,
  SyncState,
} from '../types'
import * as db from '../lib/db'
import { STORES } from '../lib/db'
import {
  DEFAULT_SETTINGS,
  FALLBACK_CATEGORY_ID,
  buildDefaultCategories,
  buildExamplePrompts,
  emptyNote,
  emptyPrompt,
} from '../lib/defaults'
import { newId } from '../lib/id'
import { buildIndex, normalizeForCompare, type SearchIndex } from '../lib/search'
import { copyText } from '../lib/clipboard'

const MAX_VERSIONS = 30
const SETTINGS_KEY = 'settings'
const DRAFT_PREFIX = 'draft:'

export interface Toast {
  id: string
  message: string
  tone: 'info' | 'success' | 'error'
}

interface StoreValue {
  ready: boolean
  storageWarning: boolean
  prompts: Prompt[]
  categories: Category[]
  collections: Collection[]
  notes: Note[]
  settings: Settings
  index: SearchIndex
  toasts: Toast[]
  manualCopy: string | null
  syncState: SyncState
  syncMessage: string

  notify: (message: string, tone?: Toast['tone']) => void
  dismissToast: (id: string) => void
  setManualCopy: (text: string | null) => void
  setSyncState: (state: SyncState, message?: string) => void

  savePrompt: (prompt: Prompt, opts?: { keepUpdatedAt?: boolean }) => Promise<Prompt>
  getPrompt: (id: ID) => Prompt | undefined
  duplicatePrompt: (id: ID) => Promise<Prompt | undefined>
  toggleFavorite: (id: ID) => Promise<void>
  setStatus: (ids: ID[], status: Prompt['status']) => Promise<void>
  purgePrompts: (ids: ID[]) => Promise<void>
  emptyTrash: () => Promise<void>
  restoreVersion: (id: ID, at: number) => Promise<void>
  copyPrompt: (id: ID, text: string, label?: string) => Promise<void>
  findDuplicates: (prompt: Prompt) => Prompt[]

  addCategory: (name: string) => Promise<Category | null>
  renameCategory: (id: ID, name: string) => Promise<void>
  deleteCategory: (id: ID, moveToId: ID | null) => Promise<void>

  saveNote: (patch: Partial<Note> & { id?: ID }) => Promise<Note>
  deleteNote: (id: ID) => Promise<void>
  toggleNoteFavorite: (id: ID) => Promise<void>

  addCollection: (name: string, description?: string) => Promise<Collection | null>
  renameCollection: (id: ID, name: string, description?: string) => Promise<void>
  deleteCollection: (id: ID) => Promise<void>
  setCollectionsFor: (ids: ID[], collectionId: ID, add: boolean) => Promise<void>

  addTagsTo: (ids: ID[], tags: string[]) => Promise<void>
  renameTag: (oldTag: string, newTag: string) => Promise<void>
  deleteTag: (tag: string) => Promise<void>

  updateSettings: (patch: Partial<Settings>) => Promise<void>
  loadExamples: () => Promise<void>

  saveDraft: (key: string, data: Partial<Prompt>) => Promise<void>
  getDraft: (key: string) => Promise<Draft | undefined>
  clearDraft: (key: string) => Promise<void>

  addImages: (promptId: ID, images: StoredImage[]) => Promise<void>
  getImages: (ids: ID[]) => Promise<StoredImage[]>
  removeImage: (promptId: ID, imageId: ID) => Promise<void>

  replaceAll: (data: {
    prompts: Prompt[]
    categories: Category[]
    collections: Collection[]
    images?: StoredImage[]
  }) => Promise<void>
  mergeIn: (data: {
    prompts: Prompt[]
    categories: Category[]
    collections: Collection[]
    images?: StoredImage[]
  }) => Promise<{ added: number; skipped: number }>
  reload: () => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore muss innerhalb von AppProvider verwendet werden')
  return ctx
}

function snapshot(p: Prompt): PromptVersion {
  return {
    at: p.updatedAt,
    title: p.title,
    body: p.body,
    negative: p.negative,
    description: p.description,
    notes: p.notes,
    tags: [...p.tags],
    categoryId: p.categoryId,
    tool: p.tool,
    language: p.language,
    link: p.link,
  }
}

function contentChanged(a: Prompt, b: Prompt): boolean {
  return (
    a.title !== b.title ||
    a.body !== b.body ||
    a.negative !== b.negative ||
    a.description !== b.description ||
    a.notes !== b.notes ||
    a.tool !== b.tool ||
    a.language !== b.language ||
    a.link !== b.link ||
    a.categoryId !== b.categoryId ||
    a.tags.join('\u0000') !== b.tags.join('\u0000')
  )
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [storageWarning, setStorageWarning] = useState(false)
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [manualCopy, setManualCopy] = useState<string | null>(null)
  const [syncState, setSyncStateRaw] = useState<SyncState>('local')
  const [syncMessage, setSyncMessage] = useState('')
  const promptsRef = useRef<Prompt[]>([])
  promptsRef.current = prompts

  const notify = useCallback((message: string, tone: Toast['tone'] = 'info') => {
    const id = newId()
    setToasts((t) => [...t.slice(-3), { id, message, tone }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const setSyncState = useCallback((state: SyncState, message = '') => {
    setSyncStateRaw(state)
    setSyncMessage(message)
  }, [])

  const load = useCallback(async () => {
    const [storedPrompts, storedCats, storedCols, storedSettings] = await Promise.all([
      db.getAll<Prompt>(STORES.prompts),
      db.getAll<Category>(STORES.categories),
      db.getAll<Collection>(STORES.collections),
      db.metaGet<Settings>(SETTINGS_KEY),
    ])

    let cats = storedCats.filter((c) => !c.deletedAt)
    if (!cats.length) {
      cats = buildDefaultCategories()
      await db.putMany(STORES.categories, cats)
    }

    const merged: Settings = { ...DEFAULT_SETTINGS, ...(storedSettings || {}) }
    setSettings(merged)
    setCategories(cats.sort((a, b) => a.order - b.order))
    setCollections(storedCols.filter((c) => !c.deletedAt))
    const storedNotes = await db.getAll<Note>(STORES.notes)
    setNotes(storedNotes.filter((n) => !n.deletedAt).map((n) => emptyNote(n)))
    // Ältere Datensätze auf das aktuelle Feldschema heben, ohne Inhalte zu verändern.
    setPrompts(storedPrompts.filter((p) => !p.deletedAt).map((p) => emptyPrompt(p)))
    setStorageWarning(db.isMemoryMode())
    setReady(true)
  }, [])

  useEffect(() => {
    load().catch(() => {
      setStorageWarning(true)
      setReady(true)
    })
  }, [load])

  useEffect(() => {
    if (!ready) return
    db.metaSet(SETTINGS_KEY, settings).catch(() => undefined)
  }, [settings, ready])

  const index = useMemo(() => buildIndex(prompts, categories), [prompts, categories])

  /* ---------------- Prompts ---------------- */

  const getPrompt = useCallback((id: ID) => promptsRef.current.find((p) => p.id === id), [])

  const persistPrompts = useCallback(async (updated: Prompt[]) => {
    await db.putMany(STORES.prompts, updated)
    setPrompts((list) => {
      const map = new Map(list.map((p) => [p.id, p]))
      updated.forEach((p) => map.set(p.id, p))
      return Array.from(map.values())
    })
  }, [])

  const savePrompt = useCallback(
    async (prompt: Prompt, opts: { keepUpdatedAt?: boolean } = {}) => {
      const existing = promptsRef.current.find((p) => p.id === prompt.id)
      let next: Prompt = { ...prompt }
      if (existing && contentChanged(existing, prompt)) {
        const versions = [snapshot(existing), ...existing.versions].slice(0, MAX_VERSIONS)
        next.versions = versions
      } else if (existing) {
        next.versions = existing.versions
      }
      if (!opts.keepUpdatedAt) next.updatedAt = Date.now()
      await persistPrompts([next])
      return next
    },
    [persistPrompts],
  )

  const duplicatePrompt = useCallback(
    async (id: ID) => {
      const src = promptsRef.current.find((p) => p.id === id)
      if (!src) return undefined
      const now = Date.now()
      const copy: Prompt = {
        ...src,
        id: newId(),
        title: `${src.title} (Kopie)`,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
        copyCount: 0,
        versions: [],
        imageIds: [],
        isExample: false,
      }
      await persistPrompts([copy])
      return copy
    },
    [persistPrompts],
  )

  const toggleFavorite = useCallback(
    async (id: ID) => {
      const p = promptsRef.current.find((x) => x.id === id)
      if (!p) return
      await persistPrompts([{ ...p, favorite: !p.favorite, updatedAt: Date.now() }])
    },
    [persistPrompts],
  )

  const setStatus = useCallback(
    async (ids: ID[], status: Prompt['status']) => {
      const now = Date.now()
      const updated = promptsRef.current
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          ...p,
          status,
          trashedAt: status === 'trashed' ? now : null,
          updatedAt: now,
        }))
      await persistPrompts(updated)
    },
    [persistPrompts],
  )

  const purgePrompts = useCallback(async (ids: ID[]) => {
    // Tombstones behalten, damit gelöschte Inhalte nicht durch die Cloud zurückkehren.
    const now = Date.now()
    const tombstones = promptsRef.current
      .filter((p) => ids.includes(p.id))
      .map((p) => ({ ...emptyPrompt({ id: p.id }), deletedAt: now, updatedAt: now }))
    await db.putMany(STORES.prompts, tombstones)
    const images = await db.getAll<StoredImage>(STORES.images)
    const imgIds = images.filter((i) => ids.includes(i.promptId)).map((i) => i.id)
    await db.deleteMany(STORES.images, imgIds)
    setPrompts((list) => list.filter((p) => !ids.includes(p.id)))
  }, [])

  const emptyTrash = useCallback(async () => {
    const ids = promptsRef.current.filter((p) => p.status === 'trashed').map((p) => p.id)
    await purgePrompts(ids)
  }, [purgePrompts])

  const restoreVersion = useCallback(
    async (id: ID, at: number) => {
      const p = promptsRef.current.find((x) => x.id === id)
      if (!p) return
      const version = p.versions.find((v) => v.at === at)
      if (!version) return
      const versions = [snapshot(p), ...p.versions].slice(0, MAX_VERSIONS)
      const restored: Prompt = {
        ...p,
        title: version.title,
        body: version.body,
        negative: version.negative,
        description: version.description,
        notes: version.notes,
        tags: [...version.tags],
        categoryId: version.categoryId,
        tool: version.tool,
        language: version.language,
        link: version.link,
        versions,
        updatedAt: Date.now(),
      }
      await persistPrompts([restored])
    },
    [persistPrompts],
  )

  const copyPrompt = useCallback(
    async (id: ID, text: string, label = 'Prompt kopiert') => {
      const result = await copyText(text)
      if (result === 'manual') {
        setManualCopy(text)
        return
      }
      notify(label, 'success')
      const p = promptsRef.current.find((x) => x.id === id)
      if (p) {
        await persistPrompts([
          { ...p, copyCount: p.copyCount + 1, lastUsedAt: Date.now() },
        ])
      }
    },
    [notify, persistPrompts],
  )

  const findDuplicates = useCallback((prompt: Prompt) => {
    const norm = normalizeForCompare(prompt.body)
    if (norm.length < 20) return []
    return promptsRef.current.filter(
      (p) => p.id !== prompt.id && p.status !== 'trashed' && normalizeForCompare(p.body) === norm,
    )
  }, [])

  /* ---------------- Kategorien ---------------- */

  const addCategory = useCallback(
    async (name: string) => {
      const clean = name.trim()
      if (!clean) return null
      if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
        notify('Diese Kategorie gibt es bereits.', 'error')
        return null
      }
      const now = Date.now()
      const cat: Category = {
        id: newId(),
        name: clean,
        order: categories.length,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await db.putOne(STORES.categories, cat)
      setCategories((c) => [...c, cat])
      return cat
    },
    [categories, notify],
  )

  const renameCategory = useCallback(async (id: ID, name: string) => {
    const clean = name.trim()
    if (!clean) return
    const cat = await db.getOne<Category>(STORES.categories, id)
    if (!cat) return
    const next = { ...cat, name: clean, updatedAt: Date.now() }
    await db.putOne(STORES.categories, next)
    setCategories((list) => list.map((c) => (c.id === id ? next : c)))
  }, [])

  const deleteCategory = useCallback(
    async (id: ID, moveToId: ID | null) => {
      const affected = promptsRef.current.filter((p) => p.categoryId === id)
      if (affected.length) {
        const target = moveToId ?? FALLBACK_CATEGORY_ID
        const exists = categories.some((c) => c.id === target)
        const finalTarget = exists ? target : null
        await persistPrompts(
          affected.map((p) => ({ ...p, categoryId: finalTarget, updatedAt: Date.now() })),
        )
      }
      const cat = await db.getOne<Category>(STORES.categories, id)
      if (cat) await db.putOne(STORES.categories, { ...cat, deletedAt: Date.now() })
      setCategories((list) => list.filter((c) => c.id !== id))
    },
    [categories, persistPrompts],
  )

  /* ---------------- Sammlungen ---------------- */

  /* ------------------------------- Notizen ------------------------------- */

  const saveNote = useCallback(async (patch: Partial<Note> & { id?: ID }) => {
    const now = Date.now()
    const vorhanden = patch.id ? await db.getOne<Note>(STORES.notes, patch.id) : undefined
    const next: Note = emptyNote({
      ...(vorhanden ?? {}),
      ...patch,
      title: (patch.title ?? vorhanden?.title ?? '').trim(),
      updatedAt: now,
      createdAt: vorhanden?.createdAt ?? now,
    })
    await db.putOne(STORES.notes, next)
    setNotes((list) => {
      const ohne = list.filter((n) => n.id !== next.id)
      return [next, ...ohne]
    })
    return next
  }, [])

  /** Löschen hinterlässt einen Tombstone, damit der Abgleich es mitbekommt. */
  const deleteNote = useCallback(async (id: ID) => {
    const vorhanden = await db.getOne<Note>(STORES.notes, id)
    if (vorhanden) {
      await db.putOne(STORES.notes, { ...vorhanden, deletedAt: Date.now(), updatedAt: Date.now() })
    }
    setNotes((list) => list.filter((n) => n.id !== id))
  }, [])

  const toggleNoteFavorite = useCallback(async (id: ID) => {
    const vorhanden = await db.getOne<Note>(STORES.notes, id)
    if (!vorhanden) return
    const next = { ...vorhanden, favorite: !vorhanden.favorite, updatedAt: Date.now() }
    await db.putOne(STORES.notes, next)
    setNotes((list) => list.map((n) => (n.id === id ? next : n)))
  }, [])

  const addCollection = useCallback(
    async (name: string, description = '') => {
      const clean = name.trim()
      if (!clean) return null
      const now = Date.now()
      const col: Collection = {
        id: newId(),
        name: clean,
        description,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await db.putOne(STORES.collections, col)
      setCollections((c) => [...c, col])
      return col
    },
    [],
  )

  const renameCollection = useCallback(async (id: ID, name: string, description?: string) => {
    const col = await db.getOne<Collection>(STORES.collections, id)
    if (!col) return
    const next = {
      ...col,
      name: name.trim() || col.name,
      description: description ?? col.description,
      updatedAt: Date.now(),
    }
    await db.putOne(STORES.collections, next)
    setCollections((list) => list.map((c) => (c.id === id ? next : c)))
  }, [])

  const deleteCollection = useCallback(
    async (id: ID) => {
      // Prompts bleiben erhalten, nur die Zuordnung fällt weg.
      const affected = promptsRef.current.filter((p) => p.collectionIds.includes(id))
      if (affected.length) {
        await persistPrompts(
          affected.map((p) => ({
            ...p,
            collectionIds: p.collectionIds.filter((c) => c !== id),
            updatedAt: Date.now(),
          })),
        )
      }
      const col = await db.getOne<Collection>(STORES.collections, id)
      if (col) await db.putOne(STORES.collections, { ...col, deletedAt: Date.now() })
      setCollections((list) => list.filter((c) => c.id !== id))
    },
    [persistPrompts],
  )

  const setCollectionsFor = useCallback(
    async (ids: ID[], collectionId: ID, add: boolean) => {
      const now = Date.now()
      const updated = promptsRef.current
        .filter((p) => ids.includes(p.id))
        .map((p) => ({
          ...p,
          collectionIds: add
            ? Array.from(new Set([...p.collectionIds, collectionId]))
            : p.collectionIds.filter((c) => c !== collectionId),
          updatedAt: now,
        }))
      await persistPrompts(updated)
    },
    [persistPrompts],
  )

  /* ---------------- Tags ---------------- */

  const addTagsTo = useCallback(
    async (ids: ID[], tags: string[]) => {
      const clean = tags.map((t) => t.trim()).filter(Boolean)
      if (!clean.length) return
      const now = Date.now()
      const updated = promptsRef.current
        .filter((p) => ids.includes(p.id))
        .map((p) => ({ ...p, tags: Array.from(new Set([...p.tags, ...clean])), updatedAt: now }))
      await persistPrompts(updated)
    },
    [persistPrompts],
  )

  const renameTag = useCallback(
    async (oldTag: string, newTag: string) => {
      const clean = newTag.trim()
      if (!clean) return
      const now = Date.now()
      const updated = promptsRef.current
        .filter((p) => p.tags.includes(oldTag))
        .map((p) => ({
          ...p,
          tags: Array.from(new Set(p.tags.map((t) => (t === oldTag ? clean : t)))),
          updatedAt: now,
        }))
      await persistPrompts(updated)
    },
    [persistPrompts],
  )

  const deleteTag = useCallback(
    async (tag: string) => {
      const now = Date.now()
      const updated = promptsRef.current
        .filter((p) => p.tags.includes(tag))
        .map((p) => ({ ...p, tags: p.tags.filter((t) => t !== tag), updatedAt: now }))
      await persistPrompts(updated)
    },
    [persistPrompts],
  )

  /* ---------------- Einstellungen, Beispiele ---------------- */

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  const loadExamples = useCallback(async () => {
    const examples = buildExamplePrompts()
    await persistPrompts(examples)
    setSettings((s) => ({ ...s, examplesLoaded: true, onboarded: true }))
    notify(`${examples.length} Beispiel-Prompts geladen`, 'success')
  }, [notify, persistPrompts])

  /* ---------------- Entwürfe ---------------- */

  const saveDraft = useCallback(async (key: string, data: Partial<Prompt>) => {
    await db.metaSet<Draft>(DRAFT_PREFIX + key, { id: key, data, savedAt: Date.now() })
  }, [])

  const getDraft = useCallback(async (key: string) => {
    return db.metaGet<Draft>(DRAFT_PREFIX + key)
  }, [])

  const clearDraft = useCallback(async (key: string) => {
    await db.metaDelete(DRAFT_PREFIX + key)
  }, [])

  /* ---------------- Bilder ---------------- */

  const addImages = useCallback(
    async (promptId: ID, images: StoredImage[]) => {
      if (!images.length) return
      await db.putMany(STORES.images, images)
      const p = promptsRef.current.find((x) => x.id === promptId)
      if (p) {
        await persistPrompts([
          { ...p, imageIds: [...p.imageIds, ...images.map((i) => i.id)], updatedAt: Date.now() },
        ])
      }
    },
    [persistPrompts],
  )

  const getImages = useCallback(async (ids: ID[]) => {
    if (!ids.length) return []
    const all = await Promise.all(ids.map((id) => db.getOne<StoredImage>(STORES.images, id)))
    return all.filter(Boolean) as StoredImage[]
  }, [])

  const removeImage = useCallback(
    async (promptId: ID, imageId: ID) => {
      await db.deleteOne(STORES.images, imageId)
      const p = promptsRef.current.find((x) => x.id === promptId)
      if (p) {
        await persistPrompts([
          { ...p, imageIds: p.imageIds.filter((i) => i !== imageId), updatedAt: Date.now() },
        ])
      }
    },
    [persistPrompts],
  )

  /* ---------------- Import / Ersetzen ---------------- */

  const replaceAll = useCallback(
    async (data: {
      prompts: Prompt[]
      categories: Category[]
      collections: Collection[]
      images?: StoredImage[]
    }) => {
      await db.clearStore(STORES.prompts)
      await db.clearStore(STORES.categories)
      await db.clearStore(STORES.collections)
      await db.clearStore(STORES.images)
      const cats = data.categories.length ? data.categories : buildDefaultCategories()
      await db.putMany(STORES.categories, cats)
      await db.putMany(STORES.collections, data.collections)
      await db.putMany(STORES.prompts, data.prompts)
      if (data.images?.length) await db.putMany(STORES.images, data.images)
      setCategories(cats.sort((a, b) => a.order - b.order))
      setCollections(data.collections)
      setPrompts(data.prompts)
    },
    [],
  )

  const mergeIn = useCallback(
    async (data: {
      prompts: Prompt[]
      categories: Category[]
      collections: Collection[]
      images?: StoredImage[]
    }) => {
      const existingIds = new Set(promptsRef.current.map((p) => p.id))
      const existingBodies = new Map(
        promptsRef.current.map((p) => [normalizeForCompare(p.body) + '|' + p.title.toLowerCase(), p.id]),
      )
      const newCats = data.categories.filter(
        (c) => !categories.some((x) => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase()),
      )
      const newCols = data.collections.filter(
        (c) => !collections.some((x) => x.id === c.id || x.name.toLowerCase() === c.name.toLowerCase()),
      )
      let added = 0
      let skipped = 0
      const toAdd: Prompt[] = []
      for (const p of data.prompts) {
        const key = normalizeForCompare(p.body) + '|' + p.title.toLowerCase()
        if (existingIds.has(p.id) || existingBodies.has(key)) {
          skipped++
          continue
        }
        toAdd.push(p)
        existingIds.add(p.id)
        existingBodies.set(key, p.id)
        added++
      }
      if (newCats.length) await db.putMany(STORES.categories, newCats)
      if (newCols.length) await db.putMany(STORES.collections, newCols)
      if (toAdd.length) await db.putMany(STORES.prompts, toAdd)
      if (data.images?.length) {
        const keep = data.images.filter((i) => toAdd.some((p) => p.id === i.promptId))
        if (keep.length) await db.putMany(STORES.images, keep)
      }
      setCategories((c) => [...c, ...newCats].sort((a, b) => a.order - b.order))
      setCollections((c) => [...c, ...newCols])
      setPrompts((list) => [...list, ...toAdd])
      return { added, skipped }
    },
    [categories, collections],
  )

  const value: StoreValue = {
    ready,
    storageWarning,
    prompts,
    categories,
    collections,
    notes,
    saveNote,
    deleteNote,
    toggleNoteFavorite,
    settings,
    index,
    toasts,
    manualCopy,
    syncState,
    syncMessage,
    notify,
    dismissToast,
    setManualCopy,
    setSyncState,
    savePrompt,
    getPrompt,
    duplicatePrompt,
    toggleFavorite,
    setStatus,
    purgePrompts,
    emptyTrash,
    restoreVersion,
    copyPrompt,
    findDuplicates,
    addCategory,
    renameCategory,
    deleteCategory,
    addCollection,
    renameCollection,
    deleteCollection,
    setCollectionsFor,
    addTagsTo,
    renameTag,
    deleteTag,
    updateSettings,
    loadExamples,
    saveDraft,
    getDraft,
    clearDraft,
    addImages,
    getImages,
    removeImage,
    replaceAll,
    mergeIn,
    reload: load,
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
