import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Filters, Prompt, PromptStatus } from '../types'
import { useStore } from '../state/store'
import { filterPrompts, tokenize } from '../lib/search'
import { buildMarkdown, buildPlainText, buildJsonBackup, jsonBlob } from '../lib/exportImport'
import { downloadBlob, timestampName } from '../lib/clipboard'
import { PromptCard } from './PromptCard'
import { PromptEditor } from './PromptEditor'
import { PromptDetail } from './PromptDetail'
import { TemplateFiller } from './TemplateFiller'
import { Combiner } from './Combiner'
import { Menu, Sheet, useConfirm, useMenu } from './ui'
import {
  IconArchive,
  IconGrid,
  IconPlus,
  IconRestore,
  IconRows,
  IconSearch,
  IconStack,
  IconTrash,
  IconClose,
} from './Icons'
import { useRoute } from '../lib/router'

const PAGE_SIZE = 60

const EMPTY_FILTERS: Filters = {
  query: '',
  categoryId: null,
  tags: [],
  tool: null,
  language: null,
  favoritesOnly: false,
  withImagesOnly: false,
  collectionId: null,
}

export interface BrowserProps {
  status: PromptStatus
  title: string
  description?: string
  lockFavorites?: boolean
  lockCollectionId?: string | null
  emptyTitle: string
  emptyText: string
}

