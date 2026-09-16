export type ID = string

export type PromptStatus = 'active' | 'archived' | 'trashed'

export interface PromptVersion {
  at: number
  title: string
  body: string
  negative: string
  description: string
  notes: string
  tags: string[]
  categoryId: ID | null
  tool: string
  language: string
  link: string
}

export interface Prompt {
  id: ID
  title: string
  body: string
  negative: string
  description: string
  notes: string
  categoryId: ID | null
  collectionIds: ID[]
  tags: string[]
  tool: string
  language: string
  link: string
  imageIds: ID[]
  favorite: boolean
  status: PromptStatus
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
  copyCount: number
  trashedAt: number | null
  isExample: boolean
  versions: PromptVersion[]
  /** Tombstone-Zeitpunkt für die Synchronisierung (endgültig gelöscht). */
  deletedAt: number | null
}

export interface Category {
  id: ID
  name: string
  order: number
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface Collection {
  id: ID
  name: string
  description: string
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export interface StoredImage {
  id: ID
  promptId: ID
  name: string
  type: string
  size: number
  blob: Blob
  createdAt: number
  /** Für die Cloud: Pfad im Storage-Bucket, sofern hochgeladen. */
  remotePath: string | null
}

export type ThemeMode = 'system' | 'light' | 'dark'
export type ViewMode = 'cards' | 'list'
export type SortMode = 'updated' | 'created' | 'used' | 'alpha' | 'copied'

export interface Settings {
  theme: ThemeMode
  viewMode: ViewMode
  sort: SortMode
  tools: string[]
  languages: string[]
  onboarded: boolean
  examplesLoaded: boolean
  /** Konto-Kennung, zu der die lokalen Daten gehören ('' = nur lokal). */
  accountId: string
  syncEnabled: boolean
  lastSyncAt: number | null
}

export interface Draft {
  id: string // 'neu' oder Prompt-ID
  data: Partial<Prompt>
  savedAt: number
}

export interface Filters {
  query: string
  categoryId: ID | null
  tags: string[]
  tool: string | null
  language: string | null
  favoritesOnly: boolean
  /** Nur Prompts, an denen mindestens ein Bild hängt. */
  withImagesOnly: boolean
  collectionId: ID | null
}

export interface BackupFile {
  format: 'promptpilot-backup'
  version: number
  exportedAt: string
  counts: { prompts: number; categories: number; collections: number; images: number }
  prompts: Prompt[]
  categories: Category[]
  collections: Collection[]
  settings?: Partial<Settings>
  images?: { id: ID; promptId: ID; name: string; type: string; size: number; file: string }[]
}

export type SyncState =
  | 'local'
  | 'syncing'
  | 'synced'
  | 'offline-pending'
  | 'error'
  | 'disabled'

/** Freie Notiz: Überschrift und Text, unabhängig von Prompts. */
export interface Note {
  id: ID
  title: string
  body: string
  tags: string[]
  imageIds: ID[]
  favorite: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}
