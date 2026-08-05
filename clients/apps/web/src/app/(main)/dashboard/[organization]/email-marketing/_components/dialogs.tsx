'use client'

import { ReactNode, useCallback, useState } from 'react'
import { Modal } from './Modal'

/**
 * Dialog primitives that replace `window.alert`, `window.confirm`, and
 * `window.prompt` with the in-app modal styling.
 *
 * Audit issue #39 / Phase 4: the dashboard reached for native browser
 * dialogs in several spots — they're inaccessible (the prompt has no
 * hook for validation, can't be styled, screen-reader announcements are
 * inconsistent across browsers, and they steal focus from background
 * tabs). The modal-backed equivalents below have the same async-await
 * ergonomics, so call-sites change from
 *
 *   if (!window.confirm('Delete?')) return
 *
 * to
 *
 *   if (!(await dialogs.confirm({ title: 'Delete?' }))) return
 *
 * One DialogsRoot mounts at the email-marketing layout root; consumers
 * use the singleton handle exposed via `useDialogs()`.
 */

type AlertOpts = {
  title: string
  message?: ReactNode
  confirmLabel?: string
  tone?: 'neutral' | 'danger'
}

type ConfirmOpts = AlertOpts & {
  cancelLabel?: string
}

type PromptOpts = {
  title: string
  message?: ReactNode
  placeholder?: string
  defaultValue?: string
  confirmLabel?: string
  cancelLabel?: string
  validate?: (value: string) => string | null // null = ok, string = error msg
  type?: 'text' | 'email' | 'url' | 'number'
}

type Pending =
  | {
      kind: 'alert'
      opts: AlertOpts
      resolve: () => void
    }
  | {
      kind: 'confirm'
      opts: ConfirmOpts
      resolve: (ok: boolean) => void
    }
  | {
      kind: 'prompt'
      opts: PromptOpts
      resolve: (value: string | null) => void
    }

type DialogHandle = {
  alert: (opts: AlertOpts) => Promise<void>
  confirm: (opts: ConfirmOpts) => Promise<boolean>
  prompt: (opts: PromptOpts) => Promise<string | null>
}

// Singleton — the layout-level DialogsRoot wires the handle into this ref so
// any callsite can `useDialogs()` without context plumbing through a deep
// component tree.
let activeHandle: DialogHandle | null = null

export const useDialogs = (): DialogHandle => {
  if (activeHandle == null) {
    // Fallback to the native dialogs if DialogsRoot hasn't mounted yet —
    // better than crashing during SSR / before hydration.
    return {
      alert: async ({ title, message }) => {
        if (typeof window !== 'undefined') {
          window.alert(message ? `${title}\n\n${message}` : title)
        }
      },
      confirm: async ({ title, message }) => {
        if (typeof window === 'undefined') return false
        return window.confirm(message ? `${title}\n\n${message}` : title)
      },
      prompt: async ({ title, defaultValue, message }) => {
        if (typeof window === 'undefined') return null
        return window.prompt(
          message ? `${title}\n\n${message}` : title,
          defaultValue ?? '',
        )
      },
    }
  }
  return activeHandle
}

/**
 * Mount this once near the top of the email-marketing tree (e.g. inside
 * the layout). Subsequent calls to `useDialogs()` resolve to a handle
 * that drives the modal here.
 */
export const DialogsRoot = () => {
  const [pending, setPending] = useState<Pending | null>(null)

  const close = useCallback(() => setPending(null), [])

  // Bind the singleton handle. We do this synchronously in the render so
  // any consumer that calls `useDialogs()` after this mounts gets the
  // real implementation; the cleanup in the effect releases it on unmount.
  activeHandle = {
    alert: (opts) =>
      new Promise<void>((resolve) => {
        setPending({
          kind: 'alert',
          opts,
          resolve: () => {
            close()
            resolve()
          },
        })
      }),
    confirm: (opts) =>
      new Promise<boolean>((resolve) => {
        setPending({
          kind: 'confirm',
          opts,
          resolve: (ok) => {
            close()
            resolve(ok)
          },
        })
      }),
    prompt: (opts) =>
      new Promise<string | null>((resolve) => {
        setPending({
          kind: 'prompt',
          opts,
          resolve: (val) => {
            close()
            resolve(val)
          },
        })
      }),
  }

  if (!pending) return null

  if (pending.kind === 'alert') {
    return <AlertModal pending={pending} />
  }
  if (pending.kind === 'confirm') {
    return <ConfirmModal pending={pending} />
  }
  return <PromptModal pending={pending} />
}

const AlertModal = ({
  pending,
}: {
  pending: Extract<Pending, { kind: 'alert' }>
}) => (
  <Modal
    open
    onClose={pending.resolve}
    title={pending.opts.title}
    width={420}
  >
    {pending.opts.message && (
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {pending.opts.message}
      </div>
    )}
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
      <button
        type="button"
        autoFocus
        className={`btn ${
          pending.opts.tone === 'danger' ? 'btn-danger' : 'btn-primary'
        }`}
        onClick={pending.resolve}
      >
        {pending.opts.confirmLabel ?? 'OK'}
      </button>
    </div>
  </Modal>
)

const ConfirmModal = ({
  pending,
}: {
  pending: Extract<Pending, { kind: 'confirm' }>
}) => (
  <Modal
    open
    onClose={() => pending.resolve(false)}
    title={pending.opts.title}
    width={460}
  >
    {pending.opts.message && (
      <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        {pending.opts.message}
      </div>
    )}
    <div
      style={{
        display: 'flex',
        gap: 10,
        justifyContent: 'flex-end',
        marginTop: 18,
      }}
    >
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => pending.resolve(false)}
      >
        {pending.opts.cancelLabel ?? 'Cancel'}
      </button>
      <button
        type="button"
        autoFocus
        className={`btn ${
          pending.opts.tone === 'danger' ? 'btn-danger' : 'btn-primary'
        }`}
        onClick={() => pending.resolve(true)}
      >
        {pending.opts.confirmLabel ?? 'Confirm'}
      </button>
    </div>
  </Modal>
)

const PromptModal = ({
  pending,
}: {
  pending: Extract<Pending, { kind: 'prompt' }>
}) => {
  const [value, setValue] = useState(pending.opts.defaultValue ?? '')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    if (pending.opts.validate) {
      const err = pending.opts.validate(value)
      if (err != null) {
        setError(err)
        return
      }
    }
    pending.resolve(value)
  }

  return (
    <Modal
      open
      onClose={() => pending.resolve(null)}
      title={pending.opts.title}
      width={460}
    >
      {pending.opts.message && (
        <div
          style={{
            fontSize: 14,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
            marginBottom: 14,
          }}
        >
          {pending.opts.message}
        </div>
      )}
      <input
        autoFocus
        className="input"
        type={pending.opts.type ?? 'text'}
        value={value}
        placeholder={pending.opts.placeholder}
        onChange={(e) => {
          setValue(e.target.value)
          if (error) setError(null)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
        }}
        style={{ width: '100%' }}
      />
      {error && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
          {error}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'flex-end',
          marginTop: 18,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => pending.resolve(null)}
        >
          {pending.opts.cancelLabel ?? 'Cancel'}
        </button>
        <button type="button" className="btn btn-primary" onClick={submit}>
          {pending.opts.confirmLabel ?? 'OK'}
        </button>
      </div>
    </Modal>
  )
}
