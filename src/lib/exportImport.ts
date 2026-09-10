import type { BackupFile, Category, Collection, Prompt, Settings, StoredImage } from '../types'
import { emptyPrompt } from './defaults'
import { blobToBase64 } from './images'
import { newId } from './id'

export const BACKUP_VERSION = 1

export interface ExportInput {
  prompts: Prompt[]
  categories: Category[]
  collections: Collection[]
  settings?: Settings
  images?: StoredImage[]
}

/** Reines JSON – enthält bewusst keine Bilddateien. */
export function buildJsonBackup(input: ExportInput): BackupFile {
  return {
    format: 'promptpilot-backup',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      prompts: input.prompts.length,
      categories: input.categories.length,
      collections: input.collections.length,
      images: 0,
    },
    prompts: input.prompts,
    categories: input.categories,
    collections: input.collections,
    settings: input.settings
      ? {
          tools: input.settings.tools,
          languages: input.settings.languages,
          theme: input.settings.theme,
          viewMode: input.settings.viewMode,
          sort: input.settings.sort,
        }
      : undefined,
  }
}

export function jsonBlob(backup: BackupFile): Blob {
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
}

/** Vollständige Sicherung inklusive Bilddateien als ZIP. */
export async function buildZipBackup(input: ExportInput): Promise<Blob> {
  // JSZip wird erst bei Bedarf geladen, damit der Start der App leichtgewichtig bleibt.
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const images = input.images ?? []
  const backup = buildJsonBackup(input)
  backup.counts.images = images.length
  backup.images = images.map((i) => ({
    id: i.id,
    promptId: i.promptId,
    name: i.name,
    type: i.type,
    size: i.size,
    file: `bilder/${i.id}${extFor(i.type, i.name)}`,
  }))
  zip.file('daten.json', JSON.stringify(backup, null, 2))
  const folder = zip.folder('bilder')
  for (const img of images) {
    folder?.file(`${img.id}${extFor(img.type, img.name)}`, img.blob)
  }
  zip.file(
    'LIESMICH.txt',
    [
      'PromptPilot – vollständige Sicherung',
      `Erstellt: ${new Date().toLocaleString('de-DE')}`,
      '',
      `Prompts: ${backup.counts.prompts}`,
      `Kategorien: ${backup.counts.categories}`,
      `Sammlungen: ${backup.counts.collections}`,
      `Bilder: ${backup.counts.images}`,
      '',
      'Zum Wiederherstellen: Einstellungen → Import → diese ZIP-Datei auswählen.',
    ].join('\n'),
  )
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

function extFor(type: string, name: string): string {
  const fromName = name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
  if (fromName && fromName.length <= 5) return fromName
  if (type.includes('png')) return '.png'
  if (type.includes('webp')) return '.webp'
  if (type.includes('gif')) return '.gif'
  if (type.includes('svg')) return '.svg'
  return '.jpg'
}

export function buildMarkdown(prompts: Prompt[], categories: Category[]): string {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const parts = prompts.map((p) => {
    const meta: string[] = []
    if (p.categoryId && names.get(p.categoryId)) meta.push(`Kategorie: ${names.get(p.categoryId)}`)
    if (p.tool) meta.push(`KI-Tool: ${p.tool}`)
    if (p.language) meta.push(`Sprache: ${p.language}`)
    if (p.tags.length) meta.push(`Tags: ${p.tags.join(', ')}`)
    const blocks = [`## ${p.title || 'Ohne Titel'}`, '']
    if (meta.length) blocks.push(meta.join('  \n'), '')
    if (p.description) blocks.push(p.description, '')
    blocks.push('```text', p.body, '```', '')
    if (p.negative) blocks.push('**Negativer Prompt**', '', '```text', p.negative, '```', '')
    if (p.notes) blocks.push(`Notizen: ${p.notes}`, '')
    if (p.link) blocks.push(`Referenz: ${p.link}`, '')
    return blocks.join('\n')
  })
  return ['# PromptPilot – Export', '', `Exportiert am ${new Date().toLocaleString('de-DE')}`, '', ...parts].join(
    '\n',
  )
}

export function buildPlainText(prompts: Prompt[]): string {
  return prompts
    .map((p) => `${p.title}\n${'-'.repeat(Math.max(3, p.title.length))}\n${p.body}${p.negative ? `\n\nNegativ: ${p.negative}` : ''}`)
    .join('\n\n\n')
}

/* ----------------------------- Import ----------------------------- */

export class ImportError extends Error {}

export interface ParsedImport {
  prompts: Prompt[]
  categories: Category[]
  collections: Collection[]
  images: StoredImage[]
  containsImages: boolean
  exportedAt: string | null
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function arr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function sanitizePrompt(raw: unknown): Prompt | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const title = str(r.title)
  const body = str(r.body ?? r.prompt ?? r.text)
  if (!title && !body) return null
  const now = Date.now()
  const status = ['active', 'archived', 'trashed'].includes(str(r.status))
    ? (r.status as Prompt['status'])
    : 'active'
  return emptyPrompt({
    id: str(r.id) || newId(),
    title: title || body.slice(0, 60),
    body,
    negative: str(r.negative),
    description: str(r.description),
    notes: str(r.notes),
    categoryId: typeof r.categoryId === 'string' ? r.categoryId : null,
    collectionIds: arr(r.collectionIds),
    tags: arr(r.tags),
    tool: str(r.tool),
    language: str(r.language, 'Deutsch'),
    link: safeUrl(str(r.link)),
    imageIds: arr(r.imageIds),
    favorite: r.favorite === true,
    status,
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    lastUsedAt: typeof r.lastUsedAt === 'number' ? r.lastUsedAt : null,
    copyCount: num(r.copyCount, 0),
    trashedAt: typeof r.trashedAt === 'number' ? r.trashedAt : null,
    isExample: r.isExample === true,
    versions: Array.isArray(r.versions) ? (r.versions as Prompt['versions']).slice(0, 30) : [],
    deletedAt: typeof r.deletedAt === 'number' ? r.deletedAt : null,
  })
}

/** Nur http/https-Links übernehmen – niemals javascript: oder data:. */
export function safeUrl(url: string): string {
  const t = url.trim()
  if (!t) return ''
  try {
    const u = new URL(t)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : ''
  } catch {
    return ''
  }
}

function sanitizeCategory(raw: unknown, order: number): Category | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  const now = Date.now()
  return {
    id: str(r.id) || newId(),
    name,
    order: num(r.order, order),
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    deletedAt: null,
  }
}

