// The theme (`MacTheme` in mac/Simeon/ComposerPicks.swift): System, Light
// or Dark, chosen in Settings › General, ⌘K and "/", kept in this browser
// under the Mac's name (`simeon.theme`). The window's dark colours are
// written once, under `@media (prefers-color-scheme: dark)`; the build
// (scripts/theme-css.mjs) makes each of those rules follow a chosen theme
// too, by the `data-theme` on the page's root. What the page draws itself
// in dark (a logo's dark picture) asks `useDarkScheme`.

import { useSyncExternalStore } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

/** The Mac's own name for it (`MacTheme.key`). */
export const themeKey = 'simeon.theme'

const listeners = new Set<() => void>()

/** The theme chosen in this browser; System when none was, or storage can't be read. */
export function themePreference(): ThemePreference {
  try {
    const kept = localStorage.getItem(themeKey)
    return kept === 'light' || kept === 'dark' ? kept : 'system'
  } catch {
    return 'system'
  }
}

/** The page's root follows the theme chosen (`MacTheme.apply`): no mark for System, the system's own then. */
export function applyTheme(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const preference = preferenceNow()
  if (preference === 'system') delete root.dataset.theme
  else root.dataset.theme = preference
}

/**
 * A theme chosen (`MacTheme.set`): kept, then the old look fading into the
 * new over the whole window at once, 0.3 s, easing out, as the Mac's (the
 * browser's own cross-fade of the page); none when the person asked for
 * less motion.
 */
export function setTheme(preference: ThemePreference): void {
  memory = undefined
  try {
    if (preference === 'system') localStorage.removeItem(themeKey)
    else localStorage.setItem(themeKey, preference)
  } catch {
    // Kept for this visit only.
    memory = preference
  }
  const fade =
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  if (fade) document.startViewTransition(() => applyTheme())
  else applyTheme()
  for (const listener of listeners) listener()
}

/** A choice storage couldn't keep (a private window that refuses it): this visit's. */
let memory: ThemePreference | undefined

function preferenceNow(): ThemePreference {
  return memory ?? themePreference()
}

function subscribe(changed: () => void): () => void {
  listeners.add(changed)
  const query = window.matchMedia?.('(prefers-color-scheme: dark)')
  query?.addEventListener('change', changed)
  return () => {
    listeners.delete(changed)
    query?.removeEventListener('change', changed)
  }
}

/** The theme chosen, kept up to date (Settings › General's picker, ⌘K's and "/"'s tick). */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, preferenceNow, () => 'system')
}

/** Whether the window is dark now: the theme chosen, else the system's. */
export function darkNow(): boolean {
  const preference = preferenceNow()
  if (preference !== 'system') return preference === 'dark'
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

/** Dark or light, as the theme chosen or the system says, kept up to date. */
export function useDarkScheme(): boolean {
  return useSyncExternalStore(subscribe, darkNow, () => false)
}
