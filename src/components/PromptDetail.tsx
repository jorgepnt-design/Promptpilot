import { ImageViewer } from './ImageViewer'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Prompt, StoredImage } from '../types'
import { useStore } from '../state/store'
import { hasPlaceholders } from '../lib/template'
import { countWords } from '../lib/search'
import { Menu, Sheet, useConfirm, useMenu } from './ui'
import { TemplateFiller } from './TemplateFiller'
import {
  IconArchive,
  IconCopy,
  IconDuplicate,
  IconEdit,
  IconHistory,
  IconLink,
  IconMore,
  IconNext,
  IconPrev,
  IconRestore,
  IconStar,
  IconTemplate,
  IconTrash,
} from './Icons'

export function PromptDetail({
  prompt,
  onClose,
  onEdit,
  onPrev,
  onNext,
  position,
}: {
  prompt: Prompt
  onClose: () => void
  onEdit: () => void
  /** Blättern innerhalb der gerade gefilterten Liste; fehlt am Rand. */
  onPrev?: (() => void) | null
  onNext?: (() => void) | null
  position?: { index: number; gesamt: number }
}) {
  const store = useStore()
  const menu = useMenu()
  const confirm = useConfirm()
  const [template, setTemplate] = useState(false)
  const [showVersions, setShowVersions] = useState(false)
  const [images, setImages] = useState<StoredImage[]>([])
  const [offen, setOffen] = useState(false)
  const [grossesBild, setGrossesBild] = useState<{ src: string; alt: string } | null>(null)

  /* Mit den Pfeiltasten blättern – aber nicht, während jemand tippt oder die
     Bildansicht offen ist. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ziel = e.target as HTMLElement | null
      const tippt = ziel && /^(INPUT|TEXTAREA|SELECT)$/.test(ziel.tagName)
      if (tippt || grossesBild) return
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault()
        onPrev()
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault()
        onNext()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onPrev, onNext, grossesBild])
  // Kurze Prompts bleiben immer offen – ein Knopf darüber wäre nur im Weg.
  const lang = prompt.body.length > 420 || prompt.body.split('\n').length > 10
  const urls = useRef<string[]>([])

  const category = store.categories.find((c) => c.id === prompt.categoryId)
  const collections = store.collections.filter((c) => prompt.collectionIds.includes(c.id))
  const isTemplate = useMemo(() => hasPlaceholders(prompt.body), [prompt.body])

  useEffect(() => {
    let alive = true
    store.getImages(prompt.imageIds).then((imgs) => alive && setImages(imgs))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt.imageIds.join(',')])

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), [])

  const menuItems = [
    {
      label: 'Duplizieren',
      icon: <IconDuplicate size={17} />,
      onSelect: async () => {
        const copy = await store.duplicatePrompt(prompt.id)
        if (copy) store.notify(`„${copy.title}“ angelegt`, 'success')
      },
    },
    {
      label: prompt.status === 'archived' ? 'Aus Archiv holen' : 'Archivieren',
      icon: prompt.status === 'archived' ? <IconRestore size={17} /> : <IconArchive size={17} />,
      onSelect: async () => {
        await store.setStatus([prompt.id], prompt.status === 'archived' ? 'active' : 'archived')
        store.notify(prompt.status === 'archived' ? 'Wieder in der Bibliothek' : 'Archiviert', 'success')
        onClose()
      },
    },
    {
      label: 'In den Papierkorb',
      icon: <IconTrash size={17} />,
      danger: true,
      separatorBefore: true,
      onSelect: async () => {
        await store.setStatus([prompt.id], 'trashed')
        store.notify('In den Papierkorb verschoben', 'success')
        onClose()
      },
    },
  ]

  return (
    <>
      <Sheet
        title={prompt.title || 'Ohne Titel'}
        onClose={onClose}
        headExtra={
          <>
            {(onPrev || onNext) && (
              <>
                <button
                  className="icon-btn"
                  onClick={() => onPrev?.()}
                  disabled={!onPrev}
                  aria-label="Vorheriger Prompt"
                  title="Vorheriger Prompt (Pfeil links)"
                >
                  <IconPrev />
                </button>
                {position && (
                  <span className="hint" style={{ minWidth: 52, textAlign: 'center' }}>
                    {position.index} / {position.gesamt}
                  </span>
                )}
                <button
                  className="icon-btn"
                  onClick={() => onNext?.()}
                  disabled={!onNext}
                  aria-label="Nächster Prompt"
                  title="Nächster Prompt (Pfeil rechts)"
                >
                  <IconNext />
                </button>
              </>
            )}
            <button
              className={`icon-btn${prompt.favorite ? ' is-active' : ''}`}
              onClick={() => store.toggleFavorite(prompt.id)}
              aria-pressed={prompt.favorite}
              aria-label={prompt.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
            >
              <IconStar filled={prompt.favorite} />
            </button>
            <button className="icon-btn" onClick={menu.open} aria-label="Weitere Aktionen">
              <IconMore />
            </button>
          </>
        }
        footer={
          <>
            <button className="btn" onClick={onEdit}>
              <IconEdit size={17} /> Bearbeiten
            </button>
            <button
              className="btn btn-primary"
              onClick={() => store.copyPrompt(prompt.id, prompt.body)}
            >
              <IconCopy size={17} /> Prompt kopieren
            </button>
          </>
        }
      >
        {prompt.isExample && (
          <div className="notice" style={{ marginBottom: 14 }}>
            Beispiel-Prompt. Sie können ihn bearbeiten, duplizieren oder löschen.
          </div>
        )}

        <div className={images.length > 0 ? 'detail-split' : undefined}>
          <div className="detail-main">

        <div className="detail-actions">
          {isTemplate && (
            <button className="btn btn-sm btn-primary" onClick={() => setTemplate(true)}>
              <IconTemplate size={16} /> Vorlage verwenden
            </button>
          )}
          {prompt.negative && (
            <button
              className="btn btn-sm"
              onClick={() => store.copyPrompt(prompt.id, prompt.negative, 'Negativer Prompt kopiert')}
            >
              <IconCopy size={16} /> Negativen Prompt kopieren
            </button>
          )}
          {prompt.versions.length > 0 && (
            <button className="btn btn-sm" onClick={() => setShowVersions((v) => !v)}>
              <IconHistory size={16} /> Verlauf ({prompt.versions.length})
            </button>
          )}
        </div>

        {showVersions && (
          <div className="section">
            <h4>Frühere Fassungen</h4>
            <div className="list-rows">
              {prompt.versions.map((v) => (
                <div className="list-row" key={v.at}>
                  <div className="grow">
                    <div>{new Date(v.at).toLocaleString('de-DE')}</div>
                    <div className="hint" style={{ margin: 0 }}>
                      {v.title || 'Ohne Titel'} · {v.body.length.toLocaleString('de-DE')} Zeichen
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      const ok = await confirm.ask({
                        title: 'Fassung wiederherstellen',
                        message:
                          'Die aktuelle Fassung wird dabei nicht gelöscht, sondern zusätzlich in den Verlauf aufgenommen.',
                        confirmLabel: 'Wiederherstellen',
                      })
                      if (!ok) return
                      await store.restoreVersion(prompt.id, v.at)
                      store.notify('Frühere Fassung wiederhergestellt', 'success')
                    }}
                  >
                    Wiederherstellen
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {prompt.description && (
          <div className="section">
            <h4>Beschreibung</h4>
            <p style={{ margin: 0, color: 'var(--text-soft)' }}>{prompt.description}</p>
          </div>
        )}

        <div className="section">
          <h4>Prompt</h4>
          <pre className={`prompt-text${lang && !offen ? ' is-collapsed' : ''}`}>{prompt.body}</pre>
          {lang && (
            <button
              className="btn btn-sm"
              style={{ marginTop: 8 }}
              onClick={() => setOffen((v) => !v)}
              aria-expanded={offen}
            >
              {offen ? 'Einklappen' : 'Ganzen Prompt anzeigen'}
            </button>
          )}
          <div className="counter">
            <span>{prompt.body.length.toLocaleString('de-DE')} Zeichen</span>
            <span>{countWords(prompt.body).toLocaleString('de-DE')} Wörter</span>
            <span>{prompt.copyCount}× kopiert</span>
          </div>
        </div>

        {prompt.negative && (
          <div className="section">
            <h4>Negativer Prompt</h4>
            <pre className="prompt-text">{prompt.negative}</pre>
          </div>
        )}

        {prompt.notes && (
          <div className="section">
            <h4>Notizen</h4>
            <p style={{ margin: 0, whiteSpace: 'pre-wrap', color: 'var(--text-soft)' }}>{prompt.notes}</p>
          </div>
        )}

        <div className="section">
          <h4>Angaben</h4>
          <dl className="meta-table">
            <dt>Kategorie</dt>
            <dd>{category?.name ?? 'Ohne Kategorie'}</dd>
            <dt>KI-Tool</dt>
            <dd>{prompt.tool || '–'}</dd>
            <dt>Sprache</dt>
            <dd>{prompt.language || '–'}</dd>
            <dt>Tags</dt>
            <dd>{prompt.tags.length ? prompt.tags.join(', ') : '–'}</dd>
            <dt>Sammlungen</dt>
            <dd>{collections.length ? collections.map((c) => c.name).join(', ') : '–'}</dd>
            {prompt.link && (
              <>
                <dt>Referenz</dt>
                <dd>
                  <a href={prompt.link} target="_blank" rel="noopener noreferrer nofollow">
                    <IconLink size={14} style={{ verticalAlign: -2 }} /> Link öffnen
                  </a>
                </dd>
              </>
            )}
            <dt>Erstellt</dt>
            <dd>{new Date(prompt.createdAt).toLocaleString('de-DE')}</dd>
            <dt>Geändert</dt>
            <dd>{new Date(prompt.updatedAt).toLocaleString('de-DE')}</dd>
            <dt>Zuletzt verwendet</dt>
            <dd>{prompt.lastUsedAt ? new Date(prompt.lastUsedAt).toLocaleString('de-DE') : '–'}</dd>
          </dl>
        </div>

          </div>

          {images.length > 0 && (
            <aside className="detail-media">
              <h4>Vorschau</h4>
              {images.map((img) => {
                const url = URL.createObjectURL(img.blob)
                urls.current.push(url)
                return (
                  <figure className="preview" key={img.id}>
                    <img
                      src={url}
                      alt={img.name}
                      loading="lazy"
                      style={{ cursor: 'zoom-in' }}
                      onClick={() => setGrossesBild({ src: url, alt: img.name })}
                    />
                  </figure>
                )
              })}
            </aside>
          )}
        </div>
      </Sheet>
      {grossesBild && (
        <ImageViewer src={grossesBild.src} alt={grossesBild.alt} onClose={() => setGrossesBild(null)} />
      )}

      {menu.anchor && <Menu items={menuItems} anchor={menu.anchor} onClose={menu.close} />}
      {template && <TemplateFiller prompt={prompt} onClose={() => setTemplate(false)} />}
      {confirm.element}
    </>
  )
}
