// flowDoc — translate the automation builder's Step[] tree to/from the backend
// flow_doc node shape the flow engine actually executes.
//
// THE BUG THIS FIXES: the flow engine (server/polar/email_sequence/flow_engine.py)
// and the backend's own templates read every wait/branch/action/goal field out of
// a nested `value` object — e.g. wait `{mode:'duration', amount, unit}`, branch
// `{field, tag?}`, action `{action, tag?}`. The builder used to serialize a FLAT
// shape (`{dur}`, `{cond}`, `{what}`) with no `value`, so `node.get("value")` was
// empty and the engine fell back to defaults: zero-length waits, every branch
// taking the "No" path, no-op actions. These helpers emit the canonical
// `{ id, type, value }` shape so a flow runs exactly as authored.
//
// Email nodes intentionally stay flat: the send path materialises them into
// EmailSequenceStep rows from the flat `subject`/`content_html`/`content_json`
// keys (service.sync_flow_steps), and the tree walker resolves the row by the
// node's stable id — it never needs the email body inside `value`.
//
// deserialize tolerates BOTH shapes so sequences saved before this fix (flat
// `dur`/`cond`/`what`) still open and run.

import type { Step } from './AutomationSequenceBuilder'

export type FlowNode = {
  id: string
  type: string
  value?: Record<string, unknown>
  // branch arms live at the top level — the engine reads node["yes"]/["no"].
  yes?: FlowNode[]
  no?: FlowNode[]
  // email nodes stay flat.
  name?: string
  subject?: string
  preview?: string
  content_html?: string | null
  content_json?: Record<string, unknown> | null
}

let fallbackId = 1
const nid = () => 'n' + fallbackId++

/* ── wait: "1 day" ⇄ {mode:'duration', amount, unit} ── */
const UNIT_NORMALISE: Record<string, 'min' | 'hour' | 'day' | 'week'> = {
  min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  hr: 'hour', hour: 'hour', hours: 'hour',
  day: 'day', days: 'day',
  wk: 'week', week: 'week', weeks: 'week',
}
export function parseWait(dur: string): {
  mode: 'duration'
  amount: number
  unit: 'min' | 'hour' | 'day' | 'week'
} {
  const m = String(dur ?? '').trim().match(/^(\d+)\s*([a-zA-Z]+)/)
  const amount = m ? Math.max(0, parseInt(m[1], 10)) : 1
  const unit = (m && UNIT_NORMALISE[m[2].toLowerCase()]) || 'day'
  return { mode: 'duration', amount, unit }
}
export function formatWait(value: Record<string, unknown> | null | undefined): string {
  const amount = Math.max(0, Number(value?.amount) || 0)
  const unit = String(value?.unit || 'day')
  return `${amount} ${amount === 1 ? unit : unit + 's'}`
}

/* ── branch: cond string ⇄ {field, tag?} ── */
const extractQuoted = (s: string): string => {
  const m = String(s ?? '').match(/[“"']([^”"']+)[”"']/)
  return m ? m[1] : ''
}
export function branchToValue(cond: string): Record<string, unknown> {
  const c = String(cond ?? '')
  if (/^clicked/i.test(c)) return { field: 'clicked-prev' }
  if (/tag/i.test(c)) return { field: 'has-tag', tag: extractQuoted(c) || 'committed' }
  return { field: 'opened-prev' }
}
export function valueToBranchCond(value: Record<string, unknown>): string {
  const field = String(value?.field ?? '')
  if (field === 'clicked-prev') return 'Clicked the last email'
  if (field === 'has-tag') return `Has tag “${String(value?.tag ?? '')}”`
  return 'Opened the last email'
}

/* ── action: what string ⇄ {action, tag?} ── */
export function actionToValue(what: string): Record<string, unknown> {
  const w = String(what ?? '')
  // notify → Slack (the only notify channel the backend implements,
  // dispatch_slack_notify). Email-notify would need new infra; we don't claim it.
  if (/notify/i.test(w)) return { action: 'notify' }
  if (/^remove tag/i.test(w)) return { action: 'remove-tag', tag: extractQuoted(w) || 'at-risk' }
  // default + "Add tag …"
  return { action: 'add-tag', tag: extractQuoted(w) || 'engaged' }
}
export function valueToActionWhat(value: Record<string, unknown>): string {
  const a = String(value?.action ?? '')
  if (a === 'notify') return 'Notify my team on Slack'
  if (a === 'remove-tag') return `Remove tag “${String(value?.tag ?? '')}”`
  return `Add tag “${String(value?.tag ?? '')}”`
}

/* ── goal: what string ⇄ {event} ──
   The goal node is a terminal exit: when the flow reaches it the engine marks
   the enrolment complete (execute_goal_node). `event` is carried for
   attribution. */
