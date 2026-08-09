/**
 * Taking a finding back to the place in Word it came from.
 *
 * The server counts occurrences with a plain substring scan: it walks the
 * text it was given with `find`, and a finding's `occurrence` is its 1-based
 * index among those hits. So this must search the *same* way.
 *
 * That rules out upstream's `locateOccurrence`, which is whole-word and
 * would count differently the moment a literal sits inside a longer word —
 * the server counts "Note" inside "Notes", a whole-word search does not, and
 * from there every index below it is off by one. Nothing throws when that
 * happens. Word selects a real occurrence of the right words and the reader
 * concludes the check is noise. Hence a separate, deliberately dumber
 * locator.
 *
 * **Known limitation.** `readDocumentText` returns the all-changes-accepted
 * view, which is what the server checked. `body.search` runs over the stored
 * text, which still contains pending deletions. On a document with tracked
 * changes above a finding, a hit can therefore be counted here that the
 * server never saw. The panel says when it could not land where it meant;
 * it cannot yet say when it landed somewhere plausible but wrong. Fixing it
 * properly needs the offsets carried through Office's own range model rather
 * than recovered by searching.
 */

import { runWord, serializeTrackChanges } from '@/office/run'

import { matchCase, planSearch, type Finding } from './locate'

export type GoToResult =
  | { kind: 'found'; approximate: boolean }
  /** Located nothing at all — the words are not in the document. */
  | { kind: 'not_found' }
  /** Found fewer hits than the finding's occurrence index. */
  | { kind: 'moved'; found: number }
  /** Unsearchable: empty, or longer than Word's 255-character limit. */
  | { kind: 'unsearchable' }

export type FixResult =
  | { kind: 'applied' }
  | { kind: 'not_found' }
  | { kind: 'moved'; found: number }
  | { kind: 'unsearchable' }
  /** Word would not turn change tracking on, so nothing was written. */
  | { kind: 'untracked' }

/**
 * Select the occurrence a finding means, and scroll it into view.
 *
 * Every outcome is a value rather than an exception, because every one of
 * them is something the reader needs told. « I cannot take you there » is a
 * worse answer than a jump and a better one than a wrong jump.
 */
export async function goTo(finding: Finding): Promise<GoToResult> {
  const plan = planSearch(finding)
  if (!plan) return { kind: 'unsearchable' }

  return runWord(async (context) => {
    const results = context.document.body.search(plan.query, {
      matchCase: matchCase(finding),
      // Whole-word off on purpose: the server's index counts substrings.
      matchWholeWord: false,
      ignorePunct: false,
      ignoreSpace: false,
    })
    results.load('items')
    await context.sync()

    if (results.items.length === 0) return { kind: 'not_found' }
    if (plan.index >= results.items.length) {
      return { kind: 'moved', found: results.items.length }
    }

    const target = results.items[plan.index]
    target.select(Word.SelectionMode.select)
    await context.sync()
    return { kind: 'found', approximate: plan.approximate }
  })
}

/**
 * Rewrite the span as a tracked change.
 *
 * Only a wrong case ever reaches here — see `fixFor`. The replacement is the
 * term as the document itself defines it, so this is the one correction that
 * needs no drafting decision.
 *
 * Change tracking is forced on, confirmed by reading it back, and restored
 * afterwards. If Word will not turn it on, nothing is written at all: an
 * untracked edit to a client's agreement is not noticed until somebody
 * compares versions, which is far too late to find out.
 */
export async function applyFix(
  finding: Finding,
  replacement: string,
): Promise<FixResult> {
  const plan = planSearch(finding)
  if (!plan) return { kind: 'unsearchable' }

  return serializeTrackChanges(() =>
    runWord(async (context) => {
      const doc = context.document
      doc.load('changeTrackingMode')
      const results = doc.body.search(plan.query, {
        matchCase: matchCase(finding),
        matchWholeWord: false,
        ignorePunct: false,
        ignoreSpace: false,
      })
      results.load('items')
      await context.sync()

      if (results.items.length === 0) return { kind: 'not_found' }
      if (plan.index >= results.items.length) {
        return { kind: 'moved', found: results.items.length }
      }

      const priorMode = doc.changeTrackingMode
      doc.changeTrackingMode = Word.ChangeTrackingMode.trackAll
      await context.sync()

      // Read it back rather than trust the write. A document can refuse the
      // mode, and the refusal is silent.
      doc.load('changeTrackingMode')
      await context.sync()
      if (doc.changeTrackingMode !== Word.ChangeTrackingMode.trackAll) {
        return { kind: 'untracked' }
      }

      try {
        const target = results.items[plan.index]
        target.insertText(replacement, Word.InsertLocation.replace)
        target.select(Word.SelectionMode.select)
        await context.sync()
        return { kind: 'applied' }
      } finally {
        try {
          doc.changeTrackingMode = priorMode
          await context.sync()
        } catch {
          // Best-effort restore; the original outcome still propagates.
        }
      }
    }),
  )
}
