import { useCallback, useEffect, useState } from 'react'

export interface RouteState {
  path: string
  query: URLSearchParams
}

function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#/, '') || '/bibliothek'
  const [path, search = ''] = raw.split('?')
  return { path: path || '/bibliothek', query: new URLSearchParams(search) }
}

function buildHash(path: string, query?: URLSearchParams | Record<string, string | null>): string {
  let search = ''
  if (query instanceof URLSearchParams) {
    search = query.toString()
  } else if (query) {
    const p = new URLSearchParams()
    Object.entries(query).forEach(([k, v]) => {
      if (v != null && v !== '') p.set(k, v)
    })
    search = p.toString()
  }
  return `#${path}${search ? `?${search}` : ''}`
}

/**
 * Hash-basiertes Routing. Damit funktioniert die Navigation auch nach einem
 * Neuladen unter einem Unterpfad wie /Promptpilot/ ohne Server-Konfiguration.
 */
export function useRoute() {
  const [route, setRoute] = useState<RouteState>(() => parseHash())

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    if (!window.location.hash) window.location.replace(buildHash('/bibliothek'))
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback(
    (path: string, query?: URLSearchParams | Record<string, string | null>, replace = false) => {
      const hash = buildHash(path, query)
      if (replace) window.location.replace(hash)
      else window.location.hash = hash
    },
    [],
  )

  const setQueryParam = useCallback(
    (key: string, value: string | null, replace = false) => {
      const current = parseHash()
      const q = new URLSearchParams(current.query)
      if (value == null || value === '') q.delete(key)
      else q.set(key, value)
      const hash = buildHash(current.path, q)
      if (replace) window.location.replace(hash)
      else window.location.hash = hash
    },
    [],
  )

  return { ...route, navigate, setQueryParam }
}
