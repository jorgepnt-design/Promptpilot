import { useMemo, useState } from 'react'

export function TagInput({
  value,
  onChange,
  suggestions = [],
  id,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  suggestions?: string[]
  id?: string
}) {
  const [draft, setDraft] = useState('')

  const open = useMemo(() => {
    const q = draft.trim().toLowerCase()
    if (!q) return []
    return suggestions
      .filter((s) => s.toLowerCase().includes(q) && !value.includes(s))
      .slice(0, 6)
  }, [draft, suggestions, value])

  const add = (raw: string) => {
    const tag = raw.trim().replace(/^#/, '')
    if (!tag) return
    if (!value.includes(tag)) onChange([...value, tag])
    setDraft('')
  }

  return (
    <div>
      <div className="tag-input">
        {value.map((t) => (
          <span className="tag-pill" key={t}>
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== t))}
              aria-label={`Tag ${t} entfernen`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? 'Weiterer Tag' : 'Tag eingeben und Enter drücken'}
          onChange={(e) => {
            const v = e.target.value
            if (v.endsWith(',')) add(v.slice(0, -1))
            else setDraft(v)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add(draft)
            } else if (e.key === 'Backspace' && !draft && value.length) {
              onChange(value.slice(0, -1))
            }
          }}
          onBlur={() => add(draft)}
        />
      </div>
      {open.length > 0 && (
        <div className="chips" style={{ margin: '8px 0 0', padding: 0 }}>
          {open.map((s) => (
            <button type="button" key={s} className="chip" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
