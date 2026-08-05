import { useEffect, useRef, useState } from 'react'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/**
 * Debounced autosave hook. Calls `save(value)` ~1.5s after the last change.
 *
 * Status transitions:
 *   idle → saving (during the in-flight call)
 *   saving → saved (success; held for 2s then drops back to idle)
 *   saving → error (rejection; sticks until the next successful save)
 *
 * Skips the initial mount so we don't fire a save the moment the editor
 * loads with the just-fetched draft.
 */
export function useAutosave<T>(
  value: T,
  save: (next: T) => Promise<unknown>,
  options: { delayMs?: number; enabled?: boolean } = {},
): SaveStatus {
  const { delayMs = 1500, enabled = true } = options
  const [status, setStatus] = useState<SaveStatus>('idle')
  const initial = useRef(true)
  const timer = useRef<number | null>(null)
  const inflight = useRef(0)
  const settledTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (initial.current) {
      initial.current = false
      return
    }
    if (timer.current != null) {
      clearTimeout(timer.current)
    }
    timer.current = window.setTimeout(() => {
      const ticket = ++inflight.current
      setStatus('saving')
      Promise.resolve(save(value))
        .then(() => {
          // Ignore stale completions — only the latest in-flight attempt
          // updates the visible status.
          if (ticket !== inflight.current) return
          setStatus('saved')
          if (settledTimer.current != null) {
            clearTimeout(settledTimer.current)
          }
          settledTimer.current = window.setTimeout(() => {
            setStatus('idle')
          }, 2000)
        })
        .catch(() => {
          if (ticket !== inflight.current) return
          setStatus('error')
        })
    }, delayMs)
    return () => {
      if (timer.current != null) clearTimeout(timer.current)
    }
  }, [value, save, delayMs, enabled])

  return status
}
