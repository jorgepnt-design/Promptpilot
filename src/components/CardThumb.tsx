import { useEffect, useState } from 'react'
import { useStore } from '../state/store'

/**
 * Kleine Vorschau des ersten angehängten Bildes.
 *
 * Das Bild wird erst beim Anzeigen der Karte aus der lokalen Datenbank geholt,
 * damit eine lange Liste nicht sämtliche Bilder auf einmal lädt. Die erzeugte
 * Objekt-URL wird beim Verschwinden wieder freigegeben.
 */
export function CardThumb({ imageId, anzahl }: { imageId: string; anzahl: number }) {
  const store = useStore()
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let aktiv = true
    let erzeugt: string | null = null
    store
      .getImages([imageId])
      .then((imgs) => {
        if (!aktiv || !imgs.length) return
        erzeugt = URL.createObjectURL(imgs[0].blob)
        setUrl(erzeugt)
      })
      .catch(() => undefined)
    return () => {
      aktiv = false
      if (erzeugt) URL.revokeObjectURL(erzeugt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId])

  if (!url) return <div className="card-thumb is-leer" aria-hidden="true" />

  return (
    <div className="card-thumb" aria-hidden="true">
      <img src={url} alt="" loading="lazy" />
      {anzahl > 1 && <span className="card-thumb-zahl">+{anzahl - 1}</span>}
    </div>
  )
}
