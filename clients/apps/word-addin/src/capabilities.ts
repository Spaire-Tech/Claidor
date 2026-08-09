/**
 * What this copy of Word can actually do.
 *
 * Office.js is one API with many hosts behind it, and the honest way to
 * use it is to ask. `Office.context.requirements.isSetSupported` is that
 * question, and the answers matter here:
 *
 * - **WordApi 1.3** — ranges, search, paragraphs. Without it there is no
 *   add-in; the manifest requires it.
 * - **WordApi 1.4** — `changeTrackingMode`, which is how a fix becomes a
 *   *tracked* change rather than a silent edit. Word on the web, Windows
 *   M365 2208 and later, volume-licensed Office 2024, Mac and iPad.
 *
 * Vesence's own answer to old Office is a system requirement — « very old
 * perpetual 2016 or 2019 builds may not support the add-in » — and that is
 * a reasonable answer. It is not a reason to skip the probe. A firm on a
 * build without 1.4 should be told, in the panel, that fixes cannot be
 * tracked here, rather than have the add-in either fail or — far worse —
 * quietly edit their agreement without a revision mark.
 */

export interface Capabilities {
  /** Ranges and search. Everything depends on this. */
  ranges: boolean
  /** `changeTrackingMode`, so an edit is recorded as a revision. */
  trackedChanges: boolean
}

export function detect(): Capabilities {
  const requirements = globalThis.Office?.context?.requirements
  if (!requirements) {
    return { ranges: false, trackedChanges: false }
  }
  return {
    ranges: requirements.isSetSupported('WordApi', '1.3'),
    trackedChanges: requirements.isSetSupported('WordApi', '1.4'),
  }
}

/**
 * What to tell the reader when something is missing.
 *
 * Written as a sentence about their Word rather than about our API
 * versions, because « WordApi 1.4 is unavailable » is not a fact anybody
 * outside this file can act on.
 */
export function limitation(capabilities: Capabilities): string | null {
  if (!capabilities.ranges) {
    return (
      'This version of Word is too old for Claidor to read the document. ' +
      'Microsoft 365, Word on the web, or Office 2021 and later will work.'
    )
  }
  if (!capabilities.trackedChanges) {
    return (
      'This version of Word cannot record tracked changes from an add-in, ' +
      'so fixes are listed but cannot be applied here. Checks work normally.'
    )
  }
  return null
}
