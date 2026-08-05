'use client'

// useLandingEditor — the single pipeline every edit on the dashboard course
// landing flows through. It exists to fix three things at once:
//
//   • Trust: each edit updates the course query cache optimistically, PATCHes
//     the server, and on failure ROLLS BACK the cache and surfaces a toast +
//     an error status (instead of the old fire-and-forget mutate that lost
//     edits silently and always said "Changes save automatically").
//   • Undo/redo: every edit is recorded as an apply/invert pair on a history
//     stack, so ⌘Z / ⌘⇧Z (and the toolbar buttons) can walk backwards and
//     forwards — including text, image swaps, repositioning, and section ops.
//   • No clobber: it drives the cache directly and PATCHes via the raw,
//     NON-invalidating helpers, so a refetch can't land mid-edit and revert
//     an in-flight change. The server deep-merges landing_overrides, so an
//     edit only ever sends the subtree it changed.
//
// The cache (`['courses', { courseId }]`) is the single source of truth; the
// host passes the (optimistically-updated) course straight back down.

import {
  patchCourseRaw,
  patchLessonRaw,
  patchModuleRaw,
  type CourseRead,
  type LandingOverrides,
} from '@/hooks/queries/courses'
import { getQueryClient } from '@/utils/api/query'
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { toast } from '../../Toast/use-toast'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// A single server write + how to undo it. The cache is updated by applying the
// op locally; the server receives the same op via the raw PATCH helpers.
export type ServerOp =
  | { kind: 'course'; body: CourseFieldBody }
  | { kind: 'overrides'; patch: OverridesPatch }
  | { kind: 'lesson'; lessonId: string; body: LessonFieldBody }
  | { kind: 'module'; moduleId: string; body: ModuleFieldBody }

type CourseFieldBody = {
  title?: string | null
  instructor_name?: string | null
  thumbnail_url?: string | null
  trailer_url?: string | null
  thumbnail_object_position?: string | null
}
type LessonFieldBody = {
  title?: string
  description?: string | null
  thumbnail_url?: string | null
  thumbnail_object_position?: string | null
}
type ModuleFieldBody = { title?: string }

// A landing_overrides patch. `null` for a key deletes it (the server and the
// local merge both honour this), which is how a field is reset/cleared.
export type OverridesPatch = Record<string, unknown>

export type LandingEdit = {
  apply: ServerOp
  invert: ServerOp
  label: string
}

const HISTORY_LIMIT = 100
const SAVED_LINGER_MS = 1400

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Mirror the backend deep-merge (server/polar/course/landing.py): dict+dict
// recurses, `null` deletes a key, everything else (scalars, arrays) replaces.
export function mergeOverridesLocal(
  existing: LandingOverrides | null | undefined,
  patch: OverridesPatch,
): LandingOverrides {
  const result: Record<string, unknown> = isPlainObject(existing)
    ? { ...(existing as Record<string, unknown>) }
    : {}
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key]
    } else if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeOverridesLocal(
        result[key] as LandingOverrides,
        value as OverridesPatch,
      )
    } else {
      result[key] = value
    }
  }
  return result as LandingOverrides
}

function applyOp(course: CourseRead, op: ServerOp): CourseRead {
  switch (op.kind) {
    case 'course':
      return { ...course, ...op.body }
    case 'overrides':
      return {
        ...course,
        landing_overrides: mergeOverridesLocal(
          course.landing_overrides,
          op.patch,
        ),
      }
    case 'lesson':
      return {
        ...course,
        modules: course.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) =>
            l.id === op.lessonId ? { ...l, ...op.body } : l,
          ),
        })),
      }
    case 'module':
      return {
        ...course,
        modules: course.modules.map((m) =>
          m.id === op.moduleId ? { ...m, ...op.body } : m,
        ),
      }
  }
}

function execOp(courseId: string, op: ServerOp): Promise<unknown> {
  switch (op.kind) {
    case 'course':
      return patchCourseRaw(courseId, op.body)
    case 'overrides':
      return patchCourseRaw(courseId, {
        landing_overrides: op.patch as unknown as LandingOverrides,
      })
    case 'lesson':
      return patchLessonRaw(op.lessonId, op.body)
    case 'module':
      return patchModuleRaw(op.moduleId, op.body)
  }
}

