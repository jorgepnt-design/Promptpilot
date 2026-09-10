import { useEffect, useState } from 'react'

export interface PwaState {
  updateReady: boolean
  offline: boolean
  installable: boolean
  applyUpdate: () => void
  promptInstall: () => Promise<void>
  standalone: boolean
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function usePwa(): PwaState {
  const [updateReady, setUpdateReady] = useState(false)
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => {
    if (__SINGLE_FILE__) return
    if (!('serviceWorker' in navigator)) return
    let reloading = false
    const baseUrl = import.meta.env?.BASE_URL ?? '/'
    const swUrl = `${baseUrl}sw.js`

    navigator.serviceWorker
      .register(swUrl, { scope: baseUrl })
      .then((reg) => {
        if (reg.waiting && navigator.serviceWorker.controller) {
          setWaiting(reg.waiting)
          setUpdateReady(true)
        }
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing
          if (!sw) return
          sw.addEventListener('statechange', () => {
            // Nur melden, wenn bereits eine Version aktiv war – sonst ist es die Erstinstallation.
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              setWaiting(sw)
              setUpdateReady(true)
            }
          })
        })
      })
      .catch(() => undefined)

    const onControllerChange = () => {
      if (reloading) return
      reloading = true
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [])

  const applyUpdate = () => {
    if (!waiting) {
      window.location.reload()
      return
    }
    waiting.postMessage({ type: 'SKIP_WAITING' })
    setUpdateReady(false)
  }

  const promptInstall = async () => {
    if (!installEvent) return
    await installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true

  return {
    updateReady,
    offline,
    installable: Boolean(installEvent),
    applyUpdate,
    promptInstall,
    standalone,
  }
}
