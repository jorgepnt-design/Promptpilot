/** Nach selbst gewählter Reihenfolge sortieren; Unbekanntes bleibt hinten. */
export function nachReihenfolge<T>(items: T[], order: string[], key: (t: T) => string): T[] {
  const rang = new Map(order.map((n, i) => [n, i]))
  return [...items].sort((a, b) => {
    const ra = rang.get(key(a)) ?? Number.MAX_SAFE_INTEGER
    const rb = rang.get(key(b)) ?? Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}

/** Ein Element in einer Liste um eine Position verschieben. */
export function verschiebe<T>(liste: T[], index: number, richtung: -1 | 1): T[] {
  const ziel = index + richtung
  if (index < 0 || ziel < 0 || ziel >= liste.length) return liste
  const kopie = [...liste]
  const [weg] = kopie.splice(index, 1)
  kopie.splice(ziel, 0, weg)
  return kopie
}
