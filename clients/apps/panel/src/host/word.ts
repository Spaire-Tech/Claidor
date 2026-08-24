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

import { filenameFromUrl, readStamp, writeStamp } from './settings'
import type {
  Anchor,
  GoToResult,
  HostBridge,
  OpenDocument,
  WriteResult,
} from './types'

export interface WordAnchor extends Anchor {
  /** The text to find — the figure as printed. */
  text?: string
  /** Which occurrence, 1-based. Defaults to the first. */
  occurrence?: number
}

/**
 * Replace a figure in the memo, as a native Word tracked change.
 *
 * The one host with a revision model, and the convention its readers
 * already expect: a memo is reviewed in Word with track changes on, so a
 * correction arrives as something to accept rather than as something that
 * has happened. Change tracking is turned on for the edit and put back
 * afterwards, so a document somebody had deliberately left untracked is
 * not quietly switched.
 *
 * Adapted from `word-addin/src/office/redline.ts`, which does this for
 * contract clauses: load the mode, verify the located span really is what
 * was expected, replace, restore in a `finally`. What is not borrowed is
 * the word-level diff — a figure is one token and there is nothing to
 * diff — and the anchoring, which here is the printed figure and its
 * occurrence rather than a quoted clause.
 *
 * **Word attributes the change to the signed-in user**, because Office.js
 * cannot set a revision's author. The server's own writer stamps
 * « Swens » instead; both are true statements about who made the edit,
 * and neither is a guess.
 */
async function writeInto(
  anchor: WordAnchor,
  before: string,
  after: string,
): Promise<WriteResult> {
  const query = anchor.text || before
  if (!query) {
    return { written: false, by: 'none', reason: 'this finding names no text' }
  }

  return Word.run(async (context) => {
    const document = context.document
    document.load('changeTrackingMode')
    const results = document.body.search(query, { matchCase: false })
    results.load('items')
    await context.sync()

    if (results.items.length === 0) {
      return {
        written: false,
        by: 'none',
        reason: `« ${query} » is not in this document — it may have been edited`,
      }
    }

    const wanted = Math.max(1, anchor.occurrence ?? 1)
    if (wanted > results.items.length) {
      // The memo used to print this figure more times than it does now.
      // Taking the last one would be a guess about which survived.
      return {
        written: false,
        by: 'none',
        reason: `this memo no longer prints « ${query} » ${wanted} times — re-check before accepting`,
      }
    }
    const target = results.items[wanted - 1]

    const priorMode = document.changeTrackingMode
    document.changeTrackingMode = Word.ChangeTrackingMode.trackAll
    target.load('text')
    await context.sync()

    if (target.text.trim() !== query.trim()) {
      document.changeTrackingMode = priorMode
      await context.sync()
      return {
        written: false,
        by: 'none',
        reason: `that paragraph now reads « ${target.text.trim()} » — re-check before accepting`,
      }
    }

    try {
      target.insertText(after, Word.InsertLocation.replace)
      await context.sync()
      return { written: true, by: 'tracked' }
    } finally {
      try {
        document.changeTrackingMode = priorMode
        await context.sync()
      } catch {
        // The original outcome stands; a context that has already broken
        // cannot be used to say anything more truthful than it did.
      }
    }
  }).catch((error: unknown) => ({
    written: false,
    by: 'none',
    reason: error instanceof Error ? error.message : 'Word refused the change',
  }))
}

export const word: HostBridge = {
  //: Dormant host — the product is Excel-only. Nothing to hand over.
  async readFile() {
    return null
  },

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
      reason:
        error instanceof Error ? error.message : 'Word refused the request',
    }))
  },

  write(anchor: WordAnchor, before: string, after: string) {
    return writeInto(anchor, before, after)
  },
}
