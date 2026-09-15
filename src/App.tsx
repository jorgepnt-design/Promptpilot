import { useEffect, useMemo } from 'react'
import { useStore } from './state/store'
import { useRoute } from './lib/router'
import { usePwa } from './lib/pwa'
import { PromptBrowser } from './components/PromptBrowser'
import { CollectionsPage } from './pages/CollectionsPage'
import { NotesPage } from './pages/NotesPage'
import { SettingsPage } from './pages/SettingsPage'
import { ToastHost, useConfirm } from './components/ui'
import { SyncStatePill } from './components/SyncPanel'
import {
  IconArchive,
  IconCollections,
  IconLibrary,
  IconSettings,
  IconStack,
  IconStar,
  IconTrash,
  LogoMark,
} from './components/Icons'

const NAV = [
  { path: '/bibliothek', label: 'Bibliothek', icon: IconLibrary },
  { path: '/favoriten', label: 'Favoriten', icon: IconStar },
  { path: '/sammlungen', label: 'Sammlungen', icon: IconCollections },
  { path: '/notizen', label: 'Notizen', icon: IconStack },
  { path: '/einstellungen', label: 'Einstellungen', icon: IconSettings },
]

const SIDE_EXTRA = [
  { path: '/archiv', label: 'Archiv', icon: IconArchive },
  { path: '/papierkorb', label: 'Papierkorb', icon: IconTrash },
]

export default function App() {
  const store = useStore()
  const route = useRoute()
  const pwa = usePwa()

  /* Farbschema anwenden und der Systemeinstellung folgen */
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const theme =
        store.settings.theme === 'system' ? (media.matches ? 'light' : 'dark') : store.settings.theme
      document.documentElement.setAttribute('data-theme', theme)
      document
        .querySelectorAll('meta[name="theme-color"]')
        .forEach((m) => m.setAttribute('content', theme === 'light' ? '#f1f4fc' : '#030C31'))
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [store.settings.theme])

  const counts = useMemo(() => {
    let active = 0
    let favorites = 0
    let archived = 0
    let trashed = 0
    for (const p of store.prompts) {
      if (p.status === 'active') {
        active++
        if (p.favorite) favorites++
      } else if (p.status === 'archived') archived++
      else if (p.status === 'trashed') trashed++
    }
    return { active, favorites, archived, trashed, collections: store.collections.length }
  }, [store.prompts, store.collections])

  const countFor = (path: string): number | undefined =>
    ({
      '/bibliothek': counts.active,
      '/favoriten': counts.favorites,
      '/sammlungen': counts.collections,
      '/notizen': store.notes.length,
      '/archiv': counts.archived,
      '/papierkorb': counts.trashed,
    })[path]

  if (!store.ready) {
    return (
      <div className="page" style={{ paddingTop: 40 }}>
        <div className="grid cards">
          {[0, 1, 2, 3].map((i) => (
            <div className="skeleton" key={i} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand" style={{ padding: '2px 10px 16px' }}>
          <LogoMark size={32} />
          <div>
            <div className="brand-name">PromptPilot</div>
            <div className="brand-sub">Meine Prompt-Bibliothek</div>
          </div>
        </div>
        {NAV.map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            className={`side-link${route.path === n.path ? ' is-active' : ''}`}
          >
            <n.icon size={18} />
            {n.label}
            <span className="side-count">{countFor(n.path)}</span>
          </a>
        ))}
        <div className="side-group">Weitere Ansichten</div>
        {SIDE_EXTRA.map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            className={`side-link${route.path === n.path ? ' is-active' : ''}`}
          >
            <n.icon size={18} />
            {n.label}
            <span className="side-count">{countFor(n.path)}</span>
          </a>
        ))}
        <div style={{ marginTop: 'auto', padding: '16px 10px 0' }}>
          <SyncStatePill />
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand">
              <LogoMark size={30} />
              <span className="brand-name">PromptPilot</span>
            </div>
            <div className="spacer" />
            {pwa.offline && <span className="badge">Offline</span>}
            <SyncStatePill />
          </div>
        </header>

        <main>
          <Routes path={route.path} />
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Hauptnavigation">
        {NAV.map((n) => (
          <a
            key={n.path}
            href={`#${n.path}`}
            className={route.path === n.path ? 'is-active' : ''}
            aria-current={route.path === n.path ? 'page' : undefined}
          >
            <n.icon size={21} />
            {n.label}
          </a>
        ))}
      </nav>

      {pwa.updateReady && (
        <div className="update-bar" role="status">
          <span style={{ flex: 1 }}>
            Eine neue Version ist bereit. Gespeicherte Daten bleiben dabei erhalten.
          </span>
          <button className="btn btn-sm btn-primary" onClick={pwa.applyUpdate}>
            Neu laden
          </button>
        </div>
      )}

      <ToastHost />
    </div>
  )
}

function Routes({ path }: { path: string }) {
  switch (path) {
    case '/favoriten':
      return (
        <PromptBrowser
          status="active"
          title="Favoriten"
          description="Die Prompts, die Sie am häufigsten brauchen."
          lockFavorites
          emptyTitle="Noch keine Favoriten"
          emptyText="Über den Stern auf einer Prompt-Karte landet ein Prompt hier."
        />
      )
    case '/sammlungen':
      return <CollectionsPage />
    case '/notizen':
      return <NotesPage />
    case '/einstellungen':
      return <SettingsPage />
    case '/archiv':
      return (
        <PromptBrowser
          status="archived"
          title="Archiv"
          description="Aufgehoben, aber nicht mehr im Weg. Archivierte Prompts erscheinen nicht in der Bibliothek."
          emptyTitle="Das Archiv ist leer"
          emptyText="Archivierte Prompts sammeln sich hier und lassen sich jederzeit zurückholen."
        />
      )
    case '/papierkorb':
      return <TrashView />
    case '/bibliothek':
    default:
      return (
        <PromptBrowser
          status="active"
          title="Bibliothek"
          description="Alle Prompts an einem Ort – suchen, filtern, kopieren."
          emptyTitle="Ihre Bibliothek ist noch leer"
          emptyText="Legen Sie den ersten Prompt an. Titel und Text genügen, alles Weitere lässt sich später ergänzen."
        />
      )
  }
}

function TrashView() {
  const store = useStore()
  const confirm = useConfirm()
  const trashed = store.prompts.filter((p) => p.status === 'trashed')
  return (
    <>
      {trashed.length > 0 && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice notice-warn">
            <div style={{ flex: 1 }}>
              <strong>{trashed.length} Prompts im Papierkorb.</strong> Sie werden nicht automatisch
              gelöscht.
            </div>
            <button
              className="btn btn-sm btn-danger"
              onClick={async () => {
                const ok = await confirm.ask({
                  title: 'Papierkorb leeren',
                  message: `${trashed.length} Prompts werden unwiderruflich gelöscht.`,
                  confirmLabel: 'Endgültig löschen',
                  danger: true,
                })
                if (!ok) return
                await store.emptyTrash()
                store.notify('Papierkorb geleert', 'success')
              }}
            >
              Papierkorb leeren
            </button>
          </div>
        </div>
      )}
      <PromptBrowser
        status="trashed"
        title="Papierkorb"
        description="Gelöschte Prompts bleiben hier, bis Sie sie endgültig entfernen."
        emptyTitle="Der Papierkorb ist leer"
        emptyText="Hier landen gelöschte Prompts – wiederherstellbar, bis Sie sie endgültig entfernen."
      />
      {confirm.element}
    </>
  )
}
