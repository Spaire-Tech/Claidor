'use client'

import { useEffect } from 'react'

/**
 * Force light mode by removing the 'dark' class from <html>.
 *
 * Important caveats:
 * - This component runs after hydration, so dark-mode users will briefly
 *   see dark styles. To prevent that flash, render the inline
 *   `forceLightModeBeforeHydration` script (see below) in a server
 *   component above this one.
 * - Cleanup re-reads localStorage so it picks up theme changes the user
 *   made in another tab while this component was mounted.
 */
export function ForceLightMode() {
  useEffect(() => {
    const html = document.documentElement
    const wasDark = html.classList.contains('dark')
    html.classList.remove('dark')

    // Some other code (a theme initializer running after we did) may try
    // to re-add the dark class while this page is mounted. Watch for it
    // and strip again.
    const observer = new MutationObserver(() => {
      if (html.classList.contains('dark')) {
        html.classList.remove('dark')
      }
    })
    observer.observe(html, { attributes: true, attributeFilter: ['class'] })

    return () => {
      observer.disconnect()
      // Re-read at cleanup so we honor the user's latest preference
      // (they may have toggled it in another tab while we were mounted).
      const stored =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('theme')
          : null
      if (wasDark || stored === 'dark') {
        html.classList.add('dark')
      }
    }
  }, [])

  return null
}

/**
 * Inline script string to render *before* the React tree paints, so
 * dark-theme users don't flash dark styles on a public Space page.
 *
 * Use it in a server component:
 *
 *   <script
 *     dangerouslySetInnerHTML={{
 *       __html: forceLightModeBeforeHydration,
 *     }}
 *   />
 */
export const forceLightModeBeforeHydration = `(function(){try{document.documentElement.classList.remove('dark')}catch(e){}})()`