function sanitizeCollection(raw: unknown): Collection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const name = str(r.name)
  if (!name) return null
  const now = Date.now()
  return {
    id: str(r.id) || newId(),
    name,
    description: str(r.description),
    createdAt: num(r.createdAt, now),
    updatedAt: num(r.updatedAt, now),
    deletedAt: null,
  }
}

function parseBackupObject(data: unknown): Omit<ParsedImport, 'images' | 'containsImages'> & {
  imageRefs: BackupFile['images']
} {
  if (!data || typeof data !== 'object') {
    throw new ImportError('Die Datei enthält keine lesbaren Daten.')
  }
  const d = data as Record<string, unknown>
  const rawPrompts = Array.isArray(d.prompts) ? d.prompts : Array.isArray(d) ? (d as unknown[]) : null
  if (!rawPrompts) {
    throw new ImportError('In der Datei wurde keine Liste mit Prompts gefunden.')
  }
  const prompts = rawPrompts.map(sanitizePrompt).filter(Boolean) as Prompt[]
  if (!prompts.length) {
    throw new ImportError('Die Datei enthält keine gültigen Prompts.')
  }
  const categories = (Array.isArray(d.categories) ? d.categories : [])
    .map((c, i) => sanitizeCategory(c, i))
    .filter(Boolean) as Category[]
  const collections = (Array.isArray(d.collections) ? d.collections : [])
    .map(sanitizeCollection)
    .filter(Boolean) as Collection[]
  return {
    prompts,
    categories,
    collections,
    exportedAt: typeof d.exportedAt === 'string' ? d.exportedAt : null,
    imageRefs: Array.isArray(d.images) ? (d.images as BackupFile['images']) : undefined,
  }
}

export async function parseImportFile(file: File): Promise<ParsedImport> {
  const isZip = /\.zip$/i.test(file.name) || file.type.includes('zip')
  if (isZip) {
    const { default: JSZip } = await import('jszip')
    let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>
    try {
      zip = await JSZip.loadAsync(file)
    } catch {
      throw new ImportError('Die ZIP-Datei konnte nicht gelesen werden.')
    }
    const dataFile = zip.file('daten.json') || zip.file('data.json')
    if (!dataFile) throw new ImportError('In der ZIP-Datei fehlt die Datei „daten.json“.')
    const text = await dataFile.async('string')
    const parsed = parseBackupObject(safeJson(text))
    const images: StoredImage[] = []
    for (const ref of parsed.imageRefs ?? []) {
      const entry = zip.file(ref.file)
      if (!entry) continue
      const blob = await entry.async('blob')
      images.push({
        id: ref.id || newId(),
        promptId: ref.promptId,
        name: ref.name || 'bild',
        type: ref.type || blob.type || 'image/jpeg',
        size: blob.size,
        blob,
        createdAt: Date.now(),
        remotePath: null,
      })
    }
    return { ...parsed, images, containsImages: images.length > 0 }
  }

  const text = await file.text()
  const parsed = parseBackupObject(safeJson(text))
  const images: StoredImage[] = []
  if (parsed.imageRefs?.length) {
    for (const ref of parsed.imageRefs) {
      // Eingebettete Base64-Bilder aus älteren Exporten
      if (typeof ref.file === 'string' && ref.file.startsWith('data:')) {
        try {
          const res = await fetch(ref.file)
          const blob = await res.blob()
          images.push({
            id: ref.id || newId(),
            promptId: ref.promptId,
            name: ref.name,
            type: ref.type || blob.type,
            size: blob.size,
            blob,
            createdAt: Date.now(),
            remotePath: null,
          })
        } catch {
          /* Bild überspringen */
        }
      }
    }
  }
  return { ...parsed, images, containsImages: images.length > 0 }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new ImportError('Die Datei ist kein gültiges JSON.')
  }
}

export async function imagesToBase64(images: StoredImage[]) {
  return Promise.all(
    images.map(async (i) => ({
      id: i.id,
      promptId: i.promptId,
      name: i.name,
      type: i.type,
      size: i.size,
      file: `data:${i.type};base64,${await blobToBase64(i.blob)}`,
    })),
  )
}
