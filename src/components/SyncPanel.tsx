import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { GOOGLE_CLIENT_ID, isSyncConfigured, renderGoogleButton } from '../lib/api'
import {
  SyncError,
  currentAccount,
  signInWithGoogle,
  signOut,
  syncAll,
  type Account,
} from '../lib/sync'
import { IconCloud } from './Icons'

export function SyncStatePill() {
  const { syncState, syncMessage } = useStore()
  const map: Record<string, { text: string; dot: string }> = {
    local: { text: 'Lokal gespeichert', dot: '' },
    syncing: { text: 'Wird synchronisiert', dot: 'busy' },
    synced: { text: 'Synchronisiert', dot: 'ok' },
    'offline-pending': { text: 'Offline – Abgleich ausstehend', dot: 'warn' },
    error: { text: 'Abgleich fehlgeschlagen', dot: 'err' },
    disabled: { text: 'Nur auf diesem Gerät', dot: '' },
  }
  const s = map[syncState] ?? map.local
  return (
    <span className="sync-pill" title={syncMessage || s.text}>
      <span className={`dot ${s.dot}`} />
      {s.text}
    </span>
  )
}

export function SyncPanel() {
  const store = useStore()
  const configured = isSyncConfigured()
  const [account, setAccount] = useState<Account | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const buttonRef = useRef<HTMLDivElement>(null)

  /* Bestehende Sitzung? */
  useEffect(() => {
    if (!configured) {
      store.setSyncState('disabled')
      setChecked(true)
      return
    }
    currentAccount()
      .then((a) => {
        setAccount(a)
        store.setSyncState(a ? 'local' : 'disabled')
      })
      .finally(() => setChecked(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  const anmelden = useCallback(
    async (credential: string) => {
      setError(null)
      setBusy(true)
      try {
        const a = await signInWithGoogle(credential)
        setAccount(a)
        store.setSyncState('local')
        store.notify(`Angemeldet als ${a.email}`, 'success')
      } catch (e) {
        setError(e instanceof SyncError ? e.message : 'Die Anmeldung ist fehlgeschlagen.')
      } finally {
        setBusy(false)
      }
    },
    [store],
  )

  /* Google-Knopf zeichnen, sobald klar ist, dass niemand angemeldet ist. */
  useEffect(() => {
    if (!configured || !checked || account || !buttonRef.current) return
    const dunkel = document.documentElement.getAttribute('data-theme') !== 'light'
    renderGoogleButton(buttonRef.current, anmelden, dunkel).catch(() =>
      setError('Googles Anmeldedienst konnte nicht geladen werden.'),
    )
  }, [configured, checked, account, anmelden])

  const abgleichen = useCallback(async () => {
    setError(null)
    setInfo(null)
    if (!navigator.onLine) {
      store.setSyncState('offline-pending', 'Keine Verbindung')
      return
    }
    setBusy(true)
    store.setSyncState('syncing')
    try {
      const r = await syncAll(store.settings.lastSyncAt)
      await store.updateSettings({ lastSyncAt: r.at, syncEnabled: true })
      await store.reload()
      store.setSyncState('synced')
      const teile = [`${r.pushed} hoch`, `${r.pulled} herunter`]
      if (r.imagesUp || r.imagesDown) teile.push(`${r.imagesUp + r.imagesDown} Bilder`)
      if (r.conflicts) teile.push(`${r.conflicts} Konflikt(e) als Kopie erhalten`)
      setInfo(`Abgleich fertig – ${teile.join(', ')}`)
    } catch (e) {
      const m = e instanceof SyncError ? e.message : 'Der Abgleich ist fehlgeschlagen.'
      store.setSyncState('error', m)
      setError(m)
      if (/angemeldet|abgelaufen/i.test(m)) setAccount(null)
    } finally {
      setBusy(false)
    }
  }, [store])

  const abmelden = useCallback(async () => {
    await signOut()
    setAccount(null)
    setInfo(null)
    await store.updateSettings({ syncEnabled: false })
    store.setSyncState('disabled')
  }, [store])

  if (!configured) {
    return (
      <div className="setting-card">
        <h3>Abgleich zwischen Geräten</h3>
        <p>
          Für diese Fassung der App ist kein Abgleich eingerichtet. Sie arbeitet rein lokal – alle
          übrigen Funktionen stehen unverändert zur Verfügung. Wie sich der Abgleich einrichten
          lässt, steht in der <code>README</code> des Projekts.
        </p>
        {!GOOGLE_CLIENT_ID && (
          <div className="hint">Es fehlt die Angabe der Google-Kennung im Build.</div>
        )}
      </div>
    )
  }

  return (
    <div className="setting-card">
      <h3>Abgleich zwischen Geräten</h3>
      <p>
        Mit deinem Google-Konto anmelden, dann liegen Prompts, Kategorien, Sammlungen und Bilder auf
        allen Geräten gleich. Wurde derselbe Prompt auf zwei Geräten gleichzeitig geändert, bleiben
        beide Fassungen erhalten – es geht nichts still verloren.
      </p>

      {!account ? (
        <>
          <div ref={buttonRef} style={{ minHeight: 44, display: 'flex', alignItems: 'center' }} />
          {!checked && <div className="hint">Anmeldung wird geprüft …</div>}
          <div className="hint" style={{ marginTop: 10 }}>
            Deine Prompts bleiben beim Anmelden erhalten und werden beim ersten Abgleich
            hochgeladen – nichts wird ersetzt.
          </div>
        </>
      ) : (
        <>
          <div className="setting-row">
            <span className="grow">
              Angemeldet als <strong>{account.email}</strong>
            </span>
            <button className="btn btn-sm btn-primary" onClick={abgleichen} disabled={busy}>
              <IconCloud size={17} />
              {busy ? 'Abgleich läuft …' : 'Jetzt abgleichen'}
            </button>
            <button className="btn btn-sm" onClick={abmelden} disabled={busy}>
              Abmelden
            </button>
          </div>

          {store.settings.lastSyncAt && (
            <div className="setting-row">
              <span className="grow">Letzter Abgleich</span>
              <span className="hint">
                {new Date(store.settings.lastSyncAt).toLocaleString('de-DE')}
              </span>
            </div>
          )}
        </>
      )}

      {info && <div className="notice">{info}</div>}
      {error && <div className="notice notice-warn">{error}</div>}
    </div>
  )
}
