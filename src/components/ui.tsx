import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconClose } from './Icons'
import { useStore } from '../state/store'

/**
 * Overlays werden in den React-Wurzelknoten eingehängt statt in <body>.
 * Positioniert wird ohnehin über position: fixed; so bleiben Ereignisse
 * zuverlässig im React-Baum – auch in eingebetteten Umgebungen.
 */
function portalTarget(): HTMLElement {
  return document.getElementById('root') ?? document.body
}

/* ------------------------------- Sheet ------------------------------- */

export function Sheet({
  title,
  onClose,
  children,
  footer,
  narrow,
  headExtra,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  narrow?: boolean
  headExtra?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(
      'input, textarea, button, [tabindex]:not([tabindex="-1"])',
    )
    el?.focus({ preventScroll: true })
  }, [])

  return createPortal(
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`sheet${narrow ? ' narrow' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="sheet-head">
          <h2>{title}</h2>
          {headExtra}
          <button className="icon-btn" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    portalTarget(),
  )
}

/* ------------------------------ Rückfrage ------------------------------ */

export interface ConfirmOptions {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  extra?: ReactNode
}

export function Confirm({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Sheet
      title={options.title}
      onClose={onCancel}
      narrow
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            {options.cancelLabel ?? 'Abbrechen'}
          </button>
          <button
            className={options.danger ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? 'Bestätigen'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 'var(--step-0)', color: 'var(--text-soft)' }}>{options.message}</div>
      {options.extra}
    </Sheet>
  )
}

/** Kleiner Zustandshelfer für Rückfragen. */
export function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(
    null,
  )
  const ask = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setState({ options, resolve }))
  const element = state ? (
    <Confirm
      options={state.options}
      onConfirm={() => {
        state.resolve(true)
        setState(null)
      }}
      onCancel={() => {
        state.resolve(false)
        setState(null)
      }}
    />
  ) : null
  return { ask, element }
}

/* -------------------------------- Menü -------------------------------- */

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  separatorBefore?: boolean
}

export function Menu({
  items,
  anchor,
  onClose,
}: {
  items: MenuItem[]
  anchor: DOMRect
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: anchor.bottom + 6, left: anchor.right - 216 })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let top = anchor.bottom + 6
    let left = Math.min(anchor.right - rect.width, window.innerWidth - rect.width - 10)
    if (top + rect.height > window.innerHeight - 10) top = Math.max(10, anchor.top - rect.height - 6)
    if (left < 10) left = 10
    setPos({ top, left })
  }, [anchor])

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return createPortal(
    <div
      className="menu"
      ref={ref}
      role="menu"
      style={{ position: 'fixed', top: pos.top, left: pos.left }}
    >
      {items.map((item, i) => (
        <div key={item.label}>
          {item.separatorBefore && i > 0 && <hr />}
          <button
            role="menuitem"
            className={item.danger ? 'danger' : undefined}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
          >
            {item.icon}
            {item.label}
          </button>
        </div>
      ))}
    </div>,
    portalTarget(),
  )
}

export function useMenu() {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const open = (e: React.MouseEvent) => {
    e.stopPropagation()
    setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect())
  }
  return { anchor, open, close: () => setAnchor(null) }
}

/* ------------------------- Toasts und Kopierhilfe ------------------------- */

export function ToastHost() {
  const { toasts, manualCopy, setManualCopy } = useStore()
  return (
    <>
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
      {manualCopy != null && (
        <ManualCopyDialog text={manualCopy} onClose={() => setManualCopy(null)} />
      )}
    </>
  )
}

function ManualCopyDialog({ text, onClose }: { text: string; onClose: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <Sheet
      title="Text zum Kopieren"
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Fertig
        </button>
      }
    >
      <p className="hint" style={{ marginBottom: 10 }}>
        Dieser Browser erlaubt keinen direkten Zugriff auf die Zwischenablage. Der Text ist bereits
        markiert – mit <span className="kbd">Strg/Cmd + C</span> oder über „Kopieren“ im Kontextmenü
        übernehmen.
      </p>
      <textarea className="textarea" ref={ref} value={text} readOnly rows={12} />
    </Sheet>
  )
}
