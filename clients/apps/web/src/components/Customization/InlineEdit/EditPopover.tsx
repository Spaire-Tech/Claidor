'use client'

import { useEffect, type ReactNode } from 'react'
import { Portal } from './Portal'

/**
 * Modal popover used by every inline-edit affordance that needs more
 * space than a contentEditable allows (tag inputs, social rows,
 * available-for-work toggle, profile-title select, etc.).
 *
 * Portaled to document.body so backdrop-filter blurs the whole editor
 * canvas regardless of where the trigger lives in the React tree.
 */
export const EditPopover = ({
  title,
  open,
  onClose,
  onConfirm,
  confirmLabel = 'Done',
  cancelLabel = 'Cancel',
  children,
}: {
  title: string
  open: boolean
  onClose: () => void
  onConfirm?: () => void
  confirmLabel?: string
  cancelLabel?: string
  children: ReactNode
}) => {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null
  return (
    <Portal>
      <div className="spaire-editor">
        <div className="edit-pop-backdrop" onClick={onClose} />
        <div
          className="edit-pop"
          role="dialog"
          aria-label={title}
          aria-modal="true"
        >
          <div className="edit-pop-head">
            <div className="edit-pop-title">{title}</div>
            <button
              type="button"
              className="hc-btn"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
          <div className="edit-pop-body">{children}</div>
          <div className="edit-pop-foot">
            <button
              type="button"
              className="edit-pop-cta ghost"
              onClick={onClose}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              className="edit-pop-cta"
              onClick={() => {
                onConfirm?.()
                onClose()
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
