/**
 * One panel, four hosts, one import.
 *
 * Everything above this file asks `host()` and gets something that answers
 * `read`, `stamp` and `goTo` the same way everywhere. No screen imports
 * `Office`, and no screen branches on which application it is inside — the
 * differences between the four are real, and they all live below here.
 *
 * `ready()` exists because Office.js is not available the moment the page
 * loads. `Office.onReady` is the only reliable signal, and a panel that
 * calls into the API before it fires fails in a way that looks like a
 * broken add-in rather than a race.
 */

import { excel } from './excel'
import { outlook } from './outlook'
import { powerpoint } from './powerpoint'
import type { HostBridge, HostKind } from './types'
import { word } from './word'

export { attachments, firstReadable, pickReadable } from './outlook'
export { clearStamp, readStamp, writeStamp } from './settings'
export * from './types'

/**
 * Which document a detached panel should pretend to be looking at.
 *
 * Development only, and it completes what `detached` is for. Without a
 * filename the server can only answer « none », so a browser could reach
 * the sign-in and choose-a-deal screens and never the one the panel is
 * actually *for*. `?filename=cascade_deck.pptx` gets there.
 *
 * It is not a way in: identify still runs against the caller's own token
 * and their own deals, and a name that matches nothing answers « none »
 * exactly as before. It is stripped from production builds regardless.
 */
function pretendFilename(): string | null {
  // `import.meta.env.DEV` is Vite's own constant, replaced at build time —
  // not an environment variable, so it has no business in turbo.json.
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (!import.meta.env.DEV) return null
  return new URLSearchParams(window.location.search).get('filename')
}

/**
 * A stand-in for running outside Office at all.
 *
 * The panel is a web page and `pnpm dev` opens it in a browser, which is
 * how it will be built for most of its life. Refusing to render there
 * would make every screen untestable without sideloading into Word.
 */
const detached: HostBridge = {
  host: 'unknown',
  async read() {
    return {
      host: 'unknown',
      filename: pretendFilename(),
      lineageId: null,
      currentPage: null,
    }
  },
  async stamp() {
    return false
  },
  async goTo() {
    return {
      moved: false,
      by: 'none',
      reason: 'not running inside Office — open this from the add-in',
    }
  },
}

function detect(): HostKind {
  const kind = Office.context?.host
  if (kind === Office.HostType.PowerPoint) return 'powerpoint'
  if (kind === Office.HostType.Excel) return 'excel'
  if (kind === Office.HostType.Word) return 'word'
  if (kind === Office.HostType.Outlook) return 'outlook'
  return 'unknown'
}

let bridge: HostBridge = detached

/** Resolves once Office has told us what it is. Safe to await repeatedly. */
export async function ready(): Promise<HostBridge> {
  if (typeof Office === 'undefined' || !Office.onReady) return detached
  await Office.onReady()
  switch (detect()) {
    case 'powerpoint':
      bridge = powerpoint
      break
    case 'excel':
      bridge = excel
      break
    case 'word':
      bridge = word
      break
    case 'outlook':
      bridge = outlook
      break
    default:
      bridge = detached
  }
  return bridge
}

/** The bridge for whichever host this is. Call `ready()` first. */
export function host(): HostBridge {
  return bridge
}
