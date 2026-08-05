// Brick 13 — the course-lifecycle triggers (the six behavioural moments from
// the user's design, decoded verbatim). The crumb dropdown switches between
// them; each carries the broadcast defaults (subject / preview / audience) the
// editor seeds. Backend trigger types map onto these keys in bricks 17–19.

export type TriggerKey =
  | 'enrolment'
  | 'firstLesson'
  | 'specificLesson'
  | 'halfway'
  | 'courseComplete'
  | 'inactive'

export interface Trigger {
  key: TriggerKey
  name: string
  desc: string
  subject: string
  preview: string
  audience: string
  count: number
}

export const TRIGGERS: Trigger[] = [
  {
    key: 'enrolment',
    name: 'Enrolment',
    desc: 'Sent the moment access is granted',
    subject: 'Welcome to Southern Cooking',
    preview: 'Your class is ready. Here is your first lesson.',
    audience: 'New enrollments',
    count: 1204,
  },
  {
    key: 'firstLesson',
    name: 'First lesson completed',
    desc: 'Fires on their first finish',
    subject: 'You finished your first lesson',
    preview: 'One down — here is what comes next.',
    audience: 'Finished lesson 1',
    count: 860,
  },
  {
    key: 'specificLesson',
    name: 'Specific lesson completed',
    desc: 'Fires when they clear a chosen lesson',
    subject: 'You hit the turning point',
    preview: 'The hardest lesson is behind you.',
    audience: 'Finished “Low & Slow Braises”',
    count: 612,
  },
  {
    key: 'halfway',
    name: 'Halfway',
    desc: 'Fires at 50% — the retention email',
    subject: 'You are halfway through Southern Cooking',
    preview: 'Don’t stop now — the best is still ahead.',
    audience: 'Reached 50%',
    count: 494,
  },
  {
    key: 'courseComplete',
    name: 'Course completed',
    desc: 'Fires when every lesson is done',
    subject: 'You finished Southern Cooking',
    preview: 'Look how far you have come.',
    audience: 'Completed the course',
    count: 237,
  },
  {
    key: 'inactive',
    name: 'Inactive for N days',
    desc: 'Win-back after a quiet stretch',
    subject: 'Your class is waiting',
    preview: 'Pick up right where you left off.',
    audience: 'Inactive 7+ days',
    count: 318,
  },
]

export const triggerByKey = (key: TriggerKey): Trigger =>
  TRIGGERS.find((t) => t.key === key) ?? TRIGGERS[0]
