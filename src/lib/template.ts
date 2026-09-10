/** Platzhalter der Form {{Name}} – doppelt genutzte Namen werden nur einmal abgefragt. */
const PLACEHOLDER_RE = /\{\{\s*([^{}]+?)\s*\}\}/g

export function extractPlaceholders(...texts: string[]): string[] {
  const seen: string[] = []
  for (const text of texts) {
    if (!text) continue
    PLACEHOLDER_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PLACEHOLDER_RE.exec(text))) {
      const name = m[1].trim()
      if (name && !seen.includes(name)) seen.push(name)
    }
  }
  return seen
}

export function hasPlaceholders(...texts: string[]): boolean {
  return extractPlaceholders(...texts).length > 0
}

/** Ersetzt alle Platzhalter. Leere Werte bleiben als Platzhalter sichtbar stehen. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  if (!text) return ''
  return text.replace(PLACEHOLDER_RE, (whole, rawName: string) => {
    const name = rawName.trim()
    const value = values[name]
    return value && value.length ? value : whole
  })
}

export function missingPlaceholders(text: string, values: Record<string, string>): string[] {
  return extractPlaceholders(text).filter((n) => !values[n] || !values[n].trim())
}

export interface TemplateSegment {
  text: string
  placeholder: string | null
  filled: boolean
}

/** Für die Live-Vorschau: markiert eingesetzte und noch offene Platzhalter. */
export function previewSegments(text: string, values: Record<string, string>): TemplateSegment[] {
  const segs: TemplateSegment[] = []
  let last = 0
  PLACEHOLDER_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = PLACEHOLDER_RE.exec(text))) {
    if (m.index > last) segs.push({ text: text.slice(last, m.index), placeholder: null, filled: false })
    const name = m[1].trim()
    const value = values[name]
    segs.push({
      text: value && value.trim() ? value : m[0],
      placeholder: name,
      filled: Boolean(value && value.trim()),
    })
    last = m.index + m[0].length
  }
  if (last < text.length) segs.push({ text: text.slice(last), placeholder: null, filled: false })
  return segs
}
