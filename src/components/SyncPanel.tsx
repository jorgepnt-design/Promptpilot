import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { isSupabaseConfigured } from '../lib/supabase'
import { SyncError, currentUser, signIn, signOut, signUp, syncAll } from '../lib/sync'
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
  const configured = isSupabaseConfigured()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    if (!configured) {
      store.setSyncState('disabled')
      return
    }
    currentUser()
      .then((u) => {
        if (u) {
          setUser({ id: u.id, email: u.email ?? undefined })
          store.setSyncState('local')
        }
      })
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured])

  const runSync = useCallback(async () => {
    setError(null)
    setInfo(null)
    if (!navigator.onLine) {
      store.setSyncState('offline-pending', 'Keine Verbindung')
      return
    }
    setBusy(true)
    store.setSyncState('syncing')
    try {
      const res = await syncAll(store.settings.lastSyncAt)
      await store.updateSettings({ lastSyncAt: res.at, syncEnabled: true })
      await store.reload()
      store.setSyncState('synced')
      setInfo(
        `Abgleich abgeschlossen: ${res.pushed} hochgeladen, ${res.pulled} übernommen` +
          (res.conflicts ? `, ${res.conflicts} Konflikt(e) als zusätzliche Fassung gesichert` : '') +
          (res.imagesUp || res.imagesDown
            ? `, Bilder: ${res.imagesUp} hoch / ${res.imagesDown} runter`
            : ''),
      )
    } catch (err) {
      const msg = err instanceof SyncError ? err.message : 'Unbekannter Fehler beim Abgleich.'
      store.setSyncState(navigator.onLine ? 'error' : 'offline-pending', msg)
      setError(msg)
    } finally {
      setBusy(false)
    }
  }, [store])

  if (!configured) {
    return (
      <div className="setting-card">
        <h3>Synchronisierung zwischen Geräten</h3>
        <p>
          Die Cloud-Anbindung ist vollständig vorbereitet, aber noch nicht eingerichtet. Ohne
          Zugangsdaten arbeitet PromptPilot rein lokal – alle Funktionen bleiben nutzbar.
        </p>
        <div className="notice">
          <div>
            <strong>So wird sie aktiviert:</strong>
            <ol style={{ margin: '8px 0 0 18px', padding: 0 }}>
              <li>Kostenloses Supabase-Projekt anlegen.</li>
              <li>
                Die Datei <code>supabase/schema.sql</code> im SQL-Editor ausführen (Tabellen,
                Zugriffsregeln, Bild-Speicher).
              </li>
              <li>
                Projekt-URL und den öffentlichen anon-Key als <code>VITE_SUPABASE_URL</code> und{' '}
                <code>VITE_SUPABASE_ANON_KEY</code> hinterlegen (siehe <code>.env.example</code>).
              </li>
              <li>App neu bauen und veröffentlichen.</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="setting-card">
      <h3>Synchronisierung zwischen Geräten</h3>
      <p>
        Mit Konto liegen dieselben Prompts auf iPhone und Laptop. Jedes Konto sieht ausschließlich
        die eigenen Daten – das erzwingt zusätzlich der Zugriffsschutz in der Datenbank.
      </p>

      {user ? (
        <>
          <div className="setting-row">
            <span className="grow">
              <IconCloud size={17} style={{ verticalAlign: -3, marginRight: 6 }} />
              Angemeldet als {user.email ?? user.id}
            </span>
            <button className="btn btn-sm" onClick={runSync} disabled={busy}>
              {busy ? 'Läuft …' : 'Jetzt abgleichen'}
            </button>
            <button
              className="btn btn-sm"
              onClick={async () => {
                await signOut()
                setUser(null)
                await store.updateSettings({ syncEnabled: false })
                store.setSyncState('local')
              }}
            >
              Abmelden
            </button>
          </div>
          <div className="setting-row">
            <span className="grow hint" style={{ margin: 0 }}>
              {store.settings.lastSyncAt
                ? `Letzter erfolgreicher Abgleich: ${new Date(
                    store.settings.lastSyncAt,
                  ).toLocaleString('de-DE')}`
                : 'Noch kein Abgleich durchgeführt.'}
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="field-row two">
            <div className="field">
              <label htmlFor="sy-mail">E-Mail</label>
              <input
                id="sy-mail"
                className="input"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="sy-pass">Passwort</label>
              <input
                id="sy-pass"
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={busy || !email || !password}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  const u = await signIn(email, password)
                  if (u) setUser({ id: u.id, email: u.email ?? undefined })
                  setPassword('')
                  await runSync()
                } catch (err) {
                  setError(err instanceof SyncError ? err.message : 'Anmeldung fehlgeschlagen.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Anmelden
            </button>
            <button
              className="btn"
              disabled={busy || !email || !password}
              onClick={async () => {
                setBusy(true)
                setError(null)
                try {
                  await signUp(email, password)
                  setInfo(
                    'Konto angelegt. Falls die E-Mail-Bestätigung aktiv ist, zuerst den Link in der E-Mail öffnen.',
                  )
                } catch (err) {
                  setError(err instanceof SyncError ? err.message : 'Registrierung fehlgeschlagen.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Konto anlegen
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="notice notice-warn" style={{ marginTop: 14 }} role="alert">
          {error}
        </div>
      )}
      {info && (
        <div className="notice" style={{ marginTop: 14 }}>
          {info}
        </div>
      )}
      <div className="hint">
        Vorhandene lokale Prompts werden beim ersten Abgleich übernommen. Ändern zwei Geräte
        denselben Prompt, bleibt die zweite Fassung als zusätzlicher Eintrag erhalten.
      </div>
    </div>
  )
}
