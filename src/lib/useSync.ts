import { useCallback, useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { getToken, isSyncConfigured } from './api'
import { SyncError, syncAll } from './sync'

/**
 * Abgleich auslösen – von überall in der App.
 *
 * `angemeldet` ist erst dann wahr, wenn eine Sitzung vorliegt; solange nicht,
 * blenden Aufrufer ihren Knopf besser aus, statt ihn ins Leere laufen zu lassen.
 */
export function useAbgleich() {
  const store = useStore()
  const [angemeldet, setAngemeldet] = useState(false)
  const [laeuft, setLaeuft] = useState(false)

  useEffect(() => {
    let abgebrochen = false
    if (!isSyncConfigured()) return
    getToken()
      .then((t) => {
        if (!abgebrochen) setAngemeldet(Boolean(t))
      })
      .catch(() => undefined)
    return () => {
      abgebrochen = true
    }
    // Nach jedem Abgleich neu prüfen: eine abgelaufene Sitzung wird verworfen.
  }, [store.syncState])

  const abgleichen = useCallback(async () => {
    if (laeuft) return
    if (!navigator.onLine) {
      store.setSyncState('offline-pending', 'Keine Verbindung')
      store.notify('Offline – der Abgleich wird nachgeholt.', 'error')
      return
    }
    setLaeuft(true)
    store.setSyncState('syncing')
    try {
      const r = await syncAll(store.settings.lastSyncAt)
      await store.updateSettings({ lastSyncAt: r.at, syncEnabled: true })
      await store.reload()
      store.setSyncState('synced')
      const teile = [`${r.pushed} hoch`, `${r.pulled} herunter`]
      if (r.imagesUp || r.imagesDown) teile.push(`${r.imagesUp + r.imagesDown} Bilder`)
      if (r.conflicts) teile.push(`${r.conflicts} Konflikt(e) als Kopie erhalten`)
      store.notify(`Abgleich fertig – ${teile.join(', ')}`, 'success')
    } catch (e) {
      const m = e instanceof SyncError ? e.message : 'Der Abgleich ist fehlgeschlagen.'
      store.setSyncState('error', m)
      store.notify(m, 'error')
    } finally {
      setLaeuft(false)
    }
  }, [laeuft, store])

  return { abgleichen, laeuft, verfuegbar: isSyncConfigured() && angemeldet }
}
