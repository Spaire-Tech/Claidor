import { describe, expect, it } from 'vitest'

import { TRIGGERS, triggerByKey } from './triggers'

describe('lifecycle triggers', () => {
  it('covers the six behavioural moments with unique keys', () => {
    expect(TRIGGERS).toHaveLength(6)
    const keys = TRIGGERS.map((t) => t.key)
    expect(new Set(keys).size).toBe(6)
    expect(keys).toEqual([
      'enrolment',
      'firstLesson',
      'specificLesson',
      'halfway',
      'courseComplete',
      'inactive',
    ])
  })

  it('every trigger carries broadcast defaults', () => {
    for (const t of TRIGGERS) {
      expect(t.name).toBeTruthy()
      expect(t.subject).toBeTruthy()
      expect(t.preview).toBeTruthy()
      expect(t.audience).toBeTruthy()
      expect(t.count).toBeGreaterThan(0)
    }
  })

  it('triggerByKey resolves and falls back to enrolment', () => {
    expect(triggerByKey('halfway').name).toBe('Halfway')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(triggerByKey('nope' as any).key).toBe('enrolment')
  })
})
