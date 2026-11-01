import { useSyncExternalStore } from 'react'

/** Redraws a screen when what it reads changes (the store, the session). */
export function useWatched(watched: {
  subscribe(listener: () => void): () => void
  getVersion: () => number
}): number {
  return useSyncExternalStore(
    (listener) => watched.subscribe(listener),
    watched.getVersion,
    watched.getVersion,
  )
}