export function PromptBrowser({
  status,
  title,
  description,
  lockFavorites = false,
  lockCollectionId = null,
  emptyTitle,
  emptyText,
}: BrowserProps) {
  const store = useStore()
  const route = useRoute()
  const confirm = useConfirm()
  const bulkMenu = useMenu()

  const [filters, setFilters] = useState<Filters>({
    ...EMPTY_FILTERS,
    favoritesOnly: lockFavorites,
    collectionId: lockCollectionId,
  })
  const [showFilters, setShowFilters] = useState(false)
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [selection, setSelection] = useState<string[]>([])
  const [selectionMode, setSelectionMode] = useState(false)
  const [templateFor, setTemplateFor] = useState<Prompt | null>(null)
  const [combine, setCombine] = useState(false)
  const [bulkTag, setBulkTag] = useState(false)
  const [bulkTagValue, setBulkTagValue] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const openId = route.query.get('prompt')
  const mode = route.query.get('modus')
  const openPrompt = openId ? store.getPrompt(openId) : undefined

  const terms = useMemo(() => tokenize(filters.query), [filters.query])

  const results = useMemo(
    () =>
      filterPrompts({
        prompts: store.prompts,
        filters: { ...filters, favoritesOnly: lockFavorites || filters.favoritesOnly, collectionId: lockCollectionId ?? filters.collectionId },
        sort: store.settings.sort,
        index: store.index,
        status,
      }),
    [store.prompts, store.index, store.settings.sort, filters, status, lockFavorites, lockCollectionId],
  )

  const visible = results.slice(0, limit)

  useEffect(() => setLimit(PAGE_SIZE), [filters, status])

  /* Nachladen beim Scrollen */
  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) setLimit((l) => (l < results.length ? l + PAGE_SIZE : l))
    })
    io.observe(el)
    return () => io.disconnect()
  }, [results.length])

  /* Tastenkürzel */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = /INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        route.setQueryParam('modus', 'neu')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [route])

  const allTags = useMemo(() => {
    const counts = new Map<string, number>()
    store.prompts
      .filter((p) => p.status === status)
      .forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)))
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
      .map(([t]) => t)
  }, [store.prompts, status])

  const tools = useMemo(() => {
    const set = new Set<string>()
    store.prompts.filter((p) => p.status === status && p.tool).forEach((p) => set.add(p.tool))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
  }, [store.prompts, status])

  const languages = useMemo(() => {
    const set = new Set<string>()
    store.prompts.filter((p) => p.status === status && p.language).forEach((p) => set.add(p.language))
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'))
  }, [store.prompts, status])

  const activeFilterCount =
    (filters.categoryId ? 1 : 0) +
    filters.tags.length +
    (filters.tool ? 1 : 0) +
    (filters.language ? 1 : 0) +
    (!lockFavorites && filters.favoritesOnly ? 1 : 0) +
    (filters.withImagesOnly ? 1 : 0) +
    (!lockCollectionId && filters.collectionId ? 1 : 0) +
    (filters.query ? 1 : 0)

  const resetFilters = () =>
    setFilters({ ...EMPTY_FILTERS, favoritesOnly: lockFavorites, collectionId: lockCollectionId })

  const openPromptView = useCallback(
    (id: string) => route.setQueryParam('prompt', id),
    [route],
  )
  const closeOverlay = useCallback(() => {
    const q = new URLSearchParams(route.query)
    q.delete('prompt')
    q.delete('modus')
    route.navigate(route.path, q, true)
  }, [route])

  const toggleSelect = (id: string) => {
    setSelectionMode(true)
    setSelection((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  const selectedPrompts = useMemo(
    () => selection.map((id) => store.getPrompt(id)).filter(Boolean) as Prompt[],
    [selection, store],
  )

  const endSelection = () => {
    setSelection([])
    setSelectionMode(false)
  }

  const bulkItems = [
    {
      label: 'Als Markdown exportieren',
      onSelect: () => {
        downloadBlob(
          new Blob([buildMarkdown(selectedPrompts, store.categories)], { type: 'text/markdown' }),
          timestampName('promptpilot-auswahl', 'md'),
        )
        store.notify('Markdown-Datei erstellt (ohne Bilder)', 'success')
      },
    },
    {
      label: 'Als Text exportieren',
      onSelect: () => {
        downloadBlob(
          new Blob([buildPlainText(selectedPrompts)], { type: 'text/plain' }),
          timestampName('promptpilot-auswahl', 'txt'),
        )
        store.notify('Textdatei erstellt (ohne Bilder)', 'success')
      },
    },
    {
      label: 'Als JSON exportieren',
      onSelect: () => {
        downloadBlob(
          jsonBlob(
            buildJsonBackup({
              prompts: selectedPrompts,
              categories: store.categories,
              collections: store.collections,
            }),
          ),
          timestampName('promptpilot-auswahl', 'json'),
        )
        store.notify('JSON-Datei erstellt (ohne Bilder)', 'success')
      },
    },
    ...store.collections.map((c) => ({
      label: `Zu „${c.name}“ hinzufügen`,
      separatorBefore: c.id === store.collections[0]?.id,
      onSelect: async () => {
        await store.setCollectionsFor(selection, c.id, true)
        store.notify(`${selection.length} Prompts zu „${c.name}“ hinzugefügt`, 'success')
      },
    })),
  ]

  return (
    <>
      <div className="page">
        <div className="searchblock">
          <div className="search">
          <IconSearch size={18} />
          <input
            ref={searchRef}
            type="search"
            value={filters.query}
            onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            placeholder="Titel, Text, Tags, Tool durchsuchen"
            aria-label="Prompts durchsuchen"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
          />
          {filters.query && (
            <button
              className="icon-btn clear"
              onClick={() => setFilters((f) => ({ ...f, query: '' }))}
              aria-label="Suche leeren"
            >
              <IconClose size={18} />
            </button>
          )}
        </div>

        <div className="chips">
          <button
            className={`chip${showFilters ? ' is-active' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
          >
            Filter{activeFilterCount ? ` (${activeFilterCount})` : ''}
          </button>
          {!lockFavorites && (
            <button
              className="chip"
              aria-pressed={filters.favoritesOnly}
              onClick={() => setFilters((f) => ({ ...f, favoritesOnly: !f.favoritesOnly }))}
            >
              Favoriten
            </button>
          )}
          <button
            className="chip"
            aria-pressed={filters.withImagesOnly}
            onClick={() => setFilters((f) => ({ ...f, withImagesOnly: !f.withImagesOnly }))}
            title="Nur Prompts mit angehängtem Bild"
          >
            Mit Bild
          </button>
          {store.categories.map((c) => (
            <button
              key={c.id}
              className="chip"
              aria-pressed={filters.categoryId === c.id}
              onClick={() =>
                setFilters((f) => ({ ...f, categoryId: f.categoryId === c.id ? null : c.id }))
              }
            >
              {c.name}
            </button>
          ))}
        </div>
        </div>

        <div className="page-head">
          <div>
            <h1>{title}</h1>
            {description && <p>{description}</p>}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div className="segmented" role="group" aria-label="Ansicht">
              <button
                className={store.settings.viewMode === 'cards' ? 'is-active' : ''}
                onClick={() => store.updateSettings({ viewMode: 'cards' })}
                aria-label="Kartenansicht"
              >
                <IconGrid size={16} />
              </button>
              <button
                className={store.settings.viewMode === 'list' ? 'is-active' : ''}
                onClick={() => store.updateSettings({ viewMode: 'list' })}
                aria-label="Listenansicht"
              >
                <IconRows size={16} />
              </button>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="setting-card">
            <div className="field-row two">
              <div className="field">
                <label htmlFor="f-tool">KI-Tool</label>
                <select
                  id="f-tool"
                  className="input"
                  value={filters.tool ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, tool: e.target.value || null }))}
                >
                  <option value="">Alle</option>
                  {tools.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="f-lang">Sprache</label>
                <select
                  id="f-lang"
                  className="input"
                  value={filters.language ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value || null }))}
                >
                  <option value="">Alle</option>
                  {languages.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {!lockCollectionId && store.collections.length > 0 && (
              <div className="field">
                <label htmlFor="f-col">Sammlung</label>
                <select
                  id="f-col"
                  className="input"
                  value={filters.collectionId ?? ''}
                  onChange={(e) => setFilters((f) => ({ ...f, collectionId: e.target.value || null }))}
                >
                  <option value="">Alle</option>
                  {store.collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {allTags.length > 0 && (
              <div className="field" style={{ marginBottom: 0 }}>
                <span className="label">Tags</span>
                <div className="chips" style={{ margin: 0, padding: 0 }}>
                  {allTags.slice(0, 40).map((t) => (
                    <button
                      key={t}
                      className="chip"
                      aria-pressed={filters.tags.includes(t)}
                      onClick={() =>
                        setFilters((f) => ({
                          ...f,
                          tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t],
                        }))
                      }
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="result-line">
          <span>
            {results.length.toLocaleString('de-DE')}{' '}
            {results.length === 1 ? 'Prompt' : 'Prompts'}
            {activeFilterCount > 0 && ' gefunden'}
          </span>
          <select
            className="select"
            value={store.settings.sort}
            onChange={(e) => store.updateSettings({ sort: e.target.value as never })}
            aria-label="Sortierung"
          >
            <option value="updated">Zuletzt bearbeitet</option>
            <option value="created">Zuletzt erstellt</option>
            <option value="used">Zuletzt verwendet</option>
            <option value="alpha">Alphabetisch</option>
            <option value="copied">Am häufigsten kopiert</option>
          </select>
          {activeFilterCount > 0 && (
            <button className="btn btn-sm" onClick={resetFilters}>
              Filter zurücksetzen
            </button>
          )}
          {status === 'active' && (
            // Auf dem Laptop ist der runde Knopf unten rechts ausgeblendet –
            // ohne diesen hier gäbe es dort keinen Weg zu einem neuen Prompt.
            <button
              className="btn btn-sm btn-primary neuer-prompt"
              onClick={() => route.setQueryParam('modus', 'neu')}
              title="Neuer Prompt (Taste N)"
            >
              <IconPlus size={16} /> Neuer Prompt
            </button>
          )}
          {!selectionMode && results.length > 0 && (
            <button className="btn btn-sm" onClick={() => setSelectionMode(true)}>
              Auswählen
            </button>
          )}
        </div>

        {selectionMode && (
          <div className="selectbar">
            <strong>{selection.length} ausgewählt</strong>
            <button
              className="btn btn-sm"
              onClick={() => setSelection(visible.map((p) => p.id))}
            >
              Alle sichtbaren
            </button>
            {selection.length > 0 && (
              <>
                <button className="btn btn-sm" onClick={() => setBulkTag(true)}>
                  Taggen
                </button>
                <button className="btn btn-sm" onClick={() => setCombine(true)}>
                  <IconStack size={15} /> Zusammenstellen
                </button>
                <button className="btn btn-sm" onClick={bulkMenu.open}>
                  Mehr
                </button>
                {status !== 'trashed' ? (
                  <>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        await store.setStatus(selection, status === 'archived' ? 'active' : 'archived')
                        store.notify(
                          status === 'archived' ? 'Zurück in der Bibliothek' : 'Archiviert',
                          'success',
                        )
                        endSelection()
                      }}
                    >
                      {status === 'archived' ? <IconRestore size={15} /> : <IconArchive size={15} />}
                      {status === 'archived' ? 'Zurückholen' : 'Archivieren'}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        await store.setStatus(selection, 'trashed')
                        store.notify(`${selection.length} in den Papierkorb`, 'success')
                        endSelection()
                      }}
                    >
                      <IconTrash size={15} /> Papierkorb
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="btn btn-sm"
                      onClick={async () => {
                        await store.setStatus(selection, 'active')
                        store.notify('Wiederhergestellt', 'success')
                        endSelection()
                      }}
                    >
                      <IconRestore size={15} /> Wiederherstellen
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={async () => {
                        const ok = await confirm.ask({
                          title: 'Endgültig löschen',
                          message: `${selection.length} Prompts werden unwiderruflich gelöscht.`,
                          confirmLabel: 'Endgültig löschen',
                          danger: true,
                        })
                        if (!ok) return
                        await store.purgePrompts(selection)
                        store.notify('Endgültig gelöscht', 'success')
                        endSelection()
                      }}
                    >
                      <IconTrash size={15} /> Endgültig löschen
                    </button>
                  </>
                )}
              </>
            )}
            <div className="spacer" />
            <button className="btn btn-sm" onClick={endSelection}>
              Fertig
            </button>
          </div>
        )}

        {results.length === 0 ? (
          <div className="empty">
            <h3>{activeFilterCount ? 'Keine Treffer' : emptyTitle}</h3>
            <p>
              {activeFilterCount
                ? 'Für diese Kombination aus Suche und Filtern gibt es nichts. Ein anderer Begriff oder weniger Filter helfen weiter.'
                : emptyText}
            </p>
            <div className="empty-actions">
              {activeFilterCount ? (
                <button className="btn btn-primary" onClick={resetFilters}>
                  Filter zurücksetzen
                </button>
              ) : (
                status === 'active' && (
                  <>
                    <button
                      className="btn btn-primary"
                      onClick={() => route.setQueryParam('modus', 'neu')}
                    >
                      <IconPlus size={17} /> Ersten Prompt erstellen
                    </button>
                    {!store.settings.examplesLoaded && (
                      <button className="btn" onClick={() => store.loadExamples()}>
                        Beispiel-Prompts laden
                      </button>
                    )}
                  </>
                )
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={`grid ${store.settings.viewMode}`}>
              {visible.map((p) => (
                <PromptCard
                  key={p.id}
                  prompt={p}
                  terms={terms}
                  viewMode={store.settings.viewMode}
                  categoryName={store.categories.find((c) => c.id === p.categoryId)?.name ?? ''}
                  selectionMode={selectionMode}
                  selected={selection.includes(p.id)}
                  onOpen={() => openPromptView(p.id)}
                  onEdit={() => {
                    const q = new URLSearchParams(route.query)
                    q.set('prompt', p.id)
                    q.set('modus', 'bearbeiten')
                    route.navigate(route.path, q)
                  }}
                  onToggleSelect={() => toggleSelect(p.id)}
                  onUseTemplate={() => setTemplateFor(p)}
                />
              ))}
            </div>
            {limit < results.length && (
              <div ref={sentinel} className="center-note">
                <button className="btn btn-sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                  Weitere {Math.min(PAGE_SIZE, results.length - limit)} anzeigen
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {status === 'active' && (
        <button
          className="fab"
          onClick={() => route.setQueryParam('modus', 'neu')}
          aria-label="Neuen Prompt erstellen"
        >
          <IconPlus size={26} />
        </button>
      )}

      {mode === 'neu' && <PromptEditor promptId={null} onClose={closeOverlay} />}
      {openPrompt && mode === 'bearbeiten' && (
        <PromptEditor promptId={openPrompt.id} onClose={closeOverlay} />
      )}
      {openPrompt && mode !== 'bearbeiten' && (
        <PromptDetail
          prompt={openPrompt}
          onClose={closeOverlay}
          onEdit={() => {
            const q = new URLSearchParams(route.query)
            q.set('modus', 'bearbeiten')
            route.navigate(route.path, q, true)
          }}
        />
      )}
      {templateFor && <TemplateFiller prompt={templateFor} onClose={() => setTemplateFor(null)} />}
      {combine && (
        <Combiner
          prompts={selectedPrompts}
          onClose={() => {
            setCombine(false)
          }}
        />
      )}
      {bulkTag && (
        <Sheet
          title="Tags für die Auswahl"
          narrow
          onClose={() => setBulkTag(false)}
          footer={
            <>
              <button className="btn" onClick={() => setBulkTag(false)}>
                Abbrechen
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const tags = bulkTagValue
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean)
                  await store.addTagsTo(selection, tags)
                  store.notify(`${selection.length} Prompts ergänzt`, 'success')
                  setBulkTagValue('')
                  setBulkTag(false)
                }}
              >
                Hinzufügen
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="bulk-tags">Tags, durch Komma getrennt</label>
            <input
              id="bulk-tags"
              className="input"
              value={bulkTagValue}
              onChange={(e) => setBulkTagValue(e.target.value)}
              placeholder="Porträt, Licht, Vorlage"
            />
            <div className="hint">Vorhandene Tags der ausgewählten Prompts bleiben erhalten.</div>
          </div>
        </Sheet>
      )}
      {bulkMenu.anchor && (
        <Menu items={bulkItems} anchor={bulkMenu.anchor} onClose={bulkMenu.close} />
      )}
      {confirm.element}
    </>
  )
}
