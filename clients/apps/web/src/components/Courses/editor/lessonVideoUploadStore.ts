'use client'

// A module-level registry of in-flight lesson video uploads, keyed by
// lesson id.
//
// Why this exists: a direct upload runs on a plain XMLHttpRequest that
// outlives React. But the lesson editor unmounts whenever you switch
// lessons (its React key is the lesson id), so the progress state used to
// live and die with the component — leave the lesson mid-upload and come
// back and the bytes were still flowing, but the progress bar (and the
// Cancel button) were gone, with no way to tell how far along you were.
// Keeping the upload in a store outside the component means a remounted
// editor picks the very same upload back up, bar and all.

import { useSyncExternalStore } from 'react'

export type LessonUpload = {
  // Monotonic id for THIS upload attempt. Lets a superseded attempt's
  // async handlers detect that a newer upload has taken over the lesson
  // and bow out instead of clobbering it.
  token: number
  // Upload progress 0–100 while the PUT is in flight; null once every byte
  // has been sent and the host is transcoding.
  pct: number | null
  // Object URL of the picked file, shown as a local preview until the
  // transcoded asset is ready.
  localUrl: string | null
  // The in-flight request, so a remounted editor can still cancel it.
  xhr: XMLHttpRequest | null
  // The playback id the lesson had BEFORE this upload started, so the
  // editor can tell when a *new* ready asset (a different id) has arrived
  // and it's safe to drop the local preview.
  prevPlaybackId: string | null
}

const uploads = new Map<string, LessonUpload>()
const listeners = new Set<() => void>()
let tokenSeq = 0

function emit(): void {
  for (const listener of listeners) listener()
}

export const lessonVideoUploadStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },

  get(lessonId: string): LessonUpload | undefined {
    return uploads.get(lessonId)
  },

  isCurrent(lessonId: string, token: number): boolean {
    return uploads.get(lessonId)?.token === token
  },

  // Start (or restart) an upload for a lesson. Revokes/aborts any previous
  // attempt for the same lesson and returns the new attempt's token.
  begin(
    lessonId: string,
    localUrl: string,
    prevPlaybackId: string | null,
  ): number {
    const prev = uploads.get(lessonId)
    if (prev) {
      // Stop the superseded upload so it doesn't keep eating bandwidth; its
      // handlers see they're no longer current (token changed) and no-op.
      prev.xhr?.abort()
      if (prev.localUrl && prev.localUrl !== localUrl) {
        URL.revokeObjectURL(prev.localUrl)
      }
    }
    const token = ++tokenSeq
    uploads.set(lessonId, {
      token,
      pct: 0,
      localUrl,
      xhr: null,
      prevPlaybackId,
    })
    emit()
    return token
  },

  attachXhr(lessonId: string, token: number, xhr: XMLHttpRequest): void {
    const cur = uploads.get(lessonId)
    if (!cur || cur.token !== token) return
    uploads.set(lessonId, { ...cur, xhr })
    emit()
  },

  progress(lessonId: string, token: number, pct: number): void {
    const cur = uploads.get(lessonId)
    if (!cur || cur.token !== token) return
    uploads.set(lessonId, { ...cur, pct })
    emit()
  },

  // The PUT finished; the host is transcoding. Keep the preview but drop
  // the percentage and the (now-useless) request handle.
  settled(lessonId: string, token: number): void {
    const cur = uploads.get(lessonId)
    if (!cur || cur.token !== token) return
    uploads.set(lessonId, { ...cur, pct: null, xhr: null })
    emit()
  },

  // Remove the entry. When `token` is given, only clears if it's still the
  // current attempt (so a stale handler can't wipe a newer upload).
  clear(
    lessonId: string,
    { revoke, token }: { revoke?: boolean; token?: number } = {},
  ): void {
    const cur = uploads.get(lessonId)
    if (!cur) return
    if (token !== undefined && cur.token !== token) return
    if (revoke && cur.localUrl) URL.revokeObjectURL(cur.localUrl)
    uploads.delete(lessonId)
    emit()
  },
}

// Subscribe a component to the in-flight upload (if any) for one lesson.
export function useLessonVideoUpload(
  lessonId: string,
): LessonUpload | undefined {
  return useSyncExternalStore(
    lessonVideoUploadStore.subscribe,
    () => lessonVideoUploadStore.get(lessonId),
    () => undefined,
  )
}
