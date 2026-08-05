'use client'

// Portal theme — the customer portal is always dark. There is no light
// option and no customer toggle. (The sign-in / claim screens are the one
// exception: their light/dark is the creator's design choice, read directly
// from `customer_portal_sign_in_theme` in PortalShell, not from here.)

import { useCallback, useEffect } from 'react'

const cacheKey = (slug: string) => `sp_theme:${slug}`

// `token` is accepted for call-site compatibility but no longer used.
export function usePortalTheme(slug: string, _token?: string) {
  // Keep the shared cache in sync so surfaces that render outside the portal
  // wrapper (e.g. the student community hub) also resolve to dark.
  useEffect(() => {
    try {
      window.localStorage.setItem(cacheKey(slug), 'dark')
    } catch {
      /* ignore */
    }
  }, [slug])

  const toggle = useCallback(() => {
    /* no-op: the portal is always dark */
  }, [])

  return { dark: true, toggle }
}
