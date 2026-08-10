/**
 * Word: a memo cites the same figures the deck prints.
 *
 * The document kind the tie-out cannot read yet — `ingest.py` says so in
 * words rather than failing — so this bridge carries no anchor scheme of
 * its own. What it can already do is find a printed figure in the open
 * memo and select it, which is enough for the panel to be useful in Word
 * on the day memo reading lands, and honest before then.
 *
 * Search rather than coordinates, deliberately. Word has no shape ids to
 * match on, and a paragraph index in a document somebody is editing is
 * stale by the time it is used. The printed figure — « $48.9mm » — is
 * stable, visible, and what the finding is about anyway.
 *
 * The risk of searching is landing on the wrong occurrence when a memo
 * prints the same figure twice. `occurrence` says which one, so a finding
 * that knows can say; when nothing says, the first is taken and the result
 * reports that it was a search, so a screen can show « first match » and
 * let the reader step on.
 */

import type { Anchor, GoToResult, HostBridge, OpenDocument } from './types'
import { filenameFromUrl, readStamp, writeStamp } from './settings'

export interface WordAnchor extends Anchor {
  /** The text to find — the figure as printed. */
  text?: string
  /** Which occurrence, 1-based. Defaults to the first. */
  occurrence?: number
}

export const word: HostBridge = {
  host: 'word',

  async read(): Promise<OpenDocument> {
    return {
      host: 'word',
      filename: filenameFromUrl(),
      lineageId: readStamp(),
      currentPage: null,
    }
  },

  stamp: writeStamp,

  async goTo(anchor: WordAnchor): Promise<GoToResult> {
    const text = anchor.text
    if (!text) {
      return { moved: false, by: 'none', reason: 'this finding names no text' }
    }

    return Word.run(async (context) => {
      const results = context.document.body.search(text, { matchCase: false })
      results.load('items')
      await context.sync()

      if (results.items.length === 0) {
        return {
          moved: false,
          by: 'none',
          reason: `« ${text} » is not in this document — it may have been edited`,
        }
      }

      const wanted = Math.max(1, anchor.occurrence ?? 1)
      const target = results.items[Math.min(wanted, results.items.length) - 1]
      target.select()
      await context.sync()
      return { moved: true, by: 'search' }
    }).catch((error: unknown) => ({
      moved: false,
      by: 'none',
      reason: error instanceof Error ? error.message : 'Word refused the request',
    }))
  },
}
