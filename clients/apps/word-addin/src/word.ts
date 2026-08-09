/**
 * Every call into Word, in one file.
 *
 * Two rules hold everywhere here.
 *
 * **The text we submit is the text the offsets index.** `documentText`
 * builds it from paragraphs in order joined by a single newline, and the
 * server's offsets are into exactly that string. Anything that normalises,
 * trims or re-encodes it between here and the request breaks every jump in
 * the panel, silently.
 *
 * **No edit happens without change tracking on.** `applyFix` turns
 * `changeTrackingMode` to `trackAll` before it writes and refuses outright
 * if it cannot. A lawyer accepting our fixes one at a time is the entire
 * interaction; an untracked edit to a client's agreement is the one
 * failure that would end a trial, and it would not be visible until
 * somebody compared versions.
 */

import { matchCase, planSearch, type Finding } from './locate'
import { PARAGRAPH_BREAK } from './locate'

export class WordUnavailable extends Error {}

/** The document as one string, matching what the server will be given. */
export async function documentText(): Promise<string> {
  return Word.run(async (context) => {
    const paragraphs = context.document.body.paragraphs
    paragraphs.load('items/text')
    await context.sync()
    return paragraphs.items.map((item) => item.text).join(PARAGRAPH_BREAK)
  })
}

/**
 * Select a finding in the document, so the reader is looking at it.
 *
 * Returns false when the text could not be found — the document changed
 * under us, or the literal spans a paragraph break. The panel says so
 * rather than leaving the selection where it was and appearing to work.
 */
export async function reveal(finding: Finding): Promise<boolean> {
  const plan = planSearch(finding)
  if (!plan) return false

  return Word.run(async (context) => {
    const results = context.document.body.search(plan.query, {
      matchCase: matchCase(finding),
    })
    results.load('items')
    await context.sync()

    const target = results.items[plan.index]
    if (!target) return false

    target.select()
    await context.sync()
    return true
  })
}

export type FixOutcome =
  | { applied: true }
  | { applied: false; reason: 'not-fixable' | 'not-found' | 'tracking-refused' }

/**
 * Replace the text of a finding, as a tracked change.
 *
 * The order matters: tracking is turned on and synced *before* the write,
 * so there is no window in which an edit lands untracked.
 */
export async function applyFix(
  finding: Finding,
  replacement: string,
): Promise<FixOutcome> {
  const plan = planSearch(finding)
  if (!plan) return { applied: false, reason: 'not-fixable' }

  return Word.run(async (context) => {
    const document = context.document

    // Turn tracking on first, and confirm it took. If Word will not
    // record revisions, nothing is written at all.
    document.changeTrackingMode = Word.ChangeTrackingMode.trackAll
    await context.sync()

    document.load('changeTrackingMode')
    await context.sync()
    if (document.changeTrackingMode !== Word.ChangeTrackingMode.trackAll) {
      return { applied: false, reason: 'tracking-refused' } as const
    }

    const results = document.body.search(plan.query, {
      matchCase: matchCase(finding),
    })
    results.load('items')
    await context.sync()

    const target = results.items[plan.index]
    if (!target) return { applied: false, reason: 'not-found' } as const

    target.insertText(replacement, Word.InsertLocation.replace)
    await context.sync()
    return { applied: true } as const
  })
}

/** Resolve once Office has finished starting, or reject if it never does. */
export function ready(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof Office === 'undefined') {
      reject(new WordUnavailable('Office.js did not load.'))
      return
    }
    Office.onReady((info) => {
      if (info.host !== Office.HostType.Word) {
        reject(new WordUnavailable('This pane only runs inside Word.'))
        return
      }
      resolve()
    })
  })
}
