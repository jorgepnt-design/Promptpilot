import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Prompt, StoredImage } from '../types'
import { useStore } from '../state/store'
import { emptyPrompt } from '../lib/defaults'
import { countWords } from '../lib/search'
import { safeUrl } from '../lib/exportImport'
import { MAX_IMAGES_PER_PROMPT, ImageError, formatBytes, prepareImage } from '../lib/images'
import { extractPlaceholders } from '../lib/template'
import { Sheet } from './ui'
import { TagInput } from './TagInput'
import { IconImage, IconTrash } from './Icons'

const DRAFT_DEBOUNCE = 700

export function PromptEditor({
  promptId,
  preset,
  onClose,
  onSaved,
}: {
  promptId: string | null
  preset?: Partial<Prompt>
  onClose: () => void
  onSaved?: (p: Prompt) => void
}) {
  const store = useStore()
  const existing = promptId ? store.getPrompt(promptId) : undefined
  const draftKey = promptId ?? 'neu'

  const [prompt, setPrompt] = useState<Prompt>(() =>
    existing ? { ...existing } : emptyPrompt({ language: 'Deutsch', ...preset }),
  )
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<Prompt[] | null>(null)
  const [draftOffer, setDraftOffer] = useState<Partial<Prompt> | null>(null)
  const [images, setImages] = useState<StoredImage[]>([])
  const [imageError, setImageError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    store.prompts.forEach((p) => p.tags.forEach((t) => set.add(t)))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
  }, [store.prompts])

  /* Entwurf anbieten, falls beim letzten Mal nicht gespeichert wurde */
  useEffect(() => {
    let alive = true
    store.getDraft(draftKey).then((d) => {
      if (!alive || !d) return
      const base = existing ?? emptyPrompt()
      const changed =
        (d.data.title ?? '') !== (base.title ?? '') || (d.data.body ?? '') !== (base.body ?? '')
      if (changed && ((d.data.title ?? '').trim() || (d.data.body ?? '').trim())) setDraftOffer(d.data)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey])

  /* Bilder laden */
  useEffect(() => {
    let alive = true
    store.getImages(prompt.imageIds).then((imgs) => {
      if (!alive) return
      urls.current.forEach((u) => URL.revokeObjectURL(u))
      urls.current = []
      setImages(imgs)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.imageIds.join(',')])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  /* Automatische lokale Sicherung */
  useEffect(() => {
    if (!dirty) return
    const t = window.setTimeout(() => {
      store
        .saveDraft(draftKey, {
          title: prompt.title,
          body: prompt.body,
          negative: prompt.negative,
          description: prompt.description,
          notes: prompt.notes,
          tags: prompt.tags,
          categoryId: prompt.categoryId,
          collectionIds: prompt.collectionIds,
          tool: prompt.tool,
          language: prompt.language,
          link: prompt.link,
          favorite: prompt.favorite,
        })
        .catch(() => undefined)
    }, DRAFT_DEBOUNCE)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, dirty, draftKey])

  const patch = useCallback((p: Partial<Prompt>) => {
    setPrompt((cur) => ({ ...cur, ...p }))
    setDirty(true)
    setError(null)
  }, [])

  const placeholders = useMemo(
    () => extractPlaceholders(prompt.body, prompt.negative),
    [prompt.body, prompt.negative],
  )

  const save = useCallback(
    async (force = false) => {
      if (busy) return
      if (!prompt.title.trim() && !prompt.body.trim()) {
        setError('Titel und Prompt-Text fehlen noch.')
        return
      }
      if (!prompt.title.trim()) {
        setError('Bitte einen Titel eingeben.')
        return
      }
      if (!prompt.body.trim()) {
        setError('Bitte den Prompt-Text eingeben.')
        return
      }
      if (!force) {
        const dups = store.findDuplicates(prompt)
        if (dups.length) {
          setDuplicateWarning(dups)
          return
        }
      }
      setBusy(true)
      try {
        const clean: Prompt = { ...prompt, title: prompt.title.trim(), link: safeUrl(prompt.link) }
        const saved = await store.savePrompt(clean)
        await store.clearDraft(draftKey)
        store.notify(existing ? 'Änderungen gespeichert' : 'Prompt gespeichert', 'success')
        onSaved?.(saved)
        onClose()
      } catch {
        setError('Speichern nicht möglich. Bitte erneut versuchen.')
      } finally {
        setBusy(false)
      }
    },
    [busy, prompt, store, draftKey, existing, onSaved, onClose],
  )

  /* Tastenkürzel zum Speichern */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [save])

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setImageError(null)
    const free = MAX_IMAGES_PER_PROMPT - prompt.imageIds.length
    if (free <= 0) {
      setImageError(`Es sind höchstens ${MAX_IMAGES_PER_PROMPT} Bilder je Prompt möglich.`)
      return
    }
    const chosen = Array.from(files).slice(0, free)
    const prepared: StoredImage[] = []
    for (const f of chosen) {
      try {
        prepared.push(await prepareImage(f, prompt.id))
      } catch (err) {
        setImageError(err instanceof ImageError ? err.message : `„${f.name}“ konnte nicht gelesen werden.`)
      }
    }
    if (!prepared.length) return
    // Bilder gehören zum Prompt – deshalb wird der Prompt bei Bedarf jetzt angelegt.
    if (!store.getPrompt(prompt.id)) await store.savePrompt(prompt, { keepUpdatedAt: true })
    await store.addImages(prompt.id, prepared)
    setPrompt((cur) => ({ ...cur, imageIds: [...cur.imageIds, ...prepared.map((i) => i.id)] }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeImage = async (id: string) => {
    await store.removeImage(prompt.id, id)
    setPrompt((cur) => ({ ...cur, imageIds: cur.imageIds.filter((i) => i !== id) }))
  }

  const chars = prompt.body.length
  const words = countWords(prompt.body)

  const close = async () => {
    if (dirty) {
      // Entwurf bleibt erhalten, damit nichts verloren geht.
      await store.saveDraft(draftKey, { ...prompt })
    }
    onClose()
  }

  return (
    <Sheet
      title={existing ? 'Prompt bearbeiten' : 'Neuer Prompt'}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close} disabled={busy}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={busy}>
            {busy ? 'Speichert …' : 'Speichern'}
          </button>
        </>
      }
    >
      {draftOffer && (
        <div className="notice">
          <div style={{ flex: 1 }}>
            <strong>Nicht gespeicherter Entwurf gefunden.</strong>
            <div>Er stammt vom letzten Bearbeiten dieses Prompts.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  setPrompt((cur) => ({ ...cur, ...draftOffer }))
                  setDraftOffer(null)
                  setDirty(true)
                }}
              >
                Entwurf übernehmen
              </button>
              <button
                className="btn btn-sm"
                onClick={() => {
                  void store.clearDraft(draftKey)
                  setDraftOffer(null)
                }}
              >
                Verwerfen
              </button>
            </div>
          </div>
        </div>
      )}

      {duplicateWarning && (
        <div className="notice notice-warn">
          <div style={{ flex: 1 }}>
            <strong>Dieser Prompt-Text existiert bereits.</strong>
            <div>
              Gleicher Text wie: {duplicateWarning.map((d) => d.title || 'Ohne Titel').join(', ')}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-sm btn-primary" onClick={() => save(true)}>
                Trotzdem speichern
              </button>
              <button className="btn btn-sm" onClick={() => setDuplicateWarning(null)}>
                Zurück zum Bearbeiten
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="notice notice-warn" role="alert">
          {error}
        </div>
      )}

      <div className="field">
        <label htmlFor="pp-title">Titel</label>
        <input
          id="pp-title"
          className="input"
          value={prompt.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Kurz und wiedererkennbar"
          autoComplete="off"
        />
      </div>

      <div className="field">
        <label htmlFor="pp-body">Prompt-Text</label>
        <textarea
          id="pp-body"
          className="textarea"
          value={prompt.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder={'Der vollständige Prompt.\n\nPlatzhalter in doppelten geschweiften Klammern werden zu Eingabefeldern: {{Person}}'}
          spellCheck={false}
        />
        <div className="counter">
          <span>{chars.toLocaleString('de-DE')} Zeichen</span>
          <span>{words.toLocaleString('de-DE')} Wörter</span>
          {placeholders.length > 0 && (
            <span>
              {placeholders.length} Platzhalter: {placeholders.join(', ')}
            </span>
          )}
        </div>
      </div>

      <div className="field-row two">
        <div className="field">
          <label htmlFor="pp-cat">Kategorie</label>
          <select
            id="pp-cat"
            className="input"
            value={prompt.categoryId ?? ''}
            onChange={(e) => patch({ categoryId: e.target.value || null })}
          >
            <option value="">Ohne Kategorie</option>
            {store.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pp-tool">KI-Tool oder Modell</label>
          <input
            id="pp-tool"
            className="input"
            list="pp-tools"
            value={prompt.tool}
            onChange={(e) => patch({ tool: e.target.value })}
            placeholder="z. B. Midjourney"
            autoComplete="off"
          />
          <datalist id="pp-tools">
            {store.settings.tools.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="field">
        <label htmlFor="pp-tags">Tags</label>
        <TagInput
          id="pp-tags"
          value={prompt.tags}
          onChange={(tags) => patch({ tags })}
          suggestions={allTags}
        />
      </div>

      <label className="checkbox" style={{ marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={prompt.favorite}
          onChange={(e) => patch({ favorite: e.target.checked })}
        />
        Als Favorit merken
      </label>

      <details className="more">
        <summary>Weitere Angaben</summary>
        <div className="more-body">
          <div className="field">
            <label htmlFor="pp-neg">Negativer Prompt</label>
            <textarea
              id="pp-neg"
              className="textarea"
              style={{ minHeight: 90 }}
              value={prompt.negative}
              onChange={(e) => patch({ negative: e.target.value })}
              placeholder="Was vermieden werden soll"
              spellCheck={false}
            />
          </div>
          <div className="field">
            <label htmlFor="pp-desc">Beschreibung</label>
            <input
              id="pp-desc"
              className="input"
              value={prompt.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Wofür ist dieser Prompt gedacht?"
            />
          </div>
          <div className="field">
            <label htmlFor="pp-notes">Notizen</label>
            <textarea
              id="pp-notes"
              className="textarea"
              style={{ minHeight: 80, fontFamily: 'var(--font)' }}
              value={prompt.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Eigene Hinweise, Einstellungen, Erfahrungen"
            />
          </div>
          <div className="field-row two">
            <div className="field">
              <label htmlFor="pp-lang">Sprache</label>
              <input
                id="pp-lang"
                className="input"
                list="pp-langs"
                value={prompt.language}
                onChange={(e) => patch({ language: e.target.value })}
              />
              <datalist id="pp-langs">
                {store.settings.languages.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="pp-link">Referenzlink</label>
              <input
                id="pp-link"
                className="input"
                type="url"
                inputMode="url"
                value={prompt.link}
                onChange={(e) => patch({ link: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </div>

          {store.collections.length > 0 && (
            <div className="field">
              <span className="label">Sammlungen</span>
              <div className="chips" style={{ margin: 0, padding: 0 }}>
                {store.collections.map((c) => {
                  const on = prompt.collectionIds.includes(c.id)
                  return (
                    <button
                      type="button"
                      key={c.id}
                      className="chip"
                      aria-pressed={on}
                      onClick={() =>
                        patch({
                          collectionIds: on
                            ? prompt.collectionIds.filter((x) => x !== c.id)
                            : [...prompt.collectionIds, c.id],
                        })
                      }
                    >
                      {c.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="field">
            <span className="label">Beispiel- oder Referenzbilder</span>
            {images.length > 0 && (
              <div className="thumbs" style={{ marginBottom: 10 }}>
                {images.map((img) => {
                  const url = URL.createObjectURL(img.blob)
                  urls.current.push(url)
                  return (
                    <div className="thumb" key={img.id}>
                      <img src={url} alt={img.name} />
                      <button
                        type="button"
                        onClick={() => removeImage(img.id)}
                        aria-label={`Bild ${img.name} entfernen`}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => onFiles(e.target.files)}
            />
            <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()}>
              <IconImage size={16} /> Bilder hinzufügen
            </button>
            <div className="hint">
              Höchstens {MAX_IMAGES_PER_PROMPT} Bilder, je bis {formatBytes(8 * 1024 * 1024)}. Große
              Bilder werden beim Speichern verkleinert.
            </div>
            {imageError && (
              <div className="notice notice-warn" style={{ marginTop: 10 }}>
                {imageError}
              </div>
            )}
          </div>
        </div>
      </details>

      <div className="hint">
        Absätze, Sonderzeichen und Emojis werden unverändert übernommen. Speichern mit{' '}
        <span className="kbd">Strg/Cmd + S</span>.
      </div>
    </Sheet>
  )
}
