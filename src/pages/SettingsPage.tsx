import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { nachReihenfolge, verschiebe } from '../lib/order'
import { IconNext, IconPrev } from '../components/Icons'
import { Sheet, useConfirm } from '../components/ui'
import { SyncPanel } from '../components/SyncPanel'
import {
  ImportError,
  buildJsonBackup,
  buildMarkdown,
  buildZipBackup,
  jsonBlob,
  parseImportFile,
  type ParsedImport,
} from '../lib/exportImport'
import { downloadBlob, timestampName } from '../lib/clipboard'
import { estimateStorage, getAll, STORES } from '../lib/db'
import type { StoredImage, ThemeMode } from '../types'
import { formatBytes } from '../lib/images'
import { normalizeForCompare } from '../lib/search'
import { IconDownload, IconPlus, IconTrash, IconUpload } from '../components/Icons'
import { usePwa } from '../lib/pwa'

/** Zwei kleine Pfeile zum Verschieben einer Zeile. */
function Sortierpfeile({
  nachOben,
  nachUnten,
  name,
}: {
  nachOben: (() => void) | null
  nachUnten: (() => void) | null
  name: string
}) {
  return (
    <>
      <button
        className="icon-btn"
        onClick={() => nachOben?.()}
        disabled={!nachOben}
        aria-label={`${name} nach oben`}
        title="Nach oben"
        style={{ transform: 'rotate(90deg)' }}
      >
        <IconPrev size={16} />
      </button>
      <button
        className="icon-btn"
        onClick={() => nachUnten?.()}
        disabled={!nachUnten}
        aria-label={`${name} nach unten`}
        title="Nach unten"
        style={{ transform: 'rotate(90deg)' }}
      >
        <IconNext size={16} />
      </button>
    </>
  )
}

