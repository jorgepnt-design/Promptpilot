import { useMemo, useState } from 'react'
import type { Prompt } from '../types'
import { useStore } from '../state/store'
import { extractPlaceholders, fillTemplate, missingPlaceholders, previewSegments } from '../lib/template'
import { emptyPrompt } from '../lib/defaults'
import { Sheet } from './ui'
import { IconCopy } from './Icons'

export function TemplateFiller({ prompt, onClose }: { prompt: Prompt; onClose: () => void }) {
  const store = useStore()
  const names = useMemo(
    () => extractPlaceholders(prompt.body, prompt.negative),
    [prompt.body, prompt.negative],
  )
  const [values, setValues] = useState<Record<string, string>>({})
  const [warn, setWarn] = useState<string[] | null>(null)

  const filledBody = fillTemplate(prompt.body, values)
  const filledNegative = fillTemplate(prompt.negative, values)
  const segments = previewSegments(prompt.body, values)

  const copy = async (force = false) => {
    const missing = missingPlaceholders(prompt.body, values)
    if (missing.length && !force) {
      setWarn(missing)
      return
    }
    setWarn(null)
    await store.copyPrompt(prompt.id, filledBody, 'Ausgefüllter Prompt kopiert')
  }

  const saveAsNew = async () => {
    const created = await store.savePrompt(
      emptyPrompt({
        title: `${prompt.title} – ausgefüllt`,
        body: filledBody,
        negative: filledNegative,
        description: prompt.description,
        notes: prompt.notes,
        categoryId: prompt.categoryId,
        collectionIds: [...prompt.collectionIds],
        tags: [...prompt.tags],
        tool: prompt.tool,
        language: prompt.language,
        link: prompt.link,
      }),
    )
    store.notify(`„${created.title}“ gespeichert`, 'success')
    onClose()
  }

  return (
    <Sheet
      title="Vorlage verwenden"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={saveAsNew}>
            Als neuen Prompt speichern
          </button>
          <button className="btn btn-primary" onClick={() => copy()}>
            <IconCopy size={17} /> Kopieren
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginBottom: 14 }}>
        Die ursprüngliche Vorlage bleibt unverändert. Mehrfach verwendete Platzhalter werden nur
        einmal abgefragt.
      </p>

      {names.length === 0 ? (
        <div className="notice">Dieser Prompt enthält keine Platzhalter.</div>
      ) : (
        names.map((name) => (
          <div className="field" key={name}>
            <label htmlFor={`ph-${name}`}>{name}</label>
            <input
              id={`ph-${name}`}
              className="input"
              value={values[name] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              placeholder={`Wert für ${name}`}
            />
          </div>
        ))
      )}

      {warn && (
        <div className="notice notice-warn">
          <div style={{ flex: 1 }}>
            <strong>Noch offen: {warn.join(', ')}</strong>
            <div>Die Platzhalter bleiben im kopierten Text stehen.</div>
            <button className="btn btn-sm btn-primary" style={{ marginTop: 10 }} onClick={() => copy(true)}>
              Trotzdem kopieren
            </button>
          </div>
        </div>
      )}

      <div className="section">
        <h4>Vorschau</h4>
        <div className="template-preview">
          {segments.map((s, i) =>
            s.placeholder ? (
              <span key={i} className={s.filled ? 'ph-filled' : 'ph-open'}>
                {s.text}
              </span>
            ) : (
              <span key={i}>{s.text}</span>
            ),
          )}
        </div>
      </div>

      {prompt.negative && (
        <div className="section">
          <h4>Negativer Prompt</h4>
          <pre className="prompt-text">{filledNegative}</pre>
          <button
            className="btn btn-sm"
            style={{ marginTop: 8 }}
            onClick={() => store.copyPrompt(prompt.id, filledNegative, 'Negativer Prompt kopiert')}
          >
            <IconCopy size={16} /> Negativen Prompt kopieren
          </button>
        </div>
      )}
    </Sheet>
  )
}
