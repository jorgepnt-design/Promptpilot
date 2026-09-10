export type CopyResult = 'copied' | 'manual'

/**
 * Kopiert Text in die Zwischenablage.
 * Ist der direkte Zugriff nicht erlaubt (z. B. ohne HTTPS oder in eingebetteten
 * Ansichten), wird 'manual' gemeldet – die Oberfläche zeigt dann ein Feld zum
 * Markieren und manuellen Kopieren an. Es wird nie ein Erfolg vorgetäuscht.
 */
export async function copyText(text: string): Promise<CopyResult> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return 'copied'
    } catch {
      /* weiter mit Ersatzweg */
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length)
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (ok) return 'copied'
  } catch {
    /* weiter mit Ersatzweg */
  }
  return 'manual'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export function timestampName(prefix: string, ext: string): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${prefix}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes(),
  )}.${ext}`
}
