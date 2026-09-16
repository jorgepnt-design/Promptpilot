/**
 * Ein Prompt kann für mehrere Werkzeuge taugen. Gespeichert wird das weiterhin
 * als ein Textfeld (durch Komma getrennt), damit vorhandene Prompts, der
 * Abgleich und alte Sicherungen unverändert weiterfunktionieren – gelesen wird
 * es überall als Liste.
 */
export function toolList(tool: string | undefined | null): string[] {
  if (!tool) return []
  return tool
    .split(/[,;/]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/** Liste zurück in die gespeicherte Schreibweise. */
export function toolString(tools: string[]): string {
  return tools.map((t) => t.trim()).filter(Boolean).join(', ')
}
