import { useCallback, useEffect, useRef, useState } from 'react'
import { IconClose } from './Icons'

const MIN = 1
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
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const zeiger = useRef(new Map<number, { x: number; y: number }>())
  const startAbstand = useRef(0)
  const startZoom = useRef(1)
  const ziehStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const letzterTipp = useRef(0)

  const begrenzen = useCallback((z: number) => Math.min(MAX, Math.max(MIN, z)), [])

  /* Beim Herauszoomen auf Originalgröße die Verschiebung zurücksetzen,
     sonst bleibt das Bild aus der Mitte gerückt. */
  useEffect(() => {
    if (zoom <= 1) setPos({ x: 0, y: 0 })
  }, [zoom])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === '+') setZoom((z) => begrenzen(z + 0.5))
      if (e.key === '-') setZoom((z) => begrenzen(z - 0.5))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
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
      ziehStart.current = null
    } else if (zeiger.current.size === 1 && zoom > 1) {
      ziehStart.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!zeiger.current.has(e.pointerId)) return
    zeiger.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (zeiger.current.size === 2 && startAbstand.current > 0) {
      const faktor = abstand() / startAbstand.current
      setZoom(begrenzen(startZoom.current * faktor))
    } else if (ziehStart.current && zoom > 1) {
      setPos({
        x: ziehStart.current.px + (e.clientX - ziehStart.current.x),
        y: ziehStart.current.py + (e.clientY - ziehStart.current.y),
      })
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    zeiger.current.delete(e.pointerId)
    if (zeiger.current.size < 2) startAbstand.current = 0
    if (zeiger.current.size === 0) ziehStart.current = null
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
          onClick={() => setZoom((z) => begrenzen(z - 0.5))}
          disabled={zoom <= MIN}
          aria-label="Verkleinern"
        >
          −
        </button>
        <span className="hint">{Math.round(zoom * 100)} %</span>
        <button
          className="btn btn-sm"
          onClick={() => setZoom((z) => begrenzen(z + 0.5))}
          disabled={zoom >= MAX}
          aria-label="Vergrößern"
        >
          +
        </button>
        <button
          className="btn btn-sm"
          onClick={() => {
            setZoom(1)
            setPos({ x: 0, y: 0 })
          }}
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
        className="viewer-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onDoppeltippen}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`,
            cursor: zoom > 1 ? 'grab' : 'zoom-in',
          }}
        />
      </div>

      <p className="hint viewer-hilfe">
        Mit zwei Fingern aufziehen, doppelt tippen oder die Knöpfe verwenden. Vergrößert lässt sich
        das Bild verschieben.
      </p>
    </div>
  )
}
