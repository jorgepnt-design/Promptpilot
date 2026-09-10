import { useState } from 'react'
import { useStore } from '../state/store'
import { useRoute } from '../lib/router'
import { PromptBrowser } from '../components/PromptBrowser'
import { Sheet, useConfirm } from '../components/ui'
import { IconCollections, IconEdit, IconPlus, IconTrash } from '../components/Icons'

export function CollectionsPage() {
  const store = useStore()
  const route = useRoute()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<{ id: string | null; name: string; description: string } | null>(
    null,
  )

  const openId = route.query.get('sammlung')
  const open = store.collections.find((c) => c.id === openId)

  if (open) {
    return (
      <PromptBrowser
        status="active"
        title={open.name}
        description={open.description || 'Sammlung'}
        lockCollectionId={open.id}
        emptyTitle="Diese Sammlung ist leer"
        emptyText="Prompts kommen über „Weitere Angaben → Sammlungen“ im Editor hinein – oder über die Mehrfachauswahl in der Bibliothek."
      />
    )
  }

  const counts = new Map<string, number>()
  store.prompts
    .filter((p) => p.status === 'active')
    .forEach((p) => p.collectionIds.forEach((id) => counts.set(id, (counts.get(id) ?? 0) + 1)))

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Sammlungen</h1>
          <p>
            Frei zusammengestellte Gruppen. Ein Prompt darf in mehreren Sammlungen liegen und wird
            dabei nur einmal gespeichert.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setEditing({ id: null, name: '', description: '' })}
        >
          <IconPlus size={17} /> Neue Sammlung
        </button>
      </div>

      {store.collections.length === 0 ? (
        <div className="empty">
          <h3>Noch keine Sammlung</h3>
          <p>
            Sammlungen bündeln Prompts über Kategorien hinweg – etwa „Meine besten Bild-Prompts“ oder
            „Berufliche Vorlagen“.
          </p>
          <div className="empty-actions">
            <button
              className="btn btn-primary"
              onClick={() => setEditing({ id: null, name: '', description: '' })}
            >
              Erste Sammlung anlegen
            </button>
          </div>
        </div>
      ) : (
        <div className="grid cards">
          {store.collections.map((c) => (
            <article className="card" key={c.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => route.setQueryParam('sammlung', c.id)}
                onKeyDown={(e) => e.key === 'Enter' && route.setQueryParam('sammlung', c.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="card-top">
                  <IconCollections size={19} style={{ color: 'var(--accent)', flex: 'none' }} />
                  <div className="card-title">{c.name}</div>
                </div>
                {c.description && <div className="card-preview">{c.description}</div>}
                <div className="card-meta" style={{ marginTop: 8 }}>
                  <span className="badge">{counts.get(c.id) ?? 0} Prompts</span>
                </div>
              </div>
              <div className="card-actions">
                <button
                  className="icon-btn"
                  aria-label={`„${c.name}“ umbenennen`}
                  onClick={() => setEditing({ id: c.id, name: c.name, description: c.description })}
                >
                  <IconEdit size={18} />
                </button>
                <div className="spacer" />
                <button
                  className="icon-btn"
                  aria-label={`„${c.name}“ löschen`}
                  onClick={async () => {
                    const ok = await confirm.ask({
                      title: `Sammlung „${c.name}“ löschen`,
                      message:
                        'Die enthaltenen Prompts bleiben erhalten – nur die Zuordnung zu dieser Sammlung entfällt.',
                      confirmLabel: 'Sammlung löschen',
                      danger: true,
                    })
                    if (!ok) return
                    await store.deleteCollection(c.id)
                    store.notify('Sammlung gelöscht, Prompts bleiben erhalten', 'success')
                  }}
                >
                  <IconTrash size={18} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing && (
        <Sheet
          title={editing.id ? 'Sammlung bearbeiten' : 'Neue Sammlung'}
          narrow
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Abbrechen
              </button>
              <button
                className="btn btn-primary"
                disabled={!editing.name.trim()}
                onClick={async () => {
                  if (editing.id) {
                    await store.renameCollection(editing.id, editing.name, editing.description)
                    store.notify('Sammlung aktualisiert', 'success')
                  } else {
                    await store.addCollection(editing.name, editing.description)
                    store.notify('Sammlung angelegt', 'success')
                  }
                  setEditing(null)
                }}
              >
                Speichern
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="col-name">Name</label>
            <input
              id="col-name"
              className="input"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="z. B. Porträts und Tattoos"
            />
          </div>
          <div className="field">
            <label htmlFor="col-desc">Beschreibung</label>
            <input
              id="col-desc"
              className="input"
              value={editing.description}
              onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              placeholder="Optional"
            />
          </div>
        </Sheet>
      )}
      {confirm.element}
    </div>
  )
}
