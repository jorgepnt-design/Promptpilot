import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Note, StoredImage } from '../types'
import { useStore } from '../state/store'
import { useRoute } from '../lib/router'
import { Sheet, useConfirm } from '../components/ui'
import { TagInput } from '../components/TagInput'
import { IconClose, IconEdit, IconImage, IconPlus, IconStar, IconTrash } from '../components/Icons'
import { ImageError, MAX_IMAGES_PER_PROMPT, prepareImage } from '../lib/images'

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
  const [bilder, setBilder] = useState<StoredImage[]>([])
  const [bildFehler, setBildFehler] = useState<string | null>(null)
  const dateiRef = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  const modus = route.query.get('modus')

  useEffect(() => {
    if (modus === 'neu' && !entwurf) setEntwurf({ title: '', body: '', tags: [] })
  }, [modus, entwurf])

  /* Bilder des offenen Datensatzes laden und Objekt-URLs wieder freigeben. */
  useEffect(() => {
    const ids = entwurf?.imageIds ?? offeneNotiz?.imageIds ?? []
    let aktiv = true
    urls.current.forEach((u) => URL.revokeObjectURL(u))
    urls.current = []
    if (!ids.length) {
      setBilder([])
      return
    }
    store.getImages(ids).then((imgs) => {
      if (aktiv) setBilder(imgs)
    })
    return () => {
      aktiv = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [(entwurf?.imageIds ?? []).join(','), (offeneNotiz?.imageIds ?? []).join(',')])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const bildUrl = useCallback((img: StoredImage) => {
    const u = URL.createObjectURL(img.blob)
    urls.current.push(u)
    return u
  }, [])

  const bilderHinzufuegen = useCallback(
    async (files: FileList | null) => {
      if (!files?.length || !entwurf) return
      setBildFehler(null)
      const vorhanden = entwurf.imageIds ?? []
      const frei = MAX_IMAGES_PER_PROMPT - vorhanden.length
      if (frei <= 0) {
        setBildFehler(`Es sind höchstens ${MAX_IMAGES_PER_PROMPT} Bilder je Notiz möglich.`)
        return
      }
      // Die Notiz braucht eine ID, bevor Bilder daran hängen können.
      const id = entwurf.id ?? (await store.saveNote({ ...entwurf, title: entwurf.title || 'Ohne Titel' })).id
      const fertig: StoredImage[] = []
      for (const f of Array.from(files).slice(0, frei)) {
        try {
          fertig.push(await prepareImage(f, id))
        } catch (err) {
          setBildFehler(
            err instanceof ImageError ? err.message : `„${f.name}“ konnte nicht gelesen werden.`,
          )
        }
      }
      if (!fertig.length) return
      await store.addImages(id, fertig)
      setEntwurf((cur) =>
        cur ? { ...cur, id, imageIds: [...(cur.imageIds ?? []), ...fertig.map((i) => i.id)] } : cur,
      )
      if (dateiRef.current) dateiRef.current.value = ''
    },
    [entwurf, store],
  )

  const bildEntfernen = useCallback(
    async (imgId: string) => {
      if (!entwurf?.id) return
      await store.removeImage(entwurf.id, imgId)
      setEntwurf((cur) =>
        cur ? { ...cur, imageIds: (cur.imageIds ?? []).filter((i) => i !== imgId) } : cur,
      )
    },
    [entwurf, store],
  )

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
              {(note.imageIds ?? []).length > 0 && (
                <div className="hint" style={{ marginTop: 4 }}>
                  <IconImage size={14} /> {note.imageIds.length}{' '}
                  {note.imageIds.length === 1 ? 'Bild' : 'Bilder'}
                </div>
              )}
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
          {bilder.length > 0 && (
            <div className="thumbs" style={{ marginTop: 14 }}>
              {bilder.map((img) => (
                <figure className="preview" key={img.id} style={{ margin: 0, maxWidth: 260 }}>
                  <img src={bildUrl(img)} alt={img.name} loading="lazy" />
                </figure>
              ))}
            </div>
          )}
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
            <label>Bilder</label>
            <input
              ref={dateiRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => bilderHinzufuegen(e.target.files)}
              style={{ display: 'none' }}
            />
            <button
              className="btn btn-sm"
              onClick={() => dateiRef.current?.click()}
              disabled={(entwurf.imageIds ?? []).length >= MAX_IMAGES_PER_PROMPT}
            >
              <IconImage size={16} /> Bilder hinzufügen
            </button>
            <div className="hint" style={{ marginTop: 6 }}>
              Höchstens {MAX_IMAGES_PER_PROMPT} Bilder, je 8 MB. Große Bilder werden verkleinert.
            </div>
            {bildFehler && <div className="notice notice-warn">{bildFehler}</div>}
            {bilder.length > 0 && (
              <div className="thumbs" style={{ marginTop: 10 }}>
                {bilder.map((img) => (
                  <div className="thumb" key={img.id} style={{ width: 96, height: 96 }}>
                    <img src={bildUrl(img)} alt={img.name} />
                    <button
                      type="button"
                      onClick={() => bildEntfernen(img.id)}
                      aria-label={`${img.name} entfernen`}
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
