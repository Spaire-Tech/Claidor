// Windows' own parts the page uses in the Windows app since 6 November 2026
// (contract.ts, "After step 7"): Windows' file dialog with the Mac's words,
// Windows' alert sound, and pictures from other sites read by the app and
// kept on the PC. On the web each is undefined or does nothing, and the
// caller keeps the web's own way (the page's chooser, no sound, the site's
// own address).

import { useEffect, useState } from 'react'
import type { FileAsk } from './contract'
import { type Desktop, desktop } from './desktop'

/** The Windows app's main window, or undefined (the web, the call's window). */
function mainApp(): Desktop | undefined {
  const app = desktop()
  return app?.facts.window === 'main' ? app : undefined
}

/**
 * Windows' file dialog over the window with the Mac's words (the Mac's open
 * panel): the files chosen, made `File`s; none when it is cancelled.
 * Undefined on the web, where the page's own chooser opens.
 */
export function chooseInApp(ask: FileAsk): Promise<File[]> | undefined {
  const app = mainApp()
  if (!app) return undefined
  return app.call('chooseFiles', ask).then(
    (chosen) =>
      chosen.map(
        (file) =>
          new File([file.bytes as Uint8Array<ArrayBuffer>], file.name, {
            type: file.type,
          }),
      ),
    () => [],
  )
}

/** Windows' alert sound where the Mac beeps (a refused Create, a form's problem); nothing on the web. */
export function beep(): void {
  void mainApp()
    ?.call('beep')
    .catch(() => {})
}

/**
 * An airline's logo as the Windows app keeps it on the PC: a `data:`
 * address, null when there is none, undefined when the page reads it
 * itself (the web, or the app couldn't answer).
 */
export async function keptLogo(
  url: string,
): Promise<string | null | undefined> {
  const app = mainApp()
  if (!app || !url.startsWith('https://')) return undefined
  return app.call('remotePicture', url).catch(() => undefined)
}

const siteIcons = new Map<string, string | null>()
const siteIconsAsked = new Map<string, Promise<string | null>>()

/**
 * A saved login's site icon as the Windows app reads it (its page's touch
 * icon, kept on the PC a week): the `data:` address, null when it has
 * none, 'waiting' while the app reads it; undefined on the web, where the
 * page loads the site's /favicon.ico itself.
 */
export function useKeptSiteIcon(
  site: string,
): string | null | 'waiting' | undefined {
  const app = mainApp()
  const [, redraw] = useState(0)
  useEffect(() => {
    if (!app || site === '' || siteIcons.has(site)) return
    let current = true
    let asking = siteIconsAsked.get(site)
    if (!asking) {
      asking = app.call('siteIcon', site).then(
        (icon) => {
          siteIcons.set(site, icon)
          return icon
        },
        () => {
          siteIcons.set(site, null)
          return null
        },
      )
      siteIconsAsked.set(site, asking)
    }
    void asking.then(() => {
      if (current) redraw((n) => n + 1)
    })
    return () => {
      current = false
    }
  }, [app, site])
  if (!app) return undefined
  if (site === '') return null
  return siteIcons.has(site) ? (siteIcons.get(site) ?? null) : 'waiting'
}
