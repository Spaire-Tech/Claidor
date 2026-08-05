'use client'

// Module-level registry of the in-flight course trailer upload, keyed by
// course id.
//
// Why this exists: the customize/landing editor unmounts when you switch
// tabs, but the trailer upload runs on an XMLHttpRequest that outlives
// React. With the progress kept in component state, switching away mid-
// upload and coming back showed no percentage (and no busy state) even
// though bytes were still flowing. Keeping it in a store outside the
// component means a remounted editor picks the same upload back up.

import { useSyncExternalStore } from 'react'

export type TrailerUpload = {
  // Monotonic id for THIS upload attempt, so a superseded attempt's async
  // handlers can detect a newer upload has taken over and bow out instead
  // of firing a stale toast / undo entry.
  token: number
  // Upload progress, 0–100. Sits at 100 while the API finalises (streams
  // the file to storage) before the request resolves.
  pct: number
}

const uploads = new Map<string, TrailerUpload>()
const listeners = new Set<() => void>()
let tokenSeq = 0

function emit(): void {
  for (const listener of listeners) listener()
}

export const courseTrailerUploadStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  get(courseId: string): TrailerUpload | undefined {
    return uploads.get(courseId)
  },

  isCurrent(courseId: string, token: number): boolean {
    return uploads.get(courseId)?.token === token
  },

  begin(courseId: string): number {
    const token = ++tokenSeq
    uploads.set(courseId, { token, pct: 0 })
    emit()
    return token
  },

  progress(courseId: string, token: number, pct: number): void {
    const cur = uploads.get(courseId)
    if (!cur || cur.token !== token) return
    uploads.set(courseId, { ...cur, pct })
    emit()
  },

  clear(courseId: string, token?: number): void {
    const cur = uploads.get(courseId)
    if (!cur) return
    if (token !== undefined && cur.token !== token) return
    uploads.delete(courseId)
    emit()
  },
}

// Subscribe a component to the in-flight trailer upload (if any) for one
// course.
export function useCourseTrailerUpload(
  courseId: string,
): TrailerUpload | undefined {
  return useSyncExternalStore(
    courseTrailerUploadStore.subscribe,
    () => courseTrailerUploadStore.get(courseId),
    () => undefined,
  )
}
