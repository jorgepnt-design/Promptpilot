import { useMemo, useState } from 'react'
import type { Prompt } from '../types'
import { useStore } from '../state/store'
import { Sheet } from './ui'
import { IconCopy } from './Icons'
import { emptyPrompt } from '../lib/defaults'

/**
 * Stellt mehrere Prompts zu einem gemeinsamen Text zusammen.
 * Die Originale bleiben unverändert.
 */
export function Combiner({ prompts, onClose }: { prompts: Prompt[]; onClose: () => void }) {
  const store = useStore()
  const [order, setOrder] = useState<string[]>(prompts.map((p) => p.id))
  const [separator, setSeparator] = useState('\n\n')
  const [withTitles, setWithTitles] = useState(false)

  const ordered = useMemo(
    () => order.map((id) => prompts.find((p) => p.id === id)).filter(Boolean) as Prompt[],
    [order, prompts],
  )

  const combined = useMemo(
    () =>
      ordered
        .map((p) => (withTitles ? `${p.title}\n${p.body}` : p.body))
        .join(separator === '\\n' ? '\n' : separator),
    [ordered, separator, withTitles],
  )

  const move = (index: number, dir: -1 | 1) => {
    const next = [...order]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setOrder(next)
  }

  return (
    <Sheet
      title={`${prompts.length} Prompts zusammenstellen`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn"
            onClick={async () => {
              const created = await store.savePrompt(
                emptyPrompt({ title: 'Zusammenstellung', body: combined }),
              )
              store.notify(`„${created.title}“ gespeichert`, 'success')
              onClose()
            }}
          >
            Als neuen Prompt speichern
          </button>
          <button
            className="btn btn-primary"
            onClick={() => store.copyPrompt(ordered[0]?.id ?? '', combined, 'Zusammenstellung kopiert')}
          >
            <IconCopy size={17} /> Kopieren
          </button>
        </>
      }
    >
      <div className="list-rows" style={{ marginBottom: 14 }}>
        {ordered.map((p, i) => (
          <div className="list-row" key={p.id}>
            <span className="badge">{i + 1}</span>
            <span className="grow">{p.title || 'Ohne Titel'}</span>
            <button
              className="btn btn-sm"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label="Nach oben"
            >
              ↑
            </button>
            <button
              className="btn btn-sm"
              onClick={() => move(i, 1)}
              disabled={i === ordered.length - 1}
              aria-label="Nach unten"
            >
              ↓
            </button>
          </div>
        ))}
      </div>

      <div className="field-row two">
        <div className="field">
          <label htmlFor="cmb-sep">Trennung</label>
          <select
            id="cmb-sep"
            className="input"
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
          >
            <option value={'\n\n'}>Leerzeile</option>
            <option value={'\n'}>Zeilenumbruch</option>
            <option value={'\n---\n'}>Trennlinie</option>
            <option value={', '}>Komma</option>
          </select>
        </div>
        <label className="checkbox" style={{ alignSelf: 'end', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={withTitles}
            onChange={(e) => setWithTitles(e.target.checked)}
          />
          Titel mit übernehmen
        </label>
      </div>

      <div className="section">
        <h4>Ergebnis</h4>
        <pre className="prompt-text">{combined}</pre>
      </div>
    </Sheet>
  )
}
