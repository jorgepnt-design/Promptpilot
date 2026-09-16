import { useCallback, useEffect, useRef, useState } from 'react'
import { IconClose } from './Icons'

const MIN = 0.25
const MAX = 6

/**
 * Vollbild-Ansicht für ein Bild.
 *
 * Zoomen geht auf drei Wegen, damit es auf jedem Gerät zugänglich bleibt:
 * Aufziehen mit zwei Fingern, Doppeltippen und die beiden Knöpfe. Ist das Bild
 * vergrößert, lässt es sich mit einem Finger verschieben.
 */
export function ImageViewer({
  src,
  alt,
  onClose,
}: {
  src: string
  alt: string
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  const zeiger = useRef(new Map<number, { x: number; y: number }>())
  const startAbstand = useRef(0)
  const startZoom = useRef(1)
  const letzterTipp = useRef(0)
  const buehne = useRef<HTMLDivElement>(null)
  const [flaeche, setFlaeche] = useState({ w: 0, h: 0 })

  /* Die Bühne ausmessen: Prozentangaben helfen hier nicht weiter, weil sich
     die Rasterzelle sonst nach dem Bild richtet statt umgekehrt. */
  useEffect(() => {
    const el = buehne.current
    if (!el) return
    const messen = () => setFlaeche({ w: el.clientWidth, h: el.clientHeight })
    messen()
    const beobachter = new ResizeObserver(messen)
    beobachter.observe(el)
    return () => beobachter.disconnect()
  }, [])

  const begrenzen = useCallback((z: number) => Math.min(MAX, Math.max(MIN, z)), [])

  /* Solange die Bildansicht offen ist, soll die Seite dahinter nicht mitscrollen. */
  useEffect(() => {
    const vorher = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = vorher
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // In der Aufnahmephase abfangen und stoppen: sonst schließt das
        // Fenster darunter mit, obwohl die Bildansicht obenauf liegt.
        e.stopPropagation()
        onClose()
      }
      if (e.key === '+') setZoom((z) => begrenzen(z * 1.25))
      if (e.key === '-') setZoom((z) => begrenzen(z / 1.25))
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [onClose, begrenzen])

  const abstand = () => {
    const [a, b] = Array.from(zeiger.current.values())
    if (!a || !b) return 0
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2) {
      startAbstand.current = abstand()
      startZoom.current = zoom
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!zeiger.current.has(e.pointerId)) return
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2 && startAbstand.current > 0) {
      const faktor = abstand() / startAbstand.current
      setZoom(begrenzen(startZoom.current * faktor))
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size < 2) startAbstand.current = 0
  }

  /* Ohne Zusatztaste scrollt das Rad im Bild – mit Strg (oder ⌘) zoomt es. */
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom((z) => begrenzen(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
  }

  const onDoppeltippen = () => {
    const jetzt = Date.now()
    if (jetzt - letzterTipp.current < 300) {
      setZoom((z) => (z > 1 ? 1 : 2.5))
    }
    letzterTipp.current = jetzt
  }

  return (
    <div className="viewer" role="dialog" aria-label={`Bild: ${alt}`}>
      <div className="viewer-bar">
        <button
          className="btn btn-sm"
          onClick={() => setZoom((z) => begrenzen(z / 1.25))}
          disabled={zoom <= MIN}
          aria-label="Verkleinern"
        >
          −
        </button>
        <span className="hint">{Math.round(zoom * 100)} %</span>
        <button
          className="btn btn-sm"
          onClick={() => setZoom((z) => begrenzen(z * 1.25))}
          disabled={zoom >= MAX}
          aria-label="Vergrößern"
        >
          +
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setZoom(1)}
          disabled={zoom === 1}
        >
          Zurücksetzen
        </button>
        <div className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Bildansicht schließen">
          <IconClose size={20} />
        </button>
      </div>

      <div
        ref={buehne}
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onClick={onDoppeltippen}
      >
        {/* Der innere Rahmen wächst mit dem Zoom; dadurch bekommt der Bereich
            echte Bildlaufleisten, statt dass wir das Verschieben nachbauen. */}
        <div
          className="viewer-frame"
          style={{ width: flaeche.w * zoom, height: flaeche.h * zoom }}
        >
          <img src={src} alt={alt} draggable={false} />
        </div>
      </div>

      <p className="hint viewer-hilfe">
        Mit zwei Fingern aufziehen, doppelt tippen oder die Knöpfe verwenden. Vergrößert lässt sich
        das Bild scrollen; mit Strg und Mausrad zoomen.
      </p>
    </div>
  )
}
