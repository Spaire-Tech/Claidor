/**
 * What kind of file a name is, and what it wears.
 *
 * These lived in the Check-a-model screen; the screen left the product
 * with the Swens design (its bench is off the dock), and the mapping
 * stayed because the folder browser reads it. Same suffix table as the
 * server's `ingest.SUFFIXES`.
 */

import { fileIcon } from './design'

/** What each kind of file wears, same mapping as the deal page. */
export const iconOf = (kind: string): string => {
  if (kind === 'model') return fileIcon.xls
  if (kind === 'deck') return fileIcon.ppt
  if (kind === 'message') return fileIcon.mail
  return fileIcon.doc
}

export const kindFor = (filename: string): string => {
  const lower = filename.toLowerCase()
  if (/\.(xlsx|xlsm|xls|xlt)$/.test(lower)) return 'model'
  if (/\.(pptx|pptm)$/.test(lower)) return 'deck'
  if (/\.(docx|doc)$/.test(lower)) return 'memo'
  return 'file'
}

/** « 1 hour ago » · « yesterday, 19:40 » · « 4 August » — the design's
 *  relative time, shared shape with the project list's checked line. */
export const ago = (at: string): string => {
  const then = new Date(at)
  const now = new Date()
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24 && then.getDate() === now.getDate())
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const time = then.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (then.toDateString() === yesterday.toDateString())
    return `yesterday, ${time}`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
}

//: The four avatar gradients the design uses, assigned by a stable
//: hash of the name so one person keeps one colour.
const AVATARS = [
  { bg: 'linear-gradient(150deg,#d8e6ff,#b9cdf5)', fg: '#2c4a80' },
  { bg: 'linear-gradient(150deg,#d9f0dd,#b6dcc0)', fg: '#275c39' },
  { bg: 'linear-gradient(150deg,#ffe0d4,#f5c4ae)', fg: '#8a4526' },
  { bg: 'linear-gradient(150deg,#ece0f7,#d2bfe8)', fg: '#553a7a' },
]

export const avatarOf = (name: string) => {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return AVATARS[Math.abs(hash) % AVATARS.length]!
}

export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .slice(0, 2)
    .join('')

/**
 * The design's finding families — the group heading over a row.
 *
 * Checked against what the engine *emits*, not against the rule
 * catalogues: a rule missing from `RULE_NAMES` and
 * `ANALYTIC_RULE_NAMES` is exactly the rule most likely to be missing
 * here too, and reading the catalogues finds nothing wrong with it.
 * `TestTheCategoryMap` (server/tests/tieout/test_routes.py) holds the
 * two sides together.
 */
const CATEGORY_OF: Record<string, string> = {
  'inconsistent-row': 'Probable formula defects',
  'skipped-cell': 'Probable formula defects',
  'inconsistent-anchoring': 'Probable formula defects',
  'error-value': 'Probable formula defects',
  circular: 'Probable formula defects',
  'time-axis': 'Probable formula defects',
  //: Sentinel's A3 adoptions (eleventh sweep), routed here by the
  //: lead's order once they merged — same family as their siblings.
  'inconsistent-total': 'Probable formula defects',
  'typed-over-edge': 'Probable formula defects',
  'range-over-block': 'Probable formula defects',
  //: The three below are emitted by the engine but are in neither
  //: RULE_NAMES nor ANALYTIC_RULE_NAMES, so Settings cannot list them
  //: and a firm cannot switch them off — reported to the lead.
  //: Mapped here so a finding the engine calls an error is not filed
  //: under « Other findings » on a partner's report.
  //:
  //: `gapped-test`: a check formula that walks cells one by one and
  //: skips a live block. `typed-over-beat`: Sentinel's column-direction
  //: extension of `typed-over-edge`, and it sits with it. `broken-name`:
  //: defined names storing #REF! or pointing into another workbook —
  //: the same defect `external-link` names, one level up in the file.
  'gapped-test': 'Probable formula defects',
  'typed-over-beat': 'Probable formula defects',
  //: A row reading a sibling row's switch while it owns one
  //: (wrong-switch.md): a wrong reference with a plausible number.
  'anchored-elsewhere': 'Probable formula defects',
  'balance-sheet': 'Structural exceptions',
  'cash-continuity': 'Structural exceptions',
  'debt-terminal': 'Structural exceptions',
  'model-own-check': 'Structural exceptions',
  //: Renamed in the merged catalogue (was `interest`).
  'interest-consistency': 'Structural exceptions',
  //: The convention check (convention-check.md): a line computed
  //: unlike every model we hold that carries the same line name. A
  //: reviewer's question rather than a defect, so it is its own
  //: family, named for what the reader is being told.
  convention: 'Computed unlike other models',
  'typed-over-formula': 'Embedded hardcodes',
  //: A typed value where the version before held a formula
  //: (overwritten-since.md): the same family as its file-only
  //: sibling, with the earlier version as the evidence.
  'formula-overwritten': 'Embedded hardcodes',
  'hardcode-in-formula': 'Embedded hardcodes',
  'external-link': 'Auditability risks',
  'broken-name': 'Auditability risks',
  //: **A new family, and the first added since this map was written.**
  //: Sentinel's unit checks report a sum that adds dollars to euros,
  //: or thousands to millions. That is not a « probable formula
  //: defect »: the formula is mechanically perfect and the answer is
  //: nonsense — a meaning error, not a mechanical one. Nor is it a
  //: « structural exception », which in this map means the statements
  //: not holding together, one relationship at a time.
  //:
  //: « Units that do not agree » says the whole of it in words a
  //: banker uses, and it extends to the unit checks that follow —
  //: currency, scale, per-unit against total. A later check about a
  //: *basis* rather than a unit (real against nominal, say) earns its
  //: own family rather than stretching this one; families are named
  //: for what the reader is being told.
  //:
  //: Neither rule is in `RULE_NAMES` or `HEADLINES` on the engine
  //: side, so until they are, **this family name is the only name a
  //: reader sees for the defect** — which is why it has to carry the
  //: meaning on its own.
  'currency-mismatch': 'Units that do not agree',
  'scale-mismatch': 'Units that do not agree',
  //: The period unit, and it belongs here on the founder's own
  //: grouping rather than on a judgement of mine: swens.md lists « a
  //: monthly figure used where an annual one belongs » in the same
  //: breath as dollars added to pounds and thousands mixed with
  //: millions, and the unit-checks paragraph names the same pair.
  //:
  //: The note above reserved a new family for a check about a *basis*
  //: rather than a unit. A period is a unit — the row's own time
  //: axis says which one — so this is the family, not a stretch of it.
  'broken-aggregation': 'Units that do not agree',
  volatile: 'Auditability risks',
  'long-formula': 'Auditability risks',
  'hidden-sheet': 'Auditability risks',
}
/** The family by rule key. */
export const categoryOfKey = (rule: string): string =>
  rule === ''
    ? 'Documents against the model'
    : (CATEGORY_OF[rule] ?? 'Other findings')
