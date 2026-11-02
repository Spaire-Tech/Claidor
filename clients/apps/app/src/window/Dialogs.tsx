// The window's alerts and sheets in a browser: an alert as the Mac's
// (`NSAlert`, the window's confirmation `I3n`), its title and words, the
// action (red when it destroys) and Cancel; a sheet over the window, closed
// by a click outside it (`closesOnClickOutside`) or Escape.

import { type ReactNode, useEffect, useRef } from 'react'
import { t } from '../l10n'

/** Escape over the window, wherever the keys are (a button the sheet removed leaves them on the page): before anything under it. */
function useEscape(handle: () => void) {
  const latest = useRef(handle)
  useEffect(() => {
    latest.current = handle
  })
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      latest.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}

/**
 * An alert: the app's mark, its title (13, bold) and words (11), centred,
 * 260 wide on the raised ground, 14 round; the action and Cancel side by
 * side under them. Return does the action, Escape cancels.
 */
export function Alert({
  title,
  message,
  action,
  destructive,
  cancel,
  onAction,
  onCancel,
}: {
  title: string
  message: string
  action: string
  destructive?: boolean
  /** No Cancel for an alert that only tells (its action is OK). */
  cancel?: string
  onAction: () => void
  onCancel?: () => void
}) {
  const first = useRef<HTMLButtonElement>(null)
  useTakesFocus(first)
  useEscape(onCancel ?? onAction)
  return (
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault()
      }}
    >
      <div
        className="alert"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <img
          className="alert-mark"
          src={`${import.meta.env.BASE_URL}favicon.svg`}
          alt=""
          aria-hidden="true"
        />
        <div className="alert-title">{title}</div>
        <div className="alert-message">{message}</div>
        <div className="alert-buttons">
          {onCancel && (
            <button type="button" className="alert-button" onClick={onCancel}>
              {cancel ?? t('Cancel')}
            </button>
          )}
          <button
            ref={first}
            type="button"
            className={
              destructive ? 'alert-button destructive' : 'alert-button default'
            }
            onClick={onAction}
          >
            {action}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Takes the keys while it is open, and gives them back to what had them
 * when it closes (a Mac alert's and sheet's way), unless that is gone.
 */
function useTakesFocus(target: { current: HTMLElement | null }) {
  useEffect(() => {
    const before =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    target.current?.focus()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [target])
}

/**
 * Whether an alert, a sheet or a viewer is over the window. The window's
 * own keys (⌘F, ⌘B, Delete on picked rows) wait until it is gone, as
 * behind a Mac's sheet.
 */
export function somethingOver(): boolean {
  return document.querySelector('[aria-modal="true"]') != null
}

/** A sheet over the window: the dimmed window behind, a click outside or Escape closes it. */
export function Sheet({
  label,
  close,
  children,
  className,
}: {
  label: string
  close: () => void
  children: ReactNode
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  useTakesFocus(box)
  useEscape(close)
  return (
    <div
      className="sheet-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
    >
      <div
        ref={box}
        className={className ? `sheet ${className}` : 'sheet'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  )
}
