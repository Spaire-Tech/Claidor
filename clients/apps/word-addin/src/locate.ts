/**
 * Turning a finding into something Word can select.
 *
 * The server checks a *string*, and returns character offsets into it.
 * Word has no concept of a character offset into the whole document: it
 * finds text by searching and hands back every match. So a finding has to
 * be re-located, and this is where that can go quietly wrong.
 *
 * The bridge is the occurrence index. The server counts which hit a
 * finding is among all occurrences of its own literal; the add-in runs the
 * same search in Word and takes the same hit. That only holds if both
 * sides are looking at the same string, which is why `documentText()` in
 * `word.ts` builds the text from paragraphs in order and this module is
 * pure and tested.
 *
 * Everything here is deliberately free of Office.js so it can be run
 * without Word, which is the only way any of it gets tested at all.
 */

export type Severity = 'critical' | 'warning' | 'to_review'
export type Certainty = 'certain' | 'probable' | 'suggested'

export interface Finding {
  defect: string
  severity: Severity
  certainty: Certainty
  term: string
  note: string
  context: string
  start: number
  end: number
  literal: string
  occurrence: number
}

export interface Review {
  findings: Finding[]
  critical_count: number
  warning_count: number
  to_review_count: number
  characters: number
}

/** Word's paragraph separator in the text we assemble and submit. */
export const PARAGRAPH_BREAK = '\n'

/** Word's `Range.search` refuses a search string longer than this. */
export const MAX_SEARCH_LENGTH = 255

export interface SearchPlan {
  /** What to pass to `Range.search`. */
  query: string
  /** Which of the returned matches is the one meant, 0-based. */
  index: number
  /** True when `query` had to be altered to be searchable at all. */
  approximate: boolean
}

/**
 * How to find a finding in Word, or `null` when it cannot be found.
 *
 * Returning `null` is a real answer and the panel shows it. A finding
 * whose location cannot be recovered is still worth reading — the note and
 * the surrounding context say what is wrong — and pretending to jump
 * somewhere is worse than saying "I can't take you there".
 */
export function planSearch(finding: Finding): SearchPlan | null {
  const literal = finding.literal
  if (!literal.trim()) return null

  // A literal that crosses a paragraph break cannot be searched: Word
  // searches within paragraphs. Collapsing the whitespace usually
  // recovers it, because the break came from the source file's line
  // wrapping rather than from a real paragraph. Usually is not always,
  // so the plan says it is approximate and the caller reports that.
  const wrapped = /\s/.test(literal) && literal !== collapse(literal)
  const query = collapse(literal)

  if (!query || query.length > MAX_SEARCH_LENGTH) return null

  return {
    query,
    // The server's index is 1-based because it reads as "the 3rd
    // occurrence"; Word hands back a 0-based collection.
    index: Math.max(0, finding.occurrence - 1),
    approximate: wrapped,
  }
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/**
 * Whether Word's search is case-sensitive for this finding.
 *
 * A case mismatch is *about* the casing — « closing date » where « Closing
 * Date » was defined — so searching without `matchCase` would select the
 * correctly-cased occurrence instead and the reader would see nothing
 * wrong with it. Every other defect is reported at a span whose casing is
 * already the term's own, so matching case is right there too; it is
 * stated rather than assumed because getting it backwards is invisible.
 */
export function matchCase(_finding: Finding): boolean {
  return true
}

/** Their four buckets, in the order the panel shows them. */
export const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'to_review']

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  warning: 'Warning',
  to_review: 'To review',
}

export const DEFECT_LABEL: Record<string, string> = {
  undefined_term: 'Undefined term',
  unused_definition: 'Unused definition',
  multiple_definitions: 'Multiple definitions',
  unordered_definitions: 'Unordered definitions',
  case_mismatch: 'Wrong case',
  broken_reference: 'Broken cross-reference',
  numbering_gap: 'Numbering gap',
  duplicate_number: 'Duplicate number',
  contradiction: 'Contradiction',
  miscalculation: 'Miscalculation',
}

export function defectLabel(defect: string): string {
  return DEFECT_LABEL[defect] ?? defect.replace(/_/g, ' ')
}

/** Findings grouped into the panel's buckets, empty buckets included. */
export function bySeverity(
  findings: Finding[],
): { severity: Severity; findings: Finding[] }[] {
  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: findings.filter((finding) => finding.severity === severity),
  }))
}

/**
 * The replacement that fixes a finding, or `null` when there is not one.
 *
 * Only a wrong case has a mechanical fix: the term is written one way and
 * defined another, and the correction is the defined form. Everything else
 * — a term nobody defined, a definition nobody uses, two definitions of
 * one term — needs a drafting decision, and offering a button that guesses
 * at one would be the worst thing this add-in could do.
 */
export function fixFor(finding: Finding): string | null {
  if (finding.defect !== 'case_mismatch') return null
  if (!finding.term.trim()) return null
  return finding.term
}
