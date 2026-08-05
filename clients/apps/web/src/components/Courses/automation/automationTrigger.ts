// Maps the automation builder's lifecycle trigger onto the backend entry
// trigger that actually enrols students. Pure + unit-tested so the wiring
// (the crux of "make the lifecycle emails fire") can't silently drift.

export type AutomationTriggerType =
  | 'enrol'
  | 'lesson'
  | 'first'
  | 'half'
  | 'complete'
  | 'inactive'

export interface SequenceTriggerWire {
  trigger_type: string
  lesson_id?: string
  inactive_days?: number
}

// Each course-level lifecycle moment has its own server EmailSequenceTriggerType.
const COURSE_TRIGGER_TYPE: Record<AutomationTriggerType, string> = {
  enrol: 'on_purchase',
  lesson: 'on_lesson_completed',
  first: 'on_first_lesson_completed',
  half: 'on_course_progress_halfway',
  complete: 'on_course_completed',
  inactive: 'on_inactivity',
}

export function resolveSequenceTrigger(
  trigger: { type: AutomationTriggerType; lesson: string; days: number },
  opts: {
    /** Set when the builder is locked to a single lesson (lesson editor). */
    lessonId?: string
    /** The course's lessons, to resolve a "specific lesson" title → id. */
    lessons?: { id: string; title: string }[]
  } = {},
): SequenceTriggerWire {
  // A lesson-scoped automation always fires on that one lesson.
  const trigger_type = opts.lessonId
    ? 'on_lesson_completed'
    : COURSE_TRIGGER_TYPE[trigger.type]

  // "Specific lesson" at course level needs the chosen lesson's id so the
  // server scopes the trigger to it (same as lesson-scoped automations).
  const lesson_id =
    opts.lessonId ??
    (trigger.type === 'lesson'
      ? opts.lessons?.find((l) => l.title === trigger.lesson)?.id
      : undefined)

  // Inactivity carries its configured day count.
  const inactive_days = trigger.type === 'inactive' ? trigger.days : undefined

  return {
    trigger_type,
    ...(lesson_id ? { lesson_id } : {}),
    ...(inactive_days != null ? { inactive_days } : {}),
  }
}
