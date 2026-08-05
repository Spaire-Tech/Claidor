'use client'

import * as React from 'react'
import { createPortal } from 'react-dom'

// Bottom sheet — the portal's one primitive for mobile secondary surfaces
// (account hub, notifications, and later lesson outlines / comments). Renders
// into document.body so the top bar's transform (hide-on-scroll) can't hijack
// its fixed positioning, and re-applies the portal theme classes since it
// mounts outside the .spaire-portal tree.
//
// Behavior: slide-up panel over a dimmed backdrop; closes on backdrop tap,
// Escape, or dragging the grab handle down past a threshold. Locks body
// scroll while open and pads the bottom for the home-indicator inset.
export const PortalSheet = ({
  open,
  onClose,
  title,
  ariaLabel,
  dark,
  headerAction,
  children,
}: {
  open: boolean
  onClose: () => void
  title?: string
  /** Accessible dialog name when there is no visible title. */
  ariaLabel?: string
  dark: boolean
  /** Optional control rendered in the header next to the title
   * (e.g. "Mark all read"). */
  headerAction?: React.ReactNode
  children: React.ReactNode
}) => {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  // Escape to close + body scroll lock while open.
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // Drag-to-dismiss from the grab-handle strip. The panel follows the finger
  // downward (never upward) and dismisses past 80px, else springs back.
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const dragStartY = React.useRef<number | null>(null)
  const dragDelta = React.useRef(0)

  const onGripTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0]?.clientY ?? null
    dragDelta.current = 0
    if (panelRef.current) panelRef.current.style.transition = 'none'
  }
  const onGripTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return
    const y = e.touches[0]?.clientY ?? dragStartY.current
    dragDelta.current = Math.max(0, y - dragStartY.current)
    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${dragDelta.current}px)`
    }
  }
  const onGripTouchEnd = () => {
    const panel = panelRef.current
    const shouldClose = dragDelta.current > 80
    dragStartY.current = null
    if (panel) {
      panel.style.transition = ''
      panel.style.transform = ''
    }
    if (shouldClose) onClose()
  }

  if (!mounted || !open) return null

  return createPortal(
    <div className={'spaire-portal sp-sheet-root' + (dark ? ' sp-dark' : '')}>
      <div className="sp-sheet-backdrop" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        className="sp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title ?? ariaLabel}
      >
        <div
          className="sp-sheet-grip"
          onTouchStart={onGripTouchStart}
          onTouchMove={onGripTouchMove}
          onTouchEnd={onGripTouchEnd}
        >
          <span className="sp-sheet-handle" aria-hidden />
        </div>
        {(title || headerAction) && (
          <div className="sp-sheet-head">
            <div className="sp-sheet-title">{title}</div>
            {headerAction}
            <button
              type="button"
              className="sp-sheet-close"
              onClick={onClose}
              aria-label="Close"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
        <div className="sp-sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