const GOAL_EVENT: Record<string, string> = {
  'Completes the course': 'course_completed',
  'Finishes next lesson': 'lesson_completed',
}
const GOAL_LABEL: Record<string, string> = {
  course_completed: 'Completes the course',
  lesson_completed: 'Finishes next lesson',
}
export function goalToValue(what: string): Record<string, unknown> {
  return { event: GOAL_EVENT[String(what ?? '')] || 'course_completed' }
}
export function valueToGoalWhat(value: Record<string, unknown>): string {
  return GOAL_LABEL[String(value?.event ?? '')] || 'Completes the course'
}

/* ── serialize: Step[] → FlowNode[] (canonical, value-wrapped) ── */
export function serializeSteps(steps: Step[]): FlowNode[] {
  return (steps ?? []).map((st): FlowNode => {
    switch (st.type) {
      case 'email':
        return {
          id: st.id,
          type: 'email',
          name: st.name,
          subject: st.subject,
          preview: st.preview,
          content_html: st.content_html ?? null,
          content_json: st.content_json ?? null,
        }
      case 'wait':
        return { id: st.id, type: 'wait', value: parseWait(st.dur) }
      case 'branch':
        return {
          id: st.id,
          type: 'branch',
          value: branchToValue(st.cond),
          yes: serializeSteps(st.yes),
          no: serializeSteps(st.no),
        }
      case 'action':
        return { id: st.id, type: 'action', value: actionToValue(st.what) }
      case 'goal':
        return { id: st.id, type: 'goal', value: goalToValue(st.what) }
    }
  })
}

/* ── goal_event: the sequence's success event, lifted from its goal node ──
   Lives at trigger_config.goal_event = {type}. service.complete_for_goal closes
   any active enrolment the moment the subscriber hits this event (fired from
   course completion / lesson events), so the goal exits the sequence even
   mid-wait — not only when the cursor happens to reach the goal node. */
export function deriveGoalEvent(steps: Step[]): { type: string } | undefined {
  const find = (list: Step[]): Extract<Step, { type: 'goal' }> | undefined => {
    for (const s of list) {
      if (s.type === 'goal') return s
      if (s.type === 'branch') {
        const r = find(s.yes) || find(s.no)
        if (r) return r
      }
    }
    return undefined
  }
  const goal = find(steps ?? [])
  if (!goal) return undefined
  return { type: String(goalToValue(goal.what).event) }
}

/* ── deserialize: FlowNode[] (value-wrapped OR legacy flat) → Step[] ── */
type RawNode = Record<string, unknown> & {
  id?: string
  type?: string
  value?: Record<string, unknown>
  yes?: unknown
  no?: unknown
}
const asArray = (v: unknown): RawNode[] => (Array.isArray(v) ? (v as RawNode[]) : [])

export function deserializeSteps(nodes: unknown): Step[] {
  return asArray(nodes).map((n): Step => {
    const id = typeof n.id === 'string' && n.id ? n.id : nid()
    const value = n.value && typeof n.value === 'object' ? n.value : null
    switch (n.type) {
      case 'wait':
        return {
          id,
          type: 'wait',
          dur: value ? formatWait(value) : String(n.dur ?? '1 day'),
        }
      case 'branch':
        return {
          id,
          type: 'branch',
          cond: value
            ? valueToBranchCond(value)
            : String(n.cond ?? 'Opened the last email'),
          yes: deserializeSteps(n.yes),
          no: deserializeSteps(n.no),
        }
      case 'action':
        return {
          id,
          type: 'action',
          what: value
            ? valueToActionWhat(value)
            : String(n.what ?? 'Add tag “engaged”'),
        }
      case 'goal':
        return {
          id,
          type: 'goal',
          what: value
            ? valueToGoalWhat(value)
            : String(n.what ?? 'Completes the course'),
        }
      case 'email':
      default:
        return {
          id,
          type: 'email',
          name: String(n.name ?? n.subject ?? 'Untitled email'),
          subject: n.subject as string | undefined,
          preview: n.preview as string | undefined,
          content_html: (n.content_html as string | null | undefined) ?? null,
          content_json:
            (n.content_json as Record<string, unknown> | null | undefined) ?? null,
        }
    }
  })
}

/* ── send settings → backend trigger_config.send_window ──
   The engine defers sends to the window via service.apply_send_window, which
   reads `trigger_config.send_window = {enabled, days, start_hour, end_hour,
   respect_timezone}`. days: 0=Mon … 6=Sun. */
export function deriveSendWindow(send: {
  window: 'any' | 'day' | 'wk'
  tz: boolean
  cap: boolean
}): Record<string, unknown> {
  const base = {
    respect_timezone: !!send.tz,
    frequency_cap: send.cap ? 3 : 0,
  }
  if (send.window === 'any') return { enabled: false, ...base }
  return {
    enabled: true,
    days: send.window === 'wk' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3, 4, 5, 6],
    start_hour: 9,
    end_hour: 17,
    ...base,
  }
}
