import { useCallback, useEffect, useRef, useState } from 'react'
import { ContentDoc } from './types'

const MAX_HISTORY = 50
const COALESCE_MS = 600

/**
 * Bounded undo/redo history layered over an existing value+setter.
 *
 * The parent owns state; this hook tracks past/future stacks and intercepts
 * Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (or Cmd/Ctrl+Y) to navigate.
 *
 *   const [doc, setDoc] = useState<ContentDoc>(initial)
 *   const history = useDocHistory(doc, setDoc)
 *   <BlockEditor doc={doc} setDoc={history.set} />
 */
export function useDocHistory(
  value: ContentDoc,
  setValue: (next: ContentDoc) => void,
): {
  set: (next: ContentDoc) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  reset: () => void
} {
  const past = useRef<ContentDoc[]>([])
  const future = useRef<ContentDoc[]>([])
  const lastEditAt = useRef(0)
  const valueRef = useRef(value)
  // Sync the latest value into the ref via effect, not during render —
  // React's rules-of-refs lint forbids ref writes in the render phase.
  useEffect(() => {
    valueRef.current = value
  }, [value])

  // Mirror the stack lengths into state so canUndo/canRedo invalidate the
  // rendering parent when the stacks change.
  const [pastLen, setPastLen] = useState(0)
  const [futureLen, setFutureLen] = useState(0)
  const sync = useCallback(() => {
    setPastLen(past.current.length)
    setFutureLen(future.current.length)
  }, [])

  const set = useCallback(
    (next: ContentDoc) => {
      const now = Date.now()
      const coalesce = now - lastEditAt.current < COALESCE_MS
      lastEditAt.current = now
      if (!coalesce) {
        past.current.push(valueRef.current)
        if (past.current.length > MAX_HISTORY) past.current.shift()
      }
      future.current = []
      setValue(next)
      sync()
    },
    [setValue, sync],
  )

  const undo = useCallback(() => {
    const prior = past.current.pop()
    if (prior === undefined) return
    future.current.push(valueRef.current)
    if (future.current.length > MAX_HISTORY) future.current.shift()
    lastEditAt.current = 0
    setValue(prior)
    sync()
  }, [setValue, sync])

  const redo = useCallback(() => {
    const ahead = future.current.pop()
    if (ahead === undefined) return
    past.current.push(valueRef.current)
    if (past.current.length > MAX_HISTORY) past.current.shift()
    lastEditAt.current = 0
    setValue(ahead)
    sync()
  }, [setValue, sync])

  const reset = useCallback(() => {
    past.current = []
    future.current = []
    lastEditAt.current = 0
    sync()
  }, [sync])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return {
    set,
    undo,
    redo,
    canUndo: pastLen > 0,
    canRedo: futureLen > 0,
    reset,
  }
}
