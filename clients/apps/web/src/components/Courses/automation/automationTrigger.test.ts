import { describe, expect, it } from 'vitest'

import { resolveSequenceTrigger } from './automationTrigger'

const t = (
  type:
    | 'enrol'
    | 'lesson'
    | 'first'
    | 'half'
    | 'complete'
    | 'inactive',
  extra: { lesson?: string; days?: number } = {},
) => ({ type, lesson: extra.lesson ?? '', days: extra.days ?? 7 })

const lessons = [
  { id: 'l1', title: 'Centering the Clay' },
  { id: 'l2', title: 'Pulling Walls' },
]

describe('resolveSequenceTrigger', () => {
  it('maps each course-level lifecycle trigger to its backend trigger type', () => {
    expect(resolveSequenceTrigger(t('enrol')).trigger_type).toBe('on_purchase')
    expect(resolveSequenceTrigger(t('first')).trigger_type).toBe(
      'on_first_lesson_completed',
    )
    expect(resolveSequenceTrigger(t('half')).trigger_type).toBe(
      'on_course_progress_halfway',
    )
    expect(resolveSequenceTrigger(t('complete')).trigger_type).toBe(
      'on_course_completed',
    )
    expect(resolveSequenceTrigger(t('inactive')).trigger_type).toBe(
      'on_inactivity',
    )
  })

  it('carries the inactivity day count', () => {
    const wire = resolveSequenceTrigger(t('inactive', { days: 14 }))
    expect(wire.trigger_type).toBe('on_inactivity')
    expect(wire.inactive_days).toBe(14)
  })

  it('resolves a course-level "specific lesson" title to its id', () => {
    const wire = resolveSequenceTrigger(t('lesson', { lesson: 'Pulling Walls' }), {
      lessons,
    })
    expect(wire.trigger_type).toBe('on_lesson_completed')
    expect(wire.lesson_id).toBe('l2')
  })

  it('omits lesson_id when the chosen lesson title is unknown', () => {
    const wire = resolveSequenceTrigger(t('lesson', { lesson: 'Ghost lesson' }), {
      lessons,
    })
    expect(wire.trigger_type).toBe('on_lesson_completed')
    expect(wire.lesson_id).toBeUndefined()
  })

  it('a lesson-locked automation always fires on that lesson', () => {
    const wire = resolveSequenceTrigger(t('first'), { lessonId: 'lX', lessons })
    expect(wire.trigger_type).toBe('on_lesson_completed')
    expect(wire.lesson_id).toBe('lX')
  })

  it('does not leak inactive_days / lesson_id onto unrelated triggers', () => {
    const wire = resolveSequenceTrigger(t('enrol'))
    expect(wire.inactive_days).toBeUndefined()
    expect(wire.lesson_id).toBeUndefined()
  })
})
