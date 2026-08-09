/**
 * The bridge between a character offset and a Word selection.
 *
 * This is the part of the add-in that can be wrong without anything
 * visibly failing: the panel lists a finding, the reader clicks « Go to »,
 * and Word selects a *different* occurrence of the same words. Nothing
 * throws. The reader looks at correct text and concludes the check is
 * noise.
 *
 * So the mapping is pure and tested here, away from Office.
 */

import { describe, expect, it } from 'vitest'

import {
  MAX_SEARCH_LENGTH,
  bySeverity,
  defectLabel,
  findingKey,
  fixFor,
  matchCase,
  planSearch,
  type Finding,
} from './locate'

function finding(over: Partial<Finding> = {}): Finding {
  return {
    defect: 'case_mismatch',
    severity: 'warning',
    certainty: 'certain',
    term: 'Closing Date',
    note: 'note',
    context: 'context',
    start: 10,
    end: 22,
    literal: 'closing date',
    occurrence: 1,
    ...over,
  }
}

describe('planning the search', () => {
  it('searches for the literal as written', () => {
    expect(planSearch(finding())?.query).toBe('closing date')
  })

  it('converts the 1-based occurrence to a 0-based index', () => {
    // The server counts "the 3rd occurrence" because that is how it reads;
    // Word hands back a collection. Off by one here selects the wrong
    // paragraph and looks like a working feature.
    expect(planSearch(finding({ occurrence: 3 }))?.index).toBe(2)
    expect(planSearch(finding({ occurrence: 1 }))?.index).toBe(0)
  })

  it('never produces a negative index', () => {
    expect(planSearch(finding({ occurrence: 0 }))?.index).toBe(0)
  })

  it('collapses a term wrapped across a line break', () => {
    // Extracted text wraps; Word searches within paragraphs. « Escrow\n
    // Amount » is unsearchable as written and findable once collapsed.
    const plan = planSearch(finding({ literal: 'Escrow\nAmount' }))
    expect(plan?.query).toBe('Escrow Amount')
  })

  it('says when the query had to be altered', () => {
    // The caller shows this. A collapsed query usually finds the right
    // text and sometimes will not, and the reader should know which kind
    // of answer they are getting.
    expect(planSearch(finding({ literal: 'Escrow\nAmount' }))?.approximate).toBe(
      true,
    )
    expect(planSearch(finding({ literal: 'Escrow Amount' }))?.approximate).toBe(
      false,
    )
  })

  it('refuses a query longer than Word will accept', () => {
    // Word's search rejects strings over 255 characters. Sending one
    // raises inside Word.run, where the failure is far from the cause.
    const long = 'a'.repeat(MAX_SEARCH_LENGTH + 1)
    expect(planSearch(finding({ literal: long }))).toBeNull()
  })

  it('accepts a query at exactly the limit', () => {
    const exact = 'a'.repeat(MAX_SEARCH_LENGTH)
    expect(planSearch(finding({ literal: exact }))?.query).toBe(exact)
  })

  it('refuses an empty or blank literal', () => {
    expect(planSearch(finding({ literal: '' }))).toBeNull()
    expect(planSearch(finding({ literal: '   \n ' }))).toBeNull()
  })
})

describe('case sensitivity', () => {
  it('matches case, so a miscased term is not confused with a correct one', () => {
    // The whole finding is that « closing date » is written where
    // « Closing Date » was defined. Searching case-insensitively would
    // select a correctly-cased occurrence and show the reader nothing
    // wrong.
    expect(matchCase(finding())).toBe(true)
  })
})

describe('which findings offer a fix', () => {
  it('offers the defined form for a wrong case', () => {
    expect(fixFor(finding({ defect: 'case_mismatch', term: 'Closing Date' }))).toBe(
      'Closing Date',
    )
  })

  it.each<Finding['defect']>([
    'undefined_term',
    'unused_definition',
    'multiple_definitions',
    'unordered_definitions',
    'broken_reference',
    'numbering_gap',
    'duplicate_number',
    'contradiction',
    'miscalculation',
    'inconsistent_style',
  ])('offers nothing for %s, which needs a drafting decision', (defect) => {
    expect(fixFor(finding({ defect }))).toBeNull()
  })

  it('offers nothing when the term is blank', () => {
    expect(fixFor(finding({ term: '  ' }))).toBeNull()
  })
})

describe('grouping for the panel', () => {
  it('returns the buckets in the order the panel shows them', () => {
    expect(bySeverity([]).map((b) => b.severity)).toEqual([
      'critical',
      'warning',
      'to_review',
      'ignored',
    ])
  })

  it('puts each finding in exactly one bucket', () => {
    const findings = [
      finding({ severity: 'critical', start: 1 }),
      finding({ severity: 'warning', start: 2 }),
      finding({ severity: 'warning', start: 3 }),
      finding({ severity: 'to_review', start: 4 }),
    ]
    const grouped = bySeverity(findings)
    expect(grouped.map((b) => b.findings.length)).toEqual([1, 2, 1, 0])
    expect(grouped.flatMap((b) => b.findings)).toHaveLength(findings.length)
  })

  it('moves an ignored finding to the fourth bucket, not out of the list', () => {
    const kept = finding({ severity: 'critical', term: 'Closing Date' })
    const dismissed = finding({ severity: 'critical', term: 'Purchaser' })
    const grouped = bySeverity(
      [kept, dismissed],
      new Set([findingKey(dismissed)]),
    )
    expect(grouped[0].findings).toEqual([kept])
    expect(grouped[3].findings).toEqual([dismissed])
  })
})

describe('what identifies a finding across two runs', () => {
  it('does not depend on where the finding sits in the document', () => {
    // Editing anything above a finding moves its offsets. If the key moved
    // with them, everything the reader had dismissed would come back.
    const before = finding({ start: 100, end: 112 })
    const after = finding({ start: 4_000, end: 4_012 })
    expect(findingKey(after)).toBe(findingKey(before))
  })

  it('separates two occurrences of the same defect on the same words', () => {
    expect(findingKey(finding({ occurrence: 1 }))).not.toBe(
      findingKey(finding({ occurrence: 2 })),
    )
  })

  it('separates two defects reported on the same term', () => {
    expect(findingKey(finding({ defect: 'case_mismatch' }))).not.toBe(
      findingKey(finding({ defect: 'undefined_term' })),
    )
  })
})

describe('labels', () => {
  it('uses their wording for each defect', () => {
    expect(defectLabel('undefined_term')).toBe('Undefined term')
    expect(defectLabel('unused_definition')).toBe('Unused definition')
    expect(defectLabel('multiple_definitions')).toBe('Multiple definitions')
    expect(defectLabel('unordered_definitions')).toBe('Unordered definitions')
    expect(defectLabel('broken_reference')).toBe('Broken cross-reference')
    expect(defectLabel('numbering_gap')).toBe('Numbering gap')
    expect(defectLabel('duplicate_number')).toBe('Duplicate number')
    expect(defectLabel('contradiction')).toBe('Contradiction')
    expect(defectLabel('miscalculation')).toBe('Miscalculation')
    expect(defectLabel('inconsistent_style')).toBe('Inconsistent style')
  })

  it('degrades readably for a defect it has never heard of', () => {
    // The server can ship a new check before the add-in knows its name.
    // An unreadable key in the panel is worse than a plain one. (This
    // test used to use numbering_gap as its example, which stopped being
    // unknown the day that check shipped.)
    expect(defectLabel('logical_inconsistency')).toBe('logical inconsistency')
  })
})
