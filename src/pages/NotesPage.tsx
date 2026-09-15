import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Note } from '../types'
import { useStore } from '../state/store'
import { useRoute } from '../lib/router'
import { Sheet, useConfirm } from '../components/ui'
import { TagInput } from '../components/TagInput'
import { IconEdit, IconPlus, IconStar, IconTrash } from '../components/Icons'

type Sortierung = 'geaendert' | 'erstellt' | 'alpha'

/** Alle Suchbegriffe müssen vorkommen – wie in der Prompt-Bibliothek. */
function passtZurSuche(note: Note, suche: string): boolean {
  const begriffe = suche.toLowerCase().split(/\s+/).filter(Boolean)
  if (!begriffe.length) return true
  const heuhaufen = `${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase()
  return begriffe.every((b) => heuhaufen.includes(b))
}

export function NotesPage() {
  const store = useStore()
  const route = useRoute()
  const confirm = useConfirm()

  const [suche, setSuche] = useState('')
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [nurFavoriten, setNurFavoriten] = useState(false)
  const [sortierung, setSortierung] = useState<Sortierung>('geaendert')
  const [entwurf, setEntwurf] = useState<Partial<Note> | null>(null)
  const [offeneNotiz, setOffeneNotiz] = useState<Note | null>(null)

  const modus = route.query.get('modus')

  useEffect(() => {
    if (modus === 'neu' && !entwurf) setEntwurf({ title: '', body: '', tags: [] })
  }, [modus, entwurf])

  const schliessen = useCallback(() => {
    setEntwurf(null)
    const q = new URLSearchParams(route.query)
    q.delete('modus')
    route.navigate(route.path, q, true)
  }, [route])

  const alleTags = useMemo(() => {
    const zaehler = new Map<string, number>()
    store.notes.forEach((n) => n.tags.forEach((t) => zaehler.set(t, (zaehler.get(t) ?? 0) + 1)))
    return Array.from(zaehler.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'),
    )
  }, [store.notes])

  const treffer = useMemo(() => {
    const liste = store.notes.filter((n) => {
      if (nurFavoriten && !n.favorite) return false
      if (tagFilter && !n.tags.includes(tagFilter)) return false
      return passtZurSuche(n, suche)
    })
    const sortiert = [...liste]
    if (sortierung === 'alpha') sortiert.sort((a, b) => a.title.localeCompare(b.title, 'de'))
    else if (sortierung === 'erstellt') sortiert.sort((a, b) => b.createdAt - a.createdAt)
    else sortiert.sort((a, b) => b.updatedAt - a.updatedAt)
    return sortiert
  }, [store.notes, suche, tagFilter, nurFavoriten, sortierung])

  const speichern = useCallback(async () => {
    if (!entwurf) return
    const titel = (entwurf.title ?? '').trim()
    if (!titel) return
    await store.saveNote(entwurf)
    setEntwurf(null)
    schliessen()
    store.notify('Notiz gespeichert', 'success')
  }, [entwurf, store, schliessen])

  const loeschen = useCallback(
    async (note: Note) => {
      const ok = await confirm.ask({
        title: `„${note.title}“ löschen?`,
        message: 'Die Notiz wird endgültig entfernt. Das lässt sich nicht rückgängig machen.',
        confirmLabel: 'Löschen',
        danger: true,
      })
      if (!ok) return
      await store.deleteNote(note.id)
      setOffeneNotiz(null)
      store.notify('Notiz gelöscht', 'success')
    },
    [confirm, store],
  )

  const filterAktiv = Boolean(tagFilter) || nurFavoriten || Boolean(suche.trim())

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Notizen</h1>
          <p>Tipps, Merksätze und alles, was kein Prompt ist – durchsuchbar und mit Tags.</p>
        </div>
      </div>

      <div className="search">
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          placeholder="Überschrift, Text oder Tag durchsuchen"
          aria-label="Notizen durchsuchen"
        />
      </div>

      <div className="chips">
        <button
          className={`chip${nurFavoriten ? ' is-active' : ''}`}
          onClick={() => setNurFavoriten((v) => !v)}
        >
          Favoriten
        </button>
        {alleTags.map(([tag, anzahl]) => (
          <button
            key={tag}
            className={`chip${tagFilter === tag ? ' is-active' : ''}`}
            onClick={() => setTagFilter((t) => (t === tag ? null : tag))}
          >
            {tag} <span className="badge">{anzahl}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <span className="hint">
          {treffer.length} {treffer.length === 1 ? 'Notiz' : 'Notizen'}
        </span>
        <select
          className="select"
          value={sortierung}
          onChange={(e) => setSortierung(e.target.value as Sortierung)}
          aria-label="Sortierung"
        >
          <option value="geaendert">Zuletzt bearbeitet</option>
          <option value="erstellt">Zuletzt erstellt</option>
          <option value="alpha">Alphabetisch</option>
        </select>
        {filterAktiv && (
          <button
            className="btn btn-sm"
            onClick={() => {
              setSuche('')
              setTagFilter(null)
              setNurFavoriten(false)
            }}
          >
            Filter zurücksetzen
          </button>
        )}
        <button
          className="btn btn-sm btn-primary neuer-prompt"
          onClick={() => setEntwurf({ title: '', body: '', tags: [] })}
        >
          <IconPlus size={16} /> Neue Notiz
        </button>
      </div>

      {treffer.length === 0 ? (
        <div className="empty">
          <h3>{filterAktiv ? 'Nichts gefunden' : 'Noch keine Notizen'}</h3>
          <p>
            {filterAktiv
              ? 'Andere Begriffe versuchen oder die Filter zurücksetzen.'
              : 'Leg die erste Notiz an – eine Überschrift und ein Text genügen.'}
          </p>
          {!filterAktiv && (
            <button
              className="btn btn-primary"
              onClick={() => setEntwurf({ title: '', body: '', tags: [] })}
            >
              <IconPlus size={17} /> Erste Notiz anlegen
            </button>
          )}
        </div>
      ) : (
        <div className="grid">
          {treffer.map((note) => (
            <article className="card" key={note.id}>
              <h3 onClick={() => setOffeneNotiz(note)} style={{ cursor: 'pointer' }}>
                {note.title}
              </h3>
              <p className="card-body" onClick={() => setOffeneNotiz(note)}>
                {note.body.slice(0, 220)}
                {note.body.length > 220 ? ' …' : ''}
              </p>
              {note.tags.length > 0 && (
                <div className="chips" style={{ padding: 0, margin: '6px 0 0' }}>
                  {note.tags.map((t) => (
                    <span className="chip" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <div className="card-foot">
                <button
                  className="icon-btn"
                  onClick={() => store.toggleNoteFavorite(note.id)}
                  aria-label={note.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
                  title="Favorit"
                >
                  <IconStar size={18} filled={note.favorite} />
                </button>
                <button
                  className="icon-btn"
                  onClick={() => setEntwurf(note)}
                  aria-label="Bearbeiten"
                  title="Bearbeiten"
                >
                  <IconEdit size={18} />
                </button>
                <div className="spacer" />
                <button
                  className="icon-btn"
                  onClick={() => loeschen(note)}
                  aria-label="Löschen"
                  title="Löschen"
                >
                  <IconTrash size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Lesen */}
      {offeneNotiz && !entwurf && (
        <Sheet
          title={offeneNotiz.title}
          onClose={() => setOffeneNotiz(null)}
          footer={
            <>
              <button className="btn" onClick={() => loeschen(offeneNotiz)}>
                Löschen
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setEntwurf(offeneNotiz)
                  setOffeneNotiz(null)
                }}
              >
                <IconEdit size={17} /> Bearbeiten
              </button>
            </>
          }
        >
          <pre className="prompt-text">{offeneNotiz.body}</pre>
          {offeneNotiz.tags.length > 0 && (
            <div className="chips" style={{ padding: 0, marginTop: 12 }}>
              {offeneNotiz.tags.map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          )}
          <dl className="meta-table" style={{ marginTop: 16 }}>
            <dt>Erstellt</dt>
            <dd>{new Date(offeneNotiz.createdAt).toLocaleString('de-DE')}</dd>
            <dt>Geändert</dt>
            <dd>{new Date(offeneNotiz.updatedAt).toLocaleString('de-DE')}</dd>
          </dl>
        </Sheet>
      )}

      {/* Schreiben */}
      {entwurf && (
        <Sheet
          title={entwurf.id ? 'Notiz bearbeiten' : 'Neue Notiz'}
          onClose={schliessen}
          footer={
            <>
              <button className="btn" onClick={schliessen}>
                Abbrechen
              </button>
              <button
                className="btn btn-primary"
                onClick={speichern}
                disabled={!(entwurf.title ?? '').trim()}
              >
                Speichern
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="notiz-titel">Überschrift</label>
            <input
              id="notiz-titel"
              className="input"
              value={entwurf.title ?? ''}
              onChange={(e) => setEntwurf({ ...entwurf, title: e.target.value })}
              placeholder="z. B. Bessere Bildprompts"
              autoFocus
            />
          </div>
          <div className="field">
            <label htmlFor="notiz-text">Text</label>
            <textarea
              id="notiz-text"
              className="textarea"
              rows={12}
              value={entwurf.body ?? ''}
              onChange={(e) => setEntwurf({ ...entwurf, body: e.target.value })}
              placeholder="Tipp, Merksatz, Vorgehen …"
            />
          </div>
          <div className="field">
            <label htmlFor="notiz-tags">Tags</label>
            <TagInput
              id="notiz-tags"
              value={entwurf.tags ?? []}
              onChange={(tags) => setEntwurf({ ...entwurf, tags })}
              suggestions={alleTags.map(([t]) => t)}
            />
          </div>
        </Sheet>
      )}

      {confirm.element}
    </div>
  )
}
