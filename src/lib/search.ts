import type { Category, Filters, Prompt, SortMode } from '../types'

/** Zerlegt die Eingabe in Suchbegriffe; Anführungszeichen halten Wortgruppen zusammen. */
export function tokenize(query: string): string[] {
  const out: string[] = []
  const re = /"([^"]+)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(query))) {
    const term = (m[1] ?? m[2] ?? '').trim().toLowerCase()
    if (term) out.push(term)
  }
  return out
}

function haystack(p: Prompt, categoryName: string): string {
  return [
    p.title,
    p.body,
    p.negative,
    p.description,
    p.notes,
    categoryName,
    p.tags.join(' '),
    p.tool,
    p.language,
  ]
    .join('\n')
    .toLowerCase()
}

export interface SearchIndex {
  [promptId: string]: string
}

export function buildIndex(prompts: Prompt[], categories: Category[]): SearchIndex {
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const idx: SearchIndex = {}
  for (const p of prompts) idx[p.id] = haystack(p, p.categoryId ? names.get(p.categoryId) || '' : '')
  return idx
}

export interface FilterOptions {
  prompts: Prompt[]
  filters: Filters
  sort: SortMode
  index: SearchIndex
  status: Prompt['status']
}

export function filterPrompts({ prompts, filters, sort, index, status }: FilterOptions): Prompt[] {
  const terms = tokenize(filters.query)
  const result = prompts.filter((p) => {
    if (p.status !== status) return false
    if (p.deletedAt) return false
    if (filters.favoritesOnly && !p.favorite) return false
    if (filters.categoryId && p.categoryId !== filters.categoryId) return false
    if (filters.collectionId && !p.collectionIds.includes(filters.collectionId)) return false
    if (filters.tool && p.tool !== filters.tool) return false
    if (filters.language && p.language !== filters.language) return false
    if (filters.tags.length && !filters.tags.every((t) => p.tags.includes(t))) return false
    if (terms.length) {
      const hay = index[p.id] ?? ''
      if (!terms.every((t) => hay.includes(t))) return false
    }
    return true
  })
  return sortPrompts(result, sort)
}

export function sortPrompts(list: Prompt[], sort: SortMode): Prompt[] {
  const copy = [...list]
  switch (sort) {
    case 'created':
      return copy.sort((a, b) => b.createdAt - a.createdAt)
    case 'used':
      return copy.sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.updatedAt - a.updatedAt)
    case 'alpha':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'de', { sensitivity: 'base' }))
    case 'copied':
      return copy.sort((a, b) => b.copyCount - a.copyCount || b.updatedAt - a.updatedAt)
    case 'updated':
    default:
      return copy.sort((a, b) => b.updatedAt - a.updatedAt)
  }
}

export interface Segment {
  text: string
  hit: boolean
}

/**
 * Zerlegt einen Text in Treffer- und Normalsegmente.
 * Rein textbasiert – es entsteht kein HTML, das ausgeführt werden könnte.
 */
export function highlight(text: string, terms: string[]): Segment[] {
  if (!terms.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const ranges: [number, number][] = []
  for (const t of terms) {
    if (!t) continue
    let from = 0
    for (;;) {
      const i = lower.indexOf(t, from)
      if (i === -1) break
      ranges.push([i, i + t.length])
      from = i + t.length
    }
  }
  if (!ranges.length) return [{ text, hit: false }]
  ranges.sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r] as [number, number])
  }
  const segs: Segment[] = []
  let pos = 0
  for (const [s, e] of merged) {
    if (s > pos) segs.push({ text: text.slice(pos, s), hit: false })
    segs.push({ text: text.slice(s, e), hit: true })
    pos = e
  }
  if (pos < text.length) segs.push({ text: text.slice(pos), hit: false })
  return segs
}

/** Liefert einen Ausschnitt rund um den ersten Treffer, sonst den Textanfang. */
export function snippet(text: string, terms: string[], length = 180): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!terms.length) return flat.slice(0, length)
  const lower = flat.toLowerCase()
  let first = -1
  for (const t of terms) {
    const i = lower.indexOf(t)
    if (i !== -1 && (first === -1 || i < first)) first = i
  }
  if (first <= 0) return flat.slice(0, length)
  const start = Math.max(0, first - 40)
  return (start > 0 ? '… ' : '') + flat.slice(start, start + length)
}

export function countWords(text: string): number {
  const t = text.trim()
  if (!t) return 0
  return t.split(/\s+/).length
}

/** Vergleicht Prompt-Texte normalisiert, um wahrscheinliche Dubletten zu erkennen. */
export function normalizeForCompare(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}