export function SettingsPage() {
  const store = useStore()
  const confirm = useConfirm()
  const pwa = usePwa()
  const fileRef = useRef<HTMLInputElement>(null)
  const [newCategory, setNewCategory] = useState('')
  const [newTool, setNewTool] = useState('')
  const [renaming, setRenaming] = useState<{ kind: 'category' | 'tag'; id: string; value: string } | null>(
    null,
  )
  const [deleteCat, setDeleteCat] = useState<{ id: string; name: string; target: string } | null>(null)
  const [importData, setImportData] = useState<ParsedImport | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    estimateStorage().then(setStorage)
  }, [store.prompts.length])

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>()
    store.prompts.forEach((p) => p.tags.forEach((t) => m.set(t, (m.get(t) ?? 0) + 1)))
    const liste = Array.from(m.entries()).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'),
    )
    // Selbst gewählte Reihenfolge schlägt die Sortierung nach Häufigkeit.
    return nachReihenfolge(liste, store.settings.tagOrder, ([t]) => t)
  }, [store.prompts, store.settings.tagOrder])

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>()
    store.prompts.forEach((p) => p.categoryId && m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1))
    return m
  }, [store.prompts])

  const loadImages = () => getAll<StoredImage>(STORES.images)

  const exportJson = () => {
    downloadBlob(
      jsonBlob(
        buildJsonBackup({
          prompts: store.prompts,
          categories: store.categories,
          collections: store.collections,
          settings: store.settings,
        }),
      ),
      timestampName('promptpilot-daten', 'json'),
    )
    store.notify('JSON-Export erstellt (ohne Bilddateien)', 'success')
  }

  const exportZip = async () => {
    setBusy(true)
    try {
      const images = await loadImages()
      const blob = await buildZipBackup({
        prompts: store.prompts,
        categories: store.categories,
        collections: store.collections,
        settings: store.settings,
        images,
      })
      downloadBlob(blob, timestampName('promptpilot-sicherung', 'zip'))
      store.notify(`Sicherung erstellt (${images.length} Bilder enthalten)`, 'success')
    } catch {
      store.notify('Die Sicherung konnte nicht erstellt werden.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    setImportError(null)
    try {
      const parsed = await parseImportFile(file)
      setImportData(parsed)
    } catch (err) {
      setImportError(
        err instanceof ImportError ? err.message : 'Die Datei konnte nicht gelesen werden.',
      )
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const duplicateCount = useMemo(() => {
    if (!importData) return 0
    const known = new Set(
      store.prompts.map((p) => normalizeForCompare(p.body) + '|' + p.title.toLowerCase()),
    )
    const ids = new Set(store.prompts.map((p) => p.id))
    return importData.prompts.filter(
      (p) => ids.has(p.id) || known.has(normalizeForCompare(p.body) + '|' + p.title.toLowerCase()),
    ).length
  }, [importData, store.prompts])

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Einstellungen</h1>
          <p>Darstellung, Ordnung, Sicherung und Geräte-Abgleich.</p>
        </div>
      </div>

      {/* ------------------------------ Darstellung ------------------------------ */}
      <div className="setting-card">
        <h3>Darstellung</h3>
        <p>Die Auswahl wird gemerkt und beim nächsten Öffnen wiederhergestellt.</p>
        <div className="setting-row">
          <span className="grow">Farbschema</span>
          <div className="segmented" role="group" aria-label="Farbschema">
            {(
              [
                ['system', 'System'],
                ['light', 'Hell'],
                ['dark', 'Dunkel'],
              ] as [ThemeMode, string][]
            ).map(([val, label]) => (
              <button
                key={val}
                className={store.settings.theme === val ? 'is-active' : ''}
                onClick={() => store.updateSettings({ theme: val })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="setting-row">
          <span className="grow">Ansicht</span>
          <div className="segmented" role="group" aria-label="Ansicht">
            <button
              className={store.settings.viewMode === 'cards' ? 'is-active' : ''}
              onClick={() => store.updateSettings({ viewMode: 'cards' })}
            >
              Karten
            </button>
            <button
              className={store.settings.viewMode === 'list' ? 'is-active' : ''}
              onClick={() => store.updateSettings({ viewMode: 'list' })}
            >
              Liste
            </button>
          </div>
        </div>
      </div>

      {/* ------------------------------ Kategorien ------------------------------ */}
      <div className="setting-card">
        <h3>Kategorien</h3>
        <p>
          Beim Löschen einer Kategorie bleiben die Prompts erhalten – Sie wählen vorher, wohin sie
          umziehen.
        </p>
        <div className="list-rows">
          {store.categories.map((c, i) => (
            <div className="list-row" key={c.id}>
              <Sortierpfeile
                name={`Kategorie ${c.name}`}
                nachOben={i > 0 ? () => store.moveCategory(c.id, -1) : null}
                nachUnten={i < store.categories.length - 1 ? () => store.moveCategory(c.id, 1) : null}
              />
              <span className="grow">{c.name}</span>
              <span className="badge">{categoryCounts.get(c.id) ?? 0}</span>
              <button
                className="btn btn-sm"
                onClick={() => setRenaming({ kind: 'category', id: c.id, value: c.name })}
              >
                Umbenennen
              </button>
              <button
                className="icon-btn"
                aria-label={`Kategorie ${c.name} löschen`}
                onClick={() =>
                  setDeleteCat({
                    id: c.id,
                    name: c.name,
                    target: store.categories.find((x) => x.id !== c.id)?.id ?? '',
                  })
                }
              >
                <IconTrash size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="setting-row" style={{ marginTop: 12 }}>
          <input
            className="input grow"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Neue Kategorie"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newCategory.trim()) {
                store.addCategory(newCategory)
                setNewCategory('')
              }
            }}
          />
          <button
            className="btn"
            disabled={!newCategory.trim()}
            onClick={async () => {
              await store.addCategory(newCategory)
              setNewCategory('')
            }}
          >
            <IconPlus size={17} /> Hinzufügen
          </button>
        </div>
      </div>

      {/* --------------------------------- Tags --------------------------------- */}
      <div className="setting-card">
        <h3>Tags</h3>
        <p>Tags entstehen beim Erstellen von Prompts. Hier lassen sie sich vereinheitlichen.</p>
        {tagCounts.length === 0 ? (
          <div className="hint">Noch keine Tags vergeben.</div>
        ) : (
          <div className="list-rows">
            {tagCounts.map(([tag, count], i) => (
              <div className="list-row" key={tag}>
                <Sortierpfeile
                  name={`Tag ${tag}`}
                  nachOben={
                    i > 0
                      ? () =>
                          store.updateSettings({
                            tagOrder: verschiebe(tagCounts.map(([t]) => t), i, -1),
                          })
                      : null
                  }
                  nachUnten={
                    i < tagCounts.length - 1
                      ? () =>
                          store.updateSettings({
                            tagOrder: verschiebe(tagCounts.map(([t]) => t), i, 1),
                          })
                      : null
                  }
                />
                <span className="grow">#{tag}</span>
                <span className="badge">{count}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => setRenaming({ kind: 'tag', id: tag, value: tag })}
                >
                  Umbenennen
                </button>
                <button
                  className="icon-btn"
                  aria-label={`Tag ${tag} entfernen`}
                  onClick={async () => {
                    const ok = await confirm.ask({
                      title: `Tag „${tag}“ entfernen`,
                      message: `Der Tag wird von ${count} Prompts entfernt. Die Prompts selbst bleiben erhalten.`,
                      confirmLabel: 'Entfernen',
                      danger: true,
                    })
                    if (!ok) return
                    await store.deleteTag(tag)
                    store.notify('Tag entfernt', 'success')
                  }}
                >
                  <IconTrash size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ------------------------------- KI-Tools ------------------------------- */}
      <div className="setting-card">
        <h3>KI-Tools</h3>
        <p>Diese Vorschläge erscheinen im Editor. Eigene Einträge sind jederzeit möglich.</p>
        <div className="list-rows">
          {store.settings.tools.map((t, i) => (
            <div className="list-row" key={t}>
              <Sortierpfeile
                name={t}
                nachOben={
                  i > 0
                    ? () => store.updateSettings({ tools: verschiebe(store.settings.tools, i, -1) })
                    : null
                }
                nachUnten={
                  i < store.settings.tools.length - 1
                    ? () => store.updateSettings({ tools: verschiebe(store.settings.tools, i, 1) })
                    : null
                }
              />
              <span className="grow">{t}</span>
              <button
                className="icon-btn"
                aria-label={`${t} aus den Vorschlägen entfernen`}
                onClick={() =>
                  store.updateSettings({ tools: store.settings.tools.filter((x) => x !== t) })
                }
              >
                <IconTrash size={17} />
              </button>
            </div>
          ))}
        </div>
        <div className="setting-row" style={{ marginTop: 12 }}>
          <input
            className="input grow"
            value={newTool}
            onChange={(e) => setNewTool(e.target.value)}
            placeholder="Weiteres Tool"
          />
          <button
            className="btn"
            disabled={!newTool.trim() || store.settings.tools.includes(newTool.trim())}
            onClick={() => {
              store.updateSettings({ tools: [...store.settings.tools, newTool.trim()] })
              setNewTool('')
            }}
          >
            <IconPlus size={17} /> Hinzufügen
          </button>
        </div>
      </div>

      {/* --------------------------- Sicherung und Daten --------------------------- */}
      <div className="setting-card">
        <h3>Sicherung und Daten</h3>
        <p>
          Alles liegt in der Datenbank dieses Browsers. Werden Browser- oder Website-Daten gelöscht,
          gehen auch die Prompts verloren. Eine regelmäßige Sicherung schützt davor.
        </p>
        <div className="setting-row">
          <span className="grow">
            {store.prompts.length.toLocaleString('de-DE')} Prompts,{' '}
            {store.categories.length} Kategorien, {store.collections.length} Sammlungen
            {storage && ` · ${formatBytes(storage.usage)} belegt`}
          </span>
        </div>
        <div className="setting-row" style={{ gap: 8 }}>
          <button className="btn" onClick={exportZip} disabled={busy}>
            <IconDownload size={17} /> Vollständige Sicherung (ZIP mit Bildern)
          </button>
          <button className="btn" onClick={exportJson}>
            <IconDownload size={17} /> Nur Daten (JSON)
          </button>
          <button
            className="btn"
            onClick={() => {
              downloadBlob(
                new Blob([buildMarkdown(store.prompts, store.categories)], { type: 'text/markdown' }),
                timestampName('promptpilot-prompts', 'md'),
              )
              store.notify('Markdown-Datei erstellt (ohne Bilder)', 'success')
            }}
          >
            <IconDownload size={17} /> Alles als Markdown
          </button>
        </div>
        <div className="setting-row">
          <input
            ref={fileRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            className="sr-only"
            onChange={(e) => onImportFile(e.target.files?.[0])}
          />
          <button className="btn grow" onClick={() => fileRef.current?.click()}>
            <IconUpload size={17} /> Daten importieren (JSON oder ZIP)
          </button>
        </div>
        {importError && (
          <div className="notice notice-warn" role="alert">
            {importError}
          </div>
        )}
        {store.storageWarning && (
          <div className="notice notice-warn">
            <div>
              <strong>Dieser Browser erlaubt keine dauerhafte Speicherung.</strong> Die App läuft,
              die Daten bestehen aber nur bis zum Schließen des Tabs. Häufige Ursachen: privater
              Modus oder eingebettete Vorschau.
            </div>
          </div>
        )}
        {!store.settings.examplesLoaded && (
          <div className="setting-row">
            <span className="grow hint" style={{ margin: 0 }}>
              Beispiel-Prompts zum Ausprobieren – deutlich als Beispiel gekennzeichnet.
            </span>
            <button className="btn btn-sm" onClick={() => store.loadExamples()}>
              Beispiele laden
            </button>
          </div>
        )}
      </div>

      <SyncPanel />

      {/* ------------------------------ Installation ------------------------------ */}
      <div className="setting-card">
        <h3>Auf dem Gerät installieren</h3>
        <p>
          PromptPilot lässt sich wie eine App starten und funktioniert nach dem ersten Laden auch
          offline.
        </p>
        <div className="setting-row">
          <span className="grow">
            <strong>iPhone:</strong> in Safari öffnen, „Teilen“ antippen, „Zum Home-Bildschirm“
            wählen. Die App startet danach im eigenen Fenster.
          </span>
        </div>
        <div className="setting-row">
          <span className="grow">
            <strong>Laptop:</strong> in Chrome oder Edge über das Installationssymbol in der
            Adressleiste.
          </span>
          {pwa.installable && (
            <button className="btn btn-sm btn-primary" onClick={pwa.promptInstall}>
              Jetzt installieren
            </button>
          )}
        </div>
        <div className="setting-row">
          <span className="grow hint" style={{ margin: 0 }}>
            Version {__APP_VERSION__} · {pwa.standalone ? 'als App gestartet' : 'im Browser geöffnet'} ·{' '}
            {pwa.offline ? 'offline' : 'online'}
          </span>
        </div>
      </div>

      {/* ------------------------------ Tastenkürzel ------------------------------ */}
      <div className="setting-card">
        <h3>Tastenkürzel</h3>
        <div className="setting-row">
          <span className="grow">Suche öffnen</span>
          <span className="kbd">/</span>
          <span className="kbd">Strg/Cmd + K</span>
        </div>
        <div className="setting-row">
          <span className="grow">Neuer Prompt</span>
          <span className="kbd">N</span>
        </div>
        <div className="setting-row">
          <span className="grow">Speichern im Editor</span>
          <span className="kbd">Strg/Cmd + S</span>
        </div>
      </div>

      {/* --------------------------------- Dialoge --------------------------------- */}

      {renaming && (
        <Sheet
          title={renaming.kind === 'category' ? 'Kategorie umbenennen' : 'Tag umbenennen'}
          narrow
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button className="btn" onClick={() => setRenaming(null)}>
                Abbrechen
              </button>
              <button
                className="btn btn-primary"
                disabled={!renaming.value.trim()}
                onClick={async () => {
                  if (renaming.kind === 'category') await store.renameCategory(renaming.id, renaming.value)
                  else await store.renameTag(renaming.id, renaming.value)
                  store.notify('Umbenannt', 'success')
                  setRenaming(null)
                }}
              >
                Speichern
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="ren">Neuer Name</label>
            <input
              id="ren"
              className="input"
              value={renaming.value}
              onChange={(e) => setRenaming({ ...renaming, value: e.target.value })}
            />
          </div>
        </Sheet>
      )}

      {deleteCat && (
        <Sheet
          title={`Kategorie „${deleteCat.name}“ löschen`}
          narrow
          onClose={() => setDeleteCat(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDeleteCat(null)}>
                Abbrechen
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await store.deleteCategory(deleteCat.id, deleteCat.target || null)
                  store.notify('Kategorie gelöscht, Prompts umgezogen', 'success')
                  setDeleteCat(null)
                }}
              >
                Löschen
              </button>
            </>
          }
        >
          <p>
            {categoryCounts.get(deleteCat.id) ?? 0} Prompts hängen an dieser Kategorie. Sie bleiben
            erhalten und ziehen um nach:
          </p>
          <div className="field">
            <label htmlFor="move-to">Neue Kategorie</label>
            <select
              id="move-to"
              className="input"
              value={deleteCat.target}
              onChange={(e) => setDeleteCat({ ...deleteCat, target: e.target.value })}
            >
              <option value="">Ohne Kategorie</option>
              {store.categories
                .filter((c) => c.id !== deleteCat.id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
        </Sheet>
      )}

      {importData && (
        <Sheet
          title="Import prüfen"
          onClose={() => setImportData(null)}
          footer={
            <>
              <button className="btn" onClick={() => setImportData(null)}>
                Abbrechen
              </button>
              <button
                className="btn"
                onClick={async () => {
                  const res = await store.mergeIn({
                    prompts: importData.prompts,
                    categories: importData.categories,
                    collections: importData.collections,
                    images: importData.images,
                  })
                  store.notify(
                    `${res.added} übernommen, ${res.skipped} als Dublette übersprungen`,
                    'success',
                  )
                  setImportData(null)
                }}
              >
                Zusammenführen
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  const ok = await confirm.ask({
                    title: 'Alle vorhandenen Daten ersetzen',
                    message: `Ihre aktuellen ${store.prompts.length} Prompts werden gelöscht und durch ${importData.prompts.length} Einträge aus der Datei ersetzt. Das lässt sich nicht rückgängig machen.`,
                    confirmLabel: 'Ersetzen',
                    danger: true,
                  })
                  if (!ok) return
                  await store.replaceAll({
                    prompts: importData.prompts,
                    categories: importData.categories,
                    collections: importData.collections,
                    images: importData.images,
                  })
                  store.notify('Daten ersetzt', 'success')
                  setImportData(null)
                }}
              >
                Ersetzen
              </button>
            </>
          }
        >
          <dl className="meta-table" style={{ marginBottom: 14 }}>
            <dt>Prompts in der Datei</dt>
            <dd>{importData.prompts.length}</dd>
            <dt>Kategorien</dt>
            <dd>{importData.categories.length}</dd>
            <dt>Sammlungen</dt>
            <dd>{importData.collections.length}</dd>
            <dt>Bilder</dt>
            <dd>{importData.containsImages ? importData.images.length : 'keine in dieser Datei'}</dd>
            <dt>Vermutliche Dubletten</dt>
            <dd>{duplicateCount}</dd>
            {importData.exportedAt && (
              <>
                <dt>Erstellt am</dt>
                <dd>{new Date(importData.exportedAt).toLocaleString('de-DE')}</dd>
              </>
            )}
          </dl>
          <div className="notice">
            <div>
              <strong>Zusammenführen</strong> ergänzt nur neue Einträge und lässt Ihre vorhandenen
              Prompts unangetastet. <strong>Ersetzen</strong> löscht den bisherigen Bestand.
            </div>
          </div>
          <button className="btn" onClick={exportZip} disabled={busy}>
            <IconDownload size={17} /> Vorher Sicherung herunterladen
          </button>
        </Sheet>
      )}
      {confirm.element}
    </div>
  )
}
