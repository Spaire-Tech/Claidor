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

/** The design's finding families — the group heading over a row. */
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
  //: Fires on real models (a check formula that walks cells one by
  //: one and skips a live block) but is in neither RULE_NAMES nor
  //: ANALYTIC_RULE_NAMES, so Settings cannot list it and a firm
  //: cannot switch it off — reported to the lead, seventeenth
  //: sweep. Mapped here so a material finding is not filed under
  //: « Other findings » on a partner's report.
  'gapped-test': 'Probable formula defects',
  'balance-sheet': 'Structural exceptions',
  'cash-continuity': 'Structural exceptions',
  'debt-terminal': 'Structural exceptions',
  'model-own-check': 'Structural exceptions',
  //: Renamed in the merged catalogue (was `interest`), and
  //: Sentinel's column-direction extension joins its siblings —
  //: re-checked against RULE_NAMES + ANALYTIC_RULE_NAMES,
  //: seventeenth sweep. Nothing in the catalogue is unmapped.
  'interest-consistency': 'Structural exceptions',
  'typed-over-formula': 'Embedded hardcodes',
  'hardcode-in-formula': 'Embedded hardcodes',
  'external-link': 'Auditability risks',
  volatile: 'Auditability risks',
  'long-formula': 'Auditability risks',
  'hidden-sheet': 'Auditability risks',
}
/** The family by rule key. */
export const categoryOfKey = (rule: string): string =>
  rule === ''
    ? 'Documents against the model'
    : (CATEGORY_OF[rule] ?? 'Other findings')