export type LandingEditor = {
  status: SaveStatus
  canUndo: boolean
  canRedo: boolean
  /** Apply an edit (optimistic + persist) and record it for undo. */
  commit: (edit: LandingEdit) => void
  /**
   * Record an already-applied change (e.g. a completed upload that the server
   * has already persisted) for undo, without re-running its apply op.
   */
  record: (edit: LandingEdit) => void
  undo: () => void
  redo: () => void
}

export function useLandingEditor(course: CourseRead): LandingEditor {
  const courseId = course.id
  const queryKey = ['courses', { courseId }]

  const [status, setStatus] = useState<SaveStatus>('idle')
  const inFlight = useRef(0)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hist = useRef<{ stack: LandingEdit[]; index: number }>({
    stack: [],
    index: 0,
  })
  const [, bump] = useReducer((x: number) => x + 1, 0)

  // Reset history + status when the editor is pointed at a different course.
  useEffect(() => {
    hist.current = { stack: [], index: 0 }
    inFlight.current = 0
    if (savedTimer.current) clearTimeout(savedTimer.current)
    setStatus('idle')
    bump()
  }, [courseId])

  const settleSaved = useCallback(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => {
      if (inFlight.current === 0) {
        setStatus((s) => (s === 'saved' ? 'idle' : s))
      }
    }, SAVED_LINGER_MS)
  }, [])

  // Run one op: optimistic cache write → persist → rollback+toast on failure.
  const runOp = useCallback(
    async (op: ServerOp): Promise<boolean> => {
      const qc = getQueryClient()
      const snapshot = qc.getQueryData<CourseRead>(queryKey)
      if (!snapshot) return false
      qc.setQueryData<CourseRead>(queryKey, applyOp(snapshot, op))
      inFlight.current += 1
      setStatus('saving')
      try {
        await execOp(courseId, op)
        return true
      } catch (err) {
        // Roll the optimistic write back so the canvas reflects reality.
        qc.setQueryData<CourseRead>(queryKey, snapshot)
        toast({
          title: "Couldn't save change",
          description:
            err instanceof Error && err.message
              ? err.message
              : 'Your last edit was not saved. Please try again.',
        })
        return false
      } finally {
        inFlight.current -= 1
        if (inFlight.current === 0) {
          setStatus((prev) => {
            if (prev === 'error') return 'error'
            return 'saved'
          })
          settleSaved()
        }
      }
    },
    // queryKey is derived from courseId; depend on courseId to stay stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [courseId, settleSaved],
  )

  const commit = useCallback(
    (edit: LandingEdit) => {
      const h = hist.current
      h.stack = h.stack.slice(0, h.index)
      h.stack.push(edit)
      if (h.stack.length > HISTORY_LIMIT) h.stack.shift()
      h.index = h.stack.length
      bump()
      void runOp(edit.apply).then((ok) => {
        if (!ok) {
          // The edit didn't persist — drop it from history.
          const hh = hist.current
          const at = hh.stack.lastIndexOf(edit)
          if (at !== -1) {
            hh.stack.splice(at, 1)
            hh.index = Math.min(hh.index, hh.stack.length)
          }
          setStatus('error')
          bump()
        }
      })
    },
    [runOp],
  )

  const record = useCallback((edit: LandingEdit) => {
    const h = hist.current
    h.stack = h.stack.slice(0, h.index)
    h.stack.push(edit)
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift()
    h.index = h.stack.length
    bump()
  }, [])

  const undo = useCallback(() => {
    const h = hist.current
    if (h.index <= 0) return
    const edit = h.stack[h.index - 1]
    h.index -= 1
    bump()
    void runOp(edit.invert).then((ok) => {
      if (!ok) {
        hist.current.index += 1
        setStatus('error')
        bump()
      }
    })
  }, [runOp])

  const redo = useCallback(() => {
    const h = hist.current
    if (h.index >= h.stack.length) return
    const edit = h.stack[h.index]
    h.index += 1
    bump()
    void runOp(edit.apply).then((ok) => {
      if (!ok) {
        hist.current.index -= 1
        setStatus('error')
        bump()
      }
    })
  }, [runOp])

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current)
    },
    [],
  )

  return {
    status,
    canUndo: hist.current.index > 0,
    canRedo: hist.current.index < hist.current.stack.length,
    commit,
    record,
    undo,
    redo,
  }
}
