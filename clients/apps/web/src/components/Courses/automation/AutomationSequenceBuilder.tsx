'use client'

// AutomationSequenceBuilder — a faithful port of the design (Automation
// Sequence.html / automation-sequence.js): a settings rail on the left and a
// live, branching sequence tree on the right.
//
// Persistence: the whole authored flow (trigger + send settings + the step
// tree) is saved to the real email-sequences backend as `flow_doc` (the
// server merges it into trigger_config.flow_doc). First save creates the
// sequence; later edits PATCH it. Course/lesson scope rides along when given.
//
// The step tree maps 1:1 to the backend flow_doc node shape
// ({ id, type, value }) — email | wait | branch | action | goal — which the
// flow engine already executes.

import {
  useCreateEmailSequence,
  useUpdateEmailSequence,
} from '@/hooks/queries/emailMarketing'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { schemas } from '@spaire/client'
import { resolveSequenceTrigger } from './automationTrigger'
import { deriveGoalEvent, deriveSendWindow, serializeSteps } from './flowDoc'
import { SequenceEmailModal } from './SequenceEmailModal'

/* ── step model ── */
type StepType = 'email' | 'wait' | 'branch' | 'action' | 'goal'
type Step =
  | {
      id: string
      type: 'email'
      name: string
      subject?: string
      preview?: string
      // The authored email body — content_json is the editable doc, the
      // rendered HTML is what the flow engine sends.
      content_json?: Record<string, unknown> | null
      content_html?: string | null
    }
  | { id: string; type: 'wait'; dur: string }
  | { id: string; type: 'branch'; cond: string; yes: Step[]; no: Step[] }
  | { id: string; type: 'action'; what: string }
  | { id: string; type: 'goal'; what: string }

type TriggerType =
  | 'enrol'
  | 'lesson'
  | 'first'
  | 'half'
  | 'complete'
  | 'inactive'
type Trigger = { type: TriggerType; lesson: string; days: number }
type Send = {
  window: 'any' | 'day' | 'wk'
  tz: boolean
  pause: boolean
  skipActive: boolean
  cap: boolean
}

const WAIT_OPTS = ['1 hour', '6 hours', '1 day', '2 days', '3 days', '1 week', '2 weeks']
const COND_OPTS = ['Opened the last email', 'Clicked the last email', 'Has tag “committed”']
// "Notify my team on Slack" maps to the backend's only notify channel
// (dispatch_slack_notify, via the org's Slack webhook). Email-notify isn't
// offered because there's no backend for it yet.
const ACTION_OPTS = ['Add tag “engaged”', 'Remove tag “at-risk”', 'Notify my team on Slack']
// "Replies to any email" is intentionally omitted: it needs inbound-email
// ingestion (a Resend inbound webhook + reply parsing) that doesn't exist, so
// offering it would be a lie. Both options below map to real course events.
const GOAL_OPTS = ['Completes the course', 'Finishes next lesson']

const STEP_META: Record<StepType, { k: string; ico: string; s: string }> = {
  email: { k: 'Email', ico: 'M3 5.5h18a0 0 0 0 1 0 0v13a0 0 0 0 1 0 0H3a0 0 0 0 1 0 0v-13a0 0 0 0 1 0 0z M4.5 8l7.5 5.5L19.5 8', s: 'Opens in your email editor' },
  wait: { k: 'Wait', ico: 'M12 12a8.5 8.5 0 1 0 0 0 M12 7.5V12l3.2 2', s: 'Pause before the next step' },
  branch: { k: 'Branch', ico: 'M12 21v-8 M12 13c0-3.5-5.5-3-5.5-6.5V4 M12 13c0-3.5 5.5-3 5.5-6.5V4 M4.2 6.2 6.5 3.8l2.3 2.4 M15.2 6.2l2.3-2.4 2.3 2.4', s: 'Split on a condition' },
  action: { k: 'Action', ico: 'M3.5 12.4 11.6 4.3a1.8 1.8 0 0 1 1.3-.5h5.8a1 1 0 0 1 1 1v5.8a1.8 1.8 0 0 1-.5 1.3l-8.1 8.1a1.8 1.8 0 0 1-2.6 0l-5-5a1.8 1.8 0 0 1 0-2.6z M16 8a1 1 0 1 0 0 0', s: 'Tag or notify' },
  goal: { k: 'Goal', ico: 'M5.5 21.5v-17 M5.5 4.5c1.8-1 3.6-1 5.4 0s3.6 1 5.4 0v8.5c-1.8 1-3.6 1-5.4 0s-3.6-1-5.4 0', s: 'Exit when reached' },
}

const IC = {
  trigger: 'M13.2 2.8 5.5 13h5l-1.7 8.2L16.5 11h-5l1.7-8.2z',
  exit: 'm5 12.5 4.5 4.5L19 6.5',
  edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  x: 'M5 5l14 14M19 5L5 19',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M5 5l1.5 1.5M17.5 17.5 19 19M2 12h2M20 12h2M5 19l1.5-1.5M17.5 6.5 19 5',
}

let uidCounter = Date.now() % 100000
const nid = () => 's' + ++uidCounter

function makeStep(type: StepType): Step {
  if (type === 'email') return { id: nid(), type, name: 'Untitled email' }
  if (type === 'wait') return { id: nid(), type, dur: '1 day' }
  if (type === 'branch') return { id: nid(), type, cond: COND_OPTS[0], yes: [], no: [] }
  if (type === 'action') return { id: nid(), type, what: ACTION_OPTS[0] }
  return { id: nid(), type, what: GOAL_OPTS[0] }
}

function Svg({ d, s = 24, w = 1.9, fill = false }: { d: string; s?: number; w?: number; fill?: boolean }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => (
        <path key={i} d={(i ? 'M' : '') + seg} />
      ))}
    </svg>
  )
}

// Path: [] = root chain, ['yes'|'no', branchId] = a branch leg.
type Path = [] | ['yes' | 'no', string]

function findBranch(steps: Step[], bid: string): Extract<Step, { type: 'branch' }> | null {
  for (const st of steps) {
    if (st.id === bid && st.type === 'branch') return st
    if (st.type === 'branch') {
      const r = findBranch(st.yes, bid) || findBranch(st.no, bid)
      if (r) return r
    }
  }
  return null
}
function findStep(steps: Step[], id: string): Step | null {
  for (const st of steps) {
    if (st.id === id) return st
    if (st.type === 'branch') {
      const r = findStep(st.yes, id) || findStep(st.no, id)
      if (r) return r
    }
  }
  return null
}
function countSteps(steps: Step[]): number {
  let n = 0
  for (const st of steps) {
    n++
    if (st.type === 'branch') n += countSteps(st.yes) + countSteps(st.no)
  }
  return n
}

export function AutomationSequenceBuilder({
  organization,
  organizationId,
  courseId,
  lessonId,
  sequenceId: initialSequenceId,
  lessons,
  initial,
  onBack,
}: {
  organization?: schemas['Organization']
  organizationId?: string
  courseId?: string
  lessonId?: string
  sequenceId?: string
  /** The course's real lessons — drive the "Lesson completed" picker. */
  lessons?: { id: string; title: string }[]
  initial?: {
    name?: string
    desc?: string
    trigger?: Partial<Trigger>
    send?: Partial<Send>
    steps?: Step[]
    live?: boolean
  }
  onBack?: () => void
}) {
  const createSeq = useCreateEmailSequence(organizationId ?? '')
  const updateSeq = useUpdateEmailSequence()

  // The course's real lessons feed the "Lesson completed" picker. In a real
  // course with no lessons yet, show an honest placeholder rather than inventing
  // fake lessons that don't exist (which the user could pick, scoping the
  // trigger to nothing). The sample names are kept ONLY for the standalone/embed
  // demo where there's no course attached.
  const lessonOptions = useMemo(() => {
    if (lessons && lessons.length > 0) return lessons.map((l) => l.title)
    if (courseId) return ['Add a lesson to your course first']
    return [
      'Lesson 1 · Arrival',
      'Lesson 2 · The Morning Block',
      'Lesson 3 · Inputs',
      'Lesson 4 · The Reset',
      'Lesson 5 · Operating Cadence',
      'Lesson 6 · The Review',
    ]
  }, [lessons, courseId])

  // When the builder is opened for one lesson (the "When a student finishes
  // this lesson" card in the lesson editor), the trigger is fixed: it can only
  // fire when a student completes THAT lesson. We lock the trigger to it and
  // hide the generic picker.
  const lessonMode = !!lessonId
  const lessonTitle = useMemo(
    () =>
      (lessonId && lessons?.find((l) => l.id === lessonId)?.title) ||
      initial?.trigger?.lesson ||
      'this lesson',
    [lessonId, lessons, initial?.trigger?.lesson],
  )

  const [name, setName] = useState(initial?.name ?? 'Untitled sequence')
  const [desc, setDesc] = useState(initial?.desc ?? '')
  const [trigger, setTrigger] = useState<Trigger>({
    type: lessonId ? 'lesson' : 'enrol',
    lesson: lessonOptions[0],
    days: 7,
    ...initial?.trigger,
    // In lesson mode the type is always 'lesson' regardless of any stored value.
    ...(lessonId ? { type: 'lesson' as const } : {}),
  })
  // Keep the locked lesson trigger's label in sync with the real lesson title
  // once the course loads. Direct setState (not commit) so it never counts as a
  // user edit / spawns an autosave.
  useEffect(() => {
    if (!lessonMode) return
    setTrigger((t) =>
      t.type === 'lesson' && t.lesson === lessonTitle
        ? t
        : { ...t, type: 'lesson', lesson: lessonTitle },
    )
  }, [lessonMode, lessonTitle])
  const [send, setSend] = useState<Send>({
    window: 'any',
    tz: true,
    pause: true,
    skipActive: false,
    cap: true,
    ...initial?.send,
  })
  const [steps, setSteps] = useState<Step[]>(initial?.steps ?? [])
  const [live, setLive] = useState(Boolean(initial?.live))

  // The course builder (this automation editor included) is always dark — no
  // light option.
  const dark = true
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved'>(
    'saved',
  )
  // A NEW automation is not written to the backend until the creator
  // explicitly saves (Save as draft / Turn on) or confirms "save as draft"
  // on the way out — so typing no longer spawns a phantom draft in the list.
  // `dirty` tracks unsaved local edits while the sequence is still uncreated.
  const [dirty, setDirty] = useState(false)
  // "Leave with unsaved changes" prompt (uncreated sequence + edits).
  const [leavePrompt, setLeavePrompt] = useState(false)
  // The last background write failed — surfaced inside the email editor's
  // status chip (its own toast renders behind the full-screen editor portal).
  const [lastSaveFailed, setLastSaveFailed] = useState(false)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [menu, setMenu] = useState<{
    path: Path
    index: number
    x: number
    y: number
  } | null>(null)
  // The email node currently open in the real email editor.
  const [emailEditing, setEmailEditing] = useState<string | null>(null)

  const seqIdRef = useRef<string | null>(initialSequenceId ?? null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((m: string) => {
    setToastMsg(m)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastMsg(null), 2400)
  }, [])

  // ── persistence: save to the email-sequences backend ──
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  type SavePayload = {
    name: string
    desc: string
    trigger: Trigger
    send: Send
    steps: Step[]
    live: boolean
  }

  // The actual write. Creates the sequence on first save, updates it after.
  const doSave = useCallback(
    async (next: SavePayload): Promise<boolean> => {
      const flow_doc = {
        version: 1,
        // the design's richer trigger + send settings ride in flow_doc so
        // the full authored intent persists alongside the executable steps
        course_trigger: next.trigger,
        send_settings: next.send,
        // The flow engine reads the per-send frequency cap from flow_doc.send;
        // gate it on the creator's "Respect frequency cap" toggle.
        send: { frequencyCap: next.send.cap ? 3 : 0 },
        // Serialize the step tree into the canonical { id, type, value } node
        // shape the flow engine executes — NOT the builder's in-memory shape.
        steps: serializeSteps(next.steps),
      }

      // Map the builder's lifecycle trigger onto the backend entry trigger that
      // actually enrols students (see automationTrigger.ts).
      const wire = resolveSequenceTrigger(next.trigger, { lessonId, lessons })
      const trigger_type = wire.trigger_type
      const resolved_lesson_id = wire.lesson_id
      // The goal node's success event, surfaced to trigger_config so the engine
      // can exit the sequence the moment the subscriber reaches it.
      const goal_event = deriveGoalEvent(next.steps)
      const trigger_config_extra = {
        course_trigger: next.trigger,
        send_settings: next.send,
        // Send window / timezone / frequency cap, in the shape the engine reads
        // (service.apply_send_window + check_frequency_cap).
        send_window: deriveSendWindow(next.send),
        ...(goal_event ? { goal_event } : {}),
        ...(wire.inactive_days != null
          ? { inactive_days: wire.inactive_days }
          : {}),
      }

      try {
        if (!seqIdRef.current) {
          const created = await createSeq.mutateAsync({
            name: next.name.trim() || 'Untitled sequence',
            description: next.desc,
            trigger_type,
            trigger_config: trigger_config_extra,
            flow_doc,
            course_id: courseId,
            lesson_id: resolved_lesson_id,
          })
          seqIdRef.current = created?.id ?? null
          // The backend always creates as a draft. If the creator turned it
          // on in the same action, flip it live now that we have an id.
          if (next.live && seqIdRef.current) {
            await updateSeq.mutateAsync({
              sequenceId: seqIdRef.current,
              status: 'active',
            })
          }
        } else {
          await updateSeq.mutateAsync({
            sequenceId: seqIdRef.current,
            name: next.name.trim() || 'Untitled sequence',
            description: next.desc,
            // Re-assert the lifecycle trigger (+ lesson scope) so changing the
            // trigger after creation persists, and older sequences self-heal.
            trigger_type,
            lesson_id: resolved_lesson_id,
            trigger_config: {
              ...trigger_config_extra,
              flow_doc,
            },
            status: next.live ? 'active' : 'draft',
          })
        }
        setDirty(false)
        setSaveState('saved')
        setLastSaveFailed(false)
        return true
      } catch {
        setSaveState('unsaved')
        setLastSaveFailed(true)
        showToast('Could not save')
        return false
      }
    },
    [courseId, lessonId, lessons, createSeq, updateSeq, showToast],
  )

  // Debounced autosave — but ONLY for sequences that already exist. A new
  // (uncreated) automation is never auto-created from typing; it just marks
  // itself dirty and waits for an explicit save / the leave prompt.
  const persist = useCallback(
    (next: SavePayload) => {
      if (!organizationId) return // embed/standalone: local only
      if (!seqIdRef.current) {
        setDirty(true)
        setSaveState('unsaved')
        return
      }
      setSaveState('saving')
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void doSave(next), 700)
    },
    [organizationId, doSave],
  )

  // Explicit, immediate save (Save as draft / Turn on / leave prompt). Cancels
  // any pending debounce and writes the current state right away.
  const saveNow = useCallback(
    async (over?: { live?: boolean }): Promise<boolean> => {
      if (!organizationId) return false
      if (saveTimer.current) clearTimeout(saveTimer.current)
      const liveNext = over?.live ?? live
      if (over?.live !== undefined) setLive(over.live)
      setSaveState('saving')
      return doSave({ name, desc, trigger, send, steps, live: liveNext })
    },
    [organizationId, name, desc, trigger, send, steps, live, doSave],
  )

  // Single funnel: update state + queue a save.
  const commit = useCallback(
    (
      patch: Partial<{
        name: string
        desc: string
        trigger: Trigger
        send: Send
        steps: Step[]
        live: boolean
      }>,
    ) => {
      const next = {
        name: patch.name ?? name,
        desc: patch.desc ?? desc,
        trigger: patch.trigger ?? trigger,
        send: patch.send ?? send,
        steps: patch.steps ?? steps,
        live: patch.live ?? live,
      }
      if (patch.name !== undefined) setName(patch.name)
      if (patch.desc !== undefined) setDesc(patch.desc)
      if (patch.trigger) setTrigger(patch.trigger)
      if (patch.send) setSend(patch.send)
      if (patch.steps) setSteps(patch.steps)
      if (patch.live !== undefined) setLive(patch.live)
      persist(next)
    },
    [name, desc, trigger, send, steps, live, persist],
  )

  // ── tree mutation helpers (immutable) ──
  const getChain = (root: Step[], path: Path): Step[] => {
    if (path.length === 0) return root
    const [leg, bid] = path
    const b = findBranch(root, bid)
    return b ? b[leg] : root
  }
  const mutateChain = (path: Path, fn: (chain: Step[]) => Step[]): Step[] => {
    const clone = structuredClone(steps) as Step[]
    const chain = getChain(clone, path)
    const newChain = fn([...chain])
    if (path.length === 0) return newChain
    const [leg, bid] = path
    const b = findBranch(clone, bid)
    if (b) b[leg] = newChain
    return clone
  }
  const insertStep = (path: Path, index: number, type: StepType) => {
    commit({
      steps: mutateChain(path, (c) => {
        c.splice(index, 0, makeStep(type))
        return c
      }),
    })
  }
  const removeStep = (path: Path, index: number) => {
    commit({
      steps: mutateChain(path, (c) => {
        c.splice(index, 1)
        return c
      }),
    })
    showToast('Step removed')
  }
  const moveStep = (path: Path, index: number, dir: -1 | 1) => {
    commit({
      steps: mutateChain(path, (c) => {
        const [st] = c.splice(index, 1)
        c.splice(index + dir, 0, st)
        return c
      }),
    })
  }
  const patchStep = (id: string, patch: Partial<Step>) => {
    const apply = (list: Step[]): Step[] =>
      list.map((st) => {
        if (st.id === id) return { ...st, ...patch } as Step
        if (st.type === 'branch')
          return { ...st, yes: apply(st.yes), no: apply(st.no) }
        return st
      })
    commit({ steps: apply(steps) })
  }

  const triggerLabel = useMemo(() => {
    const t = trigger
    if (t.type === 'enrol') return 'Student enrols'
    if (t.type === 'lesson') return t.lesson
    if (t.type === 'first') return 'First lesson completed'
    if (t.type === 'half') return 'Halfway through the course'
    if (t.type === 'complete') return 'Course completed'
    return `Inactive for ${t.days} days`
  }, [trigger])

  const stepCount = countSteps(steps)

  // close the add-step menu on outside click / Esc
  useEffect(() => {
    if (!menu) return
    const onDoc = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.asq .menu, .asq .conn-add'))
        setMenu(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('click', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const openMenu = (e: React.MouseEvent, path: Path, index: number) => {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const mw = 244
    let x = r.left + r.width / 2 - mw / 2
    x = Math.max(12, Math.min(window.innerWidth - mw - 12, x))
    let y = r.bottom + 8
    if (y + 300 > window.innerHeight - 12) y = Math.max(12, r.top - 308)
    setMenu({ path, index, x, y })
  }

  // True when at least one email step actually has authored content. A step
  // with an empty body would ship a blank email, so it can't make a sequence
  // "ready to turn on".
  const hasSendableEmail = (list: Step[]): boolean =>
    list.some((st) =>
      st.type === 'email'
        ? !!(st.content_html && st.content_html.trim())
        : st.type === 'branch'
          ? hasSendableEmail(st.yes) || hasSendableEmail(st.no)
          : false,
    )

  // Save edits WITHOUT changing the on/off state. This is the action that used
  // to be missing for live sequences — the only button was "Save as draft",
  // which silently turned a running automation OFF.
  const saveChanges = () => {
    void saveNow({})
    showToast(live ? 'Changes saved' : 'Saved as draft')
  }

  const turnOff = () => {
    void saveNow({ live: false })
    showToast('Sequence turned off')
  }

  const turnOn = () => {
    if (!hasSendableEmail(steps)) {
      showToast('Add an email with content first')
      return
    }
    void saveNow({ live: true })
    showToast('Sequence is on')
  }

  // Browser-close guard: the in-app Back path prompts below, but a refresh,
  // tab close, or crash used to silently destroy an unsaved (or mid-save)
  // automation — including a fully authored email — while the editor said
  // "Saved". Warn whenever anything hasn't reached the server yet.
  useEffect(() => {
    const unsaved = dirty || saveState !== 'saved'
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saveState])

  // Back guard: a NEW automation with unsaved edits asks whether to keep it
  // as a draft before leaving, instead of having silently auto-created one.
  // Already-saved sequences autosave, so they just leave.
  const handleBack = useCallback(() => {
    if (dirty && !seqIdRef.current) {
      setLeavePrompt(true)
      return
    }
    onBack?.()
  }, [dirty, onBack])

  const Connector = ({ path, index }: { path: Path; index: number }) => (
    <div className="conn">
      <div className="line" />
      <button
        className="conn-add"
        type="button"
        aria-label="Add step here"
        onClick={(e) => openMenu(e, path, index)}
      >
        <Svg d={IC.plus} s={12} w={2.4} />
      </button>
      <div className="line" />
    </div>
  )

  const NodeTools = ({
    path,
    index,
    chainLen,
  }: {
    path: Path
    index: number
    chainLen: number
  }) => (
    <div className="node-tools">
      {index > 0 && (
        <button className="nt-btn" type="button" aria-label="Move up" onClick={() => moveStep(path, index, -1)}>
          <Svg d={IC.up} s={12} w={2.2} />
        </button>
      )}
      {index < chainLen - 1 && (
        <button className="nt-btn" type="button" aria-label="Move down" onClick={() => moveStep(path, index, 1)}>
          <Svg d={IC.down} s={12} w={2.2} />
        </button>
      )}
      <button className="nt-btn del" type="button" aria-label="Remove step" onClick={() => removeStep(path, index)}>
        <Svg d={IC.x} s={12} w={2.2} />
      </button>
    </div>
  )

  const MiniSelect = ({
    value,
    options,
    onChange,
  }: {
    value: string
    options: string[]
    onChange: (v: string) => void
  }) => (
    <select
      className="mini-select"
      value={value}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )

  const renderNode = (st: Step, path: Path, index: number, chainLen: number) => {
    const meta = STEP_META[st.type]
    return (
      <div className={`node is-${st.type}`} key={st.id}>
        <div className="node-ico">
          <Svg d={meta.ico} s={17} />
        </div>
        <div className="node-main">
          <div className="node-k">{meta.k}</div>
          {st.type === 'email' && (
            <>
              <div className="node-t">
                <input
                  value={st.name}
                  spellCheck={false}
                  onChange={(e) => patchStep(st.id, { name: e.target.value } as Partial<Step>)}
                />
              </div>
              <button
                className="node-btn"
                type="button"
                onClick={() => {
                  if (!organizationId) {
                    showToast('Save the automation first')
                    return
                  }
                  setEmailEditing(st.id)
                }}
              >
                <Svg d={IC.edit} s={13} w={2} />{' '}
                {st.content_html ? 'Edit email' : 'Write email'}
              </button>
            </>
          )}
          {st.type === 'wait' && (
            <MiniSelect value={st.dur} options={WAIT_OPTS} onChange={(v) => patchStep(st.id, { dur: v } as Partial<Step>)} />
          )}
          {st.type === 'branch' && (
            <MiniSelect value={st.cond} options={COND_OPTS} onChange={(v) => patchStep(st.id, { cond: v } as Partial<Step>)} />
          )}
          {st.type === 'action' && (
            <MiniSelect value={st.what} options={ACTION_OPTS} onChange={(v) => patchStep(st.id, { what: v } as Partial<Step>)} />
          )}
          {st.type === 'goal' && (
            <>
              <MiniSelect value={st.what} options={GOAL_OPTS} onChange={(v) => patchStep(st.id, { what: v } as Partial<Step>)} />
              <div className="node-sub">Subscriber exits the sequence when reached.</div>
            </>
          )}
        </div>
        <NodeTools path={path} index={index} chainLen={chainLen} />
      </div>
    )
  }

  const renderChain = (path: Path, inLeg: boolean): React.ReactNode => {
    const chain = getChain(steps, path)
    return (
      <>
        {chain.map((st, i) => (
          <div key={st.id} style={{ display: 'contents' }}>
            <Connector path={path} index={i} />
            {renderNode(st, path, i, chain.length)}
            {st.type === 'branch' && (
              <>
                <div className="branch-split">
                  <div className="stem" />
                  <div className="bar" />
                  <div className="armL" />
                  <div className="armR" />
                </div>
                <div className="branch-wrap">
                  {(['yes', 'no'] as const).map((leg) => (
                    <div className="branch-leg" key={leg}>
                      <span className={`leg-label ${leg}`}>
                        {leg === 'yes' ? 'Yes' : 'No'}
                      </span>
                      {renderChain([leg, st.id], true)}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        <Connector path={path} index={chain.length} />
        {inLeg && <div className="exit-pill">continues below</div>}
      </>
    )
  }

  return (
    <div className={`asq${dark ? ' dark' : ''}`}>
      {/* ════════ TOP BAR ════════ */}
      <header className="topbar">
        <button className="tb-back" type="button" onClick={handleBack}>
          <Svg d={IC.back} s={16} w={2.4} /> Automations
        </button>
        <div className="tb-crumb">
          {courseId && <div className="tb-course">Course automation</div>}
          <div className="tb-name">{name.trim() || 'Untitled sequence'}</div>
        </div>
        <span className="tb-status">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'unsaved'
              ? 'Unsaved'
              : 'Saved'}
        </span>
        <div className="tb-actions">
          {/* Context-aware actions. When live: Save changes (keeps it running)
              + an explicit Turn off. When draft: Save draft + Turn on. The old
              UI only had "Save as draft" (which silently turned a live sequence
              off) and a dimmed "On" pill that read as disabled. */}
          {live ? (
            <>
              <button className="btn-glass" type="button" onClick={turnOff}>
                <Svg d={IC.exit} s={14} w={2.4} /> Turn off
              </button>
              <button className="btn-main" type="button" onClick={saveChanges}>
                Save changes
              </button>
            </>
          ) : (
            <>
              <button className="btn-glass" type="button" onClick={saveChanges}>
                Save draft
              </button>
              <button className="btn-main" type="button" onClick={turnOn}>
                Turn on
              </button>
            </>
          )}
        </div>
      </header>

      <div className="shell">
        {/* ════════ LEFT: SETTINGS ════════ */}
        <aside className="side">
          {/* Basics */}
          <section className="sec">
            <div className="sec-head">
              <span className="sec-h">Basics</span>
            </div>
            <p className="sec-sub">
              Name and description. These help you find and organise sequences
              later.
            </p>
            <div className="card">
              <div className="field">
                <div className="f-label">Internal name</div>
                <input
                  className="f-input"
                  value={name}
                  spellCheck={false}
                  onChange={(e) => commit({ name: e.target.value })}
                />
                <div className="f-help">Subscribers will never see this.</div>
              </div>
              <div className="field">
                <div className="f-label">
                  Description <span className="opt">Optional</span>
                </div>
                <textarea
                  className="f-area"
                  rows={2}
                  spellCheck={false}
                  placeholder="What is this sequence for?"
                  value={desc}
                  onChange={(e) => commit({ desc: e.target.value })}
                />
              </div>
            </div>
          </section>

          {/* Trigger — only the course-level builder needs a picker. A lesson
              automation's trigger is fixed ("completes this lesson"), already
              shown as the trigger node in the tree, so the left panel hides it. */}
          {!lessonMode && (
            <section className="sec">
              <div className="sec-head">
                <span className="sec-h">Trigger</span>
              </div>
              <p className="sec-sub">
                The moment that starts this sequence for a student.
              </p>
              <div className="card">
                {(
                  [
                    ['enrol', 'Student enrols', 'Send the moment they get access to the course.'],
                    ['lesson', 'Lesson completed', 'Pick a specific lesson — fires when a student finishes it.'],
                    ['first', 'First lesson completed', 'Celebrate momentum the first time they finish any lesson.'],
                    ['half', 'Halfway through', 'Fires when the student crosses 50% of the course.'],
                    ['complete', 'Course completed', 'Wrap up — fires when every lesson is done.'],
                    ['inactive', 'Inactive for N days', 'Pick up where they left off after a quiet stretch.'],
                  ] as [TriggerType, string, string][]
                ).map(([type, t, s]) => (
                  <button
                    key={type}
                    className={`radio-row${trigger.type === type ? ' on' : ''}`}
                    type="button"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('select, input')) return
                      commit({ trigger: { ...trigger, type } })
                    }}
                  >
                    <span className="rr-dot" />
                    <span className="rr-main">
                      <span className="rr-t">{t}</span>
                      <span className="rr-s">{s}</span>
                      {type === 'lesson' && (
                        <span className="rr-extra">
                          <select
                            className="mini-select"
                            value={trigger.lesson}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => commit({ trigger: { ...trigger, lesson: e.target.value } })}
                          >
                            {lessonOptions.map((l) => (
                              <option key={l}>{l}</option>
                            ))}
                          </select>
                        </span>
                      )}
                      {type === 'inactive' && (
                        <span className="rr-extra">
                          <span className="lbl">Days quiet</span>
                          <input
                            className="mini-num"
                            type="number"
                            min={1}
                            max={90}
                            value={trigger.days}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              commit({ trigger: { ...trigger, days: Math.max(1, parseInt(e.target.value || '1', 10)) } })
                            }
                          />
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Send settings */}
          <section className="sec">
            <div className="sec-head">
              <span className="sec-h">Send settings</span>
            </div>
            <p className="sec-sub">
              When and how often subscribers receive the emails.
            </p>
            <div className="card">
              <div className="field">
                <div className="f-label">Send window</div>
                <div className="seg">
                  {(
                    [
                      ['any', 'Any time'],
                      ['day', 'Every day · 9–5'],
                      ['wk', 'Mon–Fri · 9–5'],
                    ] as [Send['window'], string][]
                  ).map(([w, label]) => (
                    <button
                      key={w}
                      type="button"
                      className={send.window === w ? 'on' : ''}
                      onClick={() => {
                        commit({ send: { ...send, window: w } })
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Only toggles the backend actually honours are shown. "Pause on
                  unsubscribe" was removed because unsubscribing already stops
                  every in-flight email unconditionally (it's not optional), and
                  "Skip if in another active sequence" had no backend at all —
                  showing either as a switch was a lie. Timezone + frequency cap
                  are wired through trigger_config.send_window / flow_doc.send. */}
              {(
                [
                  ['tz', 'Send in subscriber’s timezone', 'If we know it. Falls back to UTC otherwise.'],
                  ['cap', 'Respect frequency cap (3 / week)', 'Won’t send if it would exceed the workspace-wide cap.'],
                ] as [keyof Send, string, string][]
              ).map(([k, t, s]) => (
                <div className="q-row" key={k}>
                  <div className="q-main">
                    <div className="q-t">{t}</div>
                    <div className="q-s">{s}</div>
                  </div>
                  <button
                    className={`sw${send[k] ? ' on' : ''}`}
                    type="button"
                    aria-label={t}
                    onClick={() => {
                      commit({ send: { ...send, [k]: !send[k] } })
                    }}
                  />
                </div>
              ))}
            </div>
          </section>
        </aside>

        {/* ════════ RIGHT: THE TREE ════════ */}
        <main className="canvas">
          <div className="canvas-head">
            <span className="ch-t">Sequence steps</span>
            <span className="ch-s">
              {stepCount} {stepCount === 1 ? 'step' : 'steps'}
            </span>
          </div>
          <div className="tree">
            {/* trigger node */}
            <div className="node is-trigger">
              <div className="node-ico">
                <Svg d={IC.trigger} s={17} />
              </div>
              <div className="node-main">
                <div className="node-k">Trigger</div>
                <div className="node-t">
                  {lessonMode ? `Completes “${lessonTitle}”` : triggerLabel}
                </div>
                <div className="node-sub">
                  {lessonMode
                    ? 'Starts when a student marks this lesson complete.'
                    : 'Enrols every buyer on purchase, then waits for this moment.'}
                </div>
              </div>
            </div>

            {steps.length === 0 ? (
              <Connector path={[]} index={0} />
            ) : (
              renderChain([], false)
            )}

            <div className="conn">
              <div className="line" />
              <div className="line" />
            </div>
            <div className="exit-pill">
              <Svg d={IC.exit} s={12} w={2.4} /> Exit sequence
            </div>
          </div>
        </main>
      </div>

      {/* add-step menu */}
      {menu && (
        <div className="menu show" role="menu" style={{ left: menu.x, top: menu.y }}>
          {(['email', 'wait', 'branch', 'action', 'goal'] as StepType[]).map((t) => {
            const m = STEP_META[t]
            const dis = t === 'branch' && menu.path.length > 0
            return (
              <button
                key={t}
                type="button"
                disabled={dis}
                onClick={() => {
                  insertStep(menu.path, menu.index, t)
                  setMenu(null)
                }}
              >
                <span className="m-ico">
                  <Svg d={m.ico} s={15} />
                </span>
                <span>
                  <span className="m-t">{m.k}</span>
                  <div className="m-s">{dis ? 'Not inside a branch' : m.s}</div>
                </span>
              </button>
            )
          })}
        </div>
      )}

      {toastMsg && (
        <div className="toast show">
          <span className="tk">
            <Svg d={IC.exit} s={15} w={2.6} />
          </span>
          {toastMsg}
        </div>
      )}

      {leavePrompt && (
        <div
          className="leave-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Unsaved automation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setLeavePrompt(false)
          }}
        >
          <div className="leave-card">
            <div className="leave-title">Save this automation?</div>
            <div className="leave-body">
              You haven’t saved this automation yet. Keep it as a draft so you
              can finish it later, or discard it.
            </div>
            <div className="leave-actions">
              <button
                className="leave-discard"
                type="button"
                onClick={() => {
                  setLeavePrompt(false)
                  onBack?.()
                }}
              >
                Discard
              </button>
              <div className="leave-right">
                <button
                  className="leave-cancel"
                  type="button"
                  onClick={() => setLeavePrompt(false)}
                >
                  Cancel
                </button>
                <button
                  className="leave-save"
                  type="button"
                  onClick={async () => {
                    const ok = await saveNow({ live: false })
                    setLeavePrompt(false)
                    if (ok) onBack?.()
                  }}
                >
                  Save as draft
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {emailEditing &&
        organization &&
        (() => {
          const st = findStep(steps, emailEditing)
          if (!st || st.type !== 'email') return null
          return (
            <SequenceEmailModal
              organization={organization}
              courseId={courseId}
              moment={trigger.type}
              triggerLesson={trigger.type === 'lesson' ? trigger.lesson : undefined}
              sequenceName={name}
              initialSubject={st.subject}
              initialContentJson={st.content_json}
              saveFailed={lastSaveFailed}
              onClose={() => setEmailEditing(null)}
              onAutosave={(v) => {
                patchStep(st.id, {
                  subject: v.subject,
                  content_json: v.content_json,
                  content_html: v.content_html,
                  // keep the node title in sync with the subject
                  name: v.subject || st.name,
                } as Partial<Step>)
                // A new, never-saved automation can't persist steps — tell the
                // editor so its status doesn't claim "Saved".
                return !organizationId || Boolean(seqIdRef.current)
              }}
              onSave={(v) => {
                patchStep(st.id, {
                  subject: v.subject,
                  content_json: v.content_json,
                  content_html: v.content_html,
                  // keep the node title in sync with the subject
                  name: v.subject || st.name,
                } as Partial<Step>)
                const persisted = !organizationId || Boolean(seqIdRef.current)
                showToast(
                  persisted
                    ? 'Email saved'
                    : 'Email staged — save the automation to keep it',
                )
                return persisted
              }}
            />
          )
        })()}

      <AutomationStyles />
    </div>
  )
}

export default AutomationSequenceBuilder

export type { Step }

// styled-jsx port of Automation Sequence.html, scoped under `.asq`.
function AutomationStyles() {
  return (
    <style jsx global>{`
      .asq {
        --bg: #f5f5f7;
        --canvas: #f1f1f6;
        --card: #ffffff;
        --text: #1d1d1f;
        --text-2: #86868b;
        --blue: #0066cc;
        --hair: rgba(0, 0, 0, 0.07);
        --ans: #4a4a4f;
        --sf: -apple-system, BlinkMacSystemFont, 'SF Pro Display',
          'SF Pro Text', system-ui, sans-serif;
        --po: 'Poppins', var(--font-poppins), -apple-system, system-ui,
          sans-serif;
        font-family: var(--sf);
        background: var(--bg);
        color: var(--text);
        height: 100vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        letter-spacing: -0.014em;
        -webkit-font-smoothing: antialiased;
      }
      .asq * { box-sizing: border-box; }
      .asq button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; }
      .asq input, .asq textarea, .asq select {
        font-family: var(--sf); color: var(--text); background: transparent;
        border: none; outline: none; letter-spacing: -0.014em;
      }
      /* kill the app's global box-shadow focus ring on borderless fields */
      .asq input:focus, .asq textarea:focus, .asq select:focus,
      .asq input:focus-visible, .asq textarea:focus-visible, .asq select:focus-visible {
        outline: none; box-shadow: none;
      }
      .asq input::placeholder, .asq textarea::placeholder { color: var(--text-2); opacity: 0.8; }

      .asq .topbar {
        flex: none; display: flex; align-items: center; gap: 16px; padding: 14px 24px;
        background: rgba(255, 255, 255, 0.72);
        -webkit-backdrop-filter: blur(40px) saturate(170%); backdrop-filter: blur(40px) saturate(170%);
        border-bottom: 1px solid var(--hair);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.8); z-index: 50;
      }
      .asq .tb-back { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; font-weight: 500; color: var(--blue); padding: 6px 8px 6px 2px; border-radius: 8px; }
      .asq .tb-back:hover { opacity: 0.7; }
      .asq .tb-crumb { flex: 1; min-width: 0; }
      .asq .tb-course { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-2); }
      .asq .tb-name { font-size: 16px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .asq .tb-status { font-size: 13px; font-weight: 500; color: var(--text-2); white-space: nowrap; }
      .asq .tb-actions { display: flex; align-items: center; gap: 10px; }
      .asq .tb-theme {
        width: 38px; height: 38px; border-radius: 50%; flex: none;
        display: inline-flex; align-items: center; justify-content: center;
        background: rgba(125, 125, 135, 0.14); color: var(--text-2);
        transition: background 0.18s, color 0.18s, transform 0.16s;
      }
      .asq .tb-theme:hover { background: rgba(125, 125, 135, 0.24); color: var(--text); }
      .asq .tb-theme:active { transform: scale(0.94); }
      .asq .btn-glass {
        display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 980px;
        background: rgba(125, 125, 135, 0.14); color: var(--text);
        font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
        transition: background 0.18s, transform 0.16s;
      }
      .asq .btn-glass:hover { background: rgba(125, 125, 135, 0.26); }
      .asq .btn-glass:active { transform: scale(0.96); }
      .asq .btn-main {
        display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 18px; border-radius: 980px;
        background: var(--blue); color: #fff;
        font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
        transition: opacity 0.16s, transform 0.16s;
      }
      .asq .btn-main:hover { opacity: 0.85; }
      .asq .btn-main:active { transform: scale(0.96); }
      /* "On" — same simple purple, just dimmed to read as already-active */
      .asq .btn-main.live { background: var(--blue); opacity: 0.55; }
      .asq .btn-main.live:hover { opacity: 0.7; }

      .asq .shell { flex: 1; display: flex; min-height: 0; }
      .asq .side {
        flex: none; width: 400px; overflow-y: auto; overscroll-behavior: contain;
        padding: 28px 20px 80px; border-right: 1px solid var(--hair);
        background: linear-gradient(180deg, #ffffff, #fcfcfe);
      }
      .asq .sec { margin-top: 34px; }
      .asq .sec:first-child { margin-top: 0; }
      .asq .sec-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 16px 6px; }
      .asq .sec-h { font-family: var(--po); font-size: 18px; font-weight: 600; letter-spacing: -0.02em; color: var(--text); }
      .asq .chip { font-size: 11px; font-weight: 700; letter-spacing: 0.03em; padding: 2px 8px; border-radius: 980px; white-space: nowrap; }
      .asq .chip.done { background: rgba(35, 160, 80, 0.12); color: #1d8745; }
      .asq .chip.wip { background: rgba(125, 125, 135, 0.14); color: var(--text-2); }
      .asq .sec-sub { font-size: 12.5px; line-height: 1.5; color: var(--text-2); margin: 0 16px 12px; }
      .asq .card { background: #fff; border-radius: 18px; border: 1px solid var(--hair); overflow: hidden; }
      .asq .field { padding: 13px 16px; }
      .asq .field + .field, .asq .field + .q-row, .asq .q-row + .field { border-top: 1px solid rgba(20, 22, 50, 0.06); }
      .asq .f-label { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-2); margin-bottom: 5px; display: flex; justify-content: space-between; }
      .asq .f-label .opt { text-transform: none; letter-spacing: 0; font-weight: 500; }
      .asq .f-input { width: 100%; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
      .asq .f-area { width: 100%; font-size: 14px; line-height: 1.5; color: var(--ans); resize: none; overflow: hidden; min-height: 38px; }
      .asq .f-help { font-size: 12px; color: var(--text-2); margin-top: 5px; }

      .asq .radio-row { display: flex; align-items: flex-start; gap: 12px; padding: 12px 16px; width: 100%; text-align: left; transition: background 0.12s; }
      .asq .radio-row + .radio-row { border-top: 1px solid var(--hair); }
      .asq .radio-row:hover { background: rgba(125, 125, 135, 0.06); }
      .asq .rr-dot { flex: none; width: 20px; height: 20px; border-radius: 50%; margin-top: 1px; box-shadow: inset 0 0 0 1.5px rgba(0, 0, 0, 0.25); display: grid; place-items: center; transition: box-shadow 0.15s; }
      .asq .radio-row.on .rr-dot { box-shadow: inset 0 0 0 6px var(--blue); }
      .asq .rr-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .asq .rr-t { font-size: 14.5px; font-weight: 600; letter-spacing: -0.015em; }
      .asq .rr-s { font-size: 12.5px; line-height: 1.45; color: var(--text-2); margin-top: 1px; }
      .asq .rr-extra { margin-top: 9px; display: none; }
      .asq .radio-row.on .rr-extra { display: block; }
      .asq .mini-select {
        width: 100%; appearance: none; -webkit-appearance: none;
        font-size: 13.5px; font-weight: 600; color: var(--text);
        background: rgba(125, 125, 135, 0.1); border-radius: 9px; padding: 8px 30px 8px 12px;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2386868b' stroke-width='1.8' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 12px center; cursor: pointer;
      }
      .asq .mini-num { width: 64px; font-size: 13.5px; font-weight: 600; text-align: center; background: rgba(125, 125, 135, 0.1); border-radius: 9px; padding: 8px 6px; }
      .asq .rr-extra .lbl { font-size: 12px; font-weight: 500; color: var(--text-2); margin-right: 8px; }

      .asq .q-row { display: flex; align-items: center; gap: 14px; padding: 13px 16px; }
      .asq .q-row + .q-row { border-top: 1px solid var(--hair); }
      .asq .q-main { flex: 1; min-width: 0; }
      .asq .q-t { font-size: 14.5px; font-weight: 600; letter-spacing: -0.015em; }
      .asq .q-s { font-size: 12.5px; line-height: 1.45; color: var(--text-2); margin-top: 1px; }
      .asq .sw { flex: none; position: relative; width: 46px; height: 28px; border-radius: 980px; background: rgba(125, 125, 135, 0.32); transition: background 0.25s ease; }
      .asq .sw::after { content: ''; position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3); transition: transform 0.25s cubic-bezier(0.2, 1, 0.3, 1); }
      .asq .sw.on { background: var(--blue); }
      .asq .sw.on::after { transform: translateX(18px); }

      .asq .seg { display: grid; grid-auto-flow: column; gap: 2px; background: rgba(125, 125, 135, 0.14); border-radius: 10px; padding: 2px; margin-top: 8px; }
      .asq .seg button { font-size: 12px; font-weight: 600; letter-spacing: -0.01em; padding: 7px 4px; border-radius: 8px; color: var(--text-2); transition: background 0.15s, color 0.15s, box-shadow 0.15s; }
      .asq .seg button.on { background: linear-gradient(180deg, #fff, rgba(255, 255, 255, 0.85)); color: var(--text); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), 0 1px 4px rgba(20, 22, 50, 0.12); }

      .asq .canvas {
        flex: 1; min-width: 0; overflow: auto; overscroll-behavior: contain;
        background-image: radial-gradient(rgba(20, 22, 50, 0.06) 1px, transparent 1px);
        background-size: 22px 22px; background-color: var(--canvas);
      }
      .asq .canvas-head { position: sticky; top: 0; z-index: 10; display: flex; align-items: baseline; gap: 12px; padding: 18px 32px 14px; background: linear-gradient(180deg, var(--canvas) 55%, transparent); }
      .asq .ch-t { font-family: var(--po); font-size: 17px; font-weight: 600; letter-spacing: -0.02em; }
      .asq .ch-s { font-size: 13px; color: var(--text-2); }
      .asq .tree { display: flex; flex-direction: column; align-items: center; padding: 18px 32px 120px; min-width: 660px; }

      .asq .node {
        position: relative; width: 300px;
        background: rgba(255, 255, 255, 0.55);
        -webkit-backdrop-filter: blur(28px) saturate(170%); backdrop-filter: blur(28px) saturate(170%);
        border-radius: 20px; padding: 13px 15px;
        box-shadow: 0 20px 26px rgba(20, 22, 50, 0.07), 0 2px 6px rgba(20, 22, 50, 0.04), inset 0 1px 1px rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(255, 255, 255, 0.4);
        display: flex; align-items: flex-start; gap: 12px; transition: box-shadow 0.2s, transform 0.2s, background 0.2s;
      }
      .asq .node:hover { background: rgba(255, 255, 255, 0.68); box-shadow: 0 28px 38px rgba(20, 22, 50, 0.1), 0 3px 8px rgba(20, 22, 50, 0.05), inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 0 0 1px rgba(255, 255, 255, 0.5); }
      .asq .node-ico { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.34)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1.5px rgba(20, 22, 50, 0.08), 0 4px 8px rgba(20, 22, 50, 0.09); color: #46464c; }
      .asq .node.is-trigger .node-ico, .asq .node.is-email .node-ico { background: linear-gradient(180deg, rgba(122, 134, 243, 0.32), rgba(60, 74, 201, 0.1)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.75), inset 0 -1px 1.5px rgba(30, 38, 120, 0.1), 0 4px 10px rgba(60, 74, 201, 0.16); color: var(--blue); }
      .asq .node.is-goal .node-ico { background: linear-gradient(180deg, rgba(110, 210, 150, 0.34), rgba(35, 160, 80, 0.1)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.75), inset 0 -1px 1.5px rgba(15, 80, 40, 0.1), 0 4px 10px rgba(35, 160, 80, 0.15); color: #1d8745; }
      .asq .node-main { flex: 1; min-width: 0; }
      .asq .node-k { font-size: 10.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-2); }
      .asq .node-t { font-size: 14.5px; font-weight: 600; letter-spacing: -0.015em; margin-top: 2px; overflow-wrap: break-word; }
      .asq .node-t input { font-size: 14.5px; font-weight: 600; width: 100%; }
      .asq .node-sub { font-size: 12.5px; color: var(--text-2); margin-top: 2px; }
      .asq .node-btn { display: inline-flex; align-items: center; gap: 6px; margin-top: 9px; font-size: 12.5px; font-weight: 600; color: var(--blue); padding: 6px 11px; border-radius: 980px; background: rgba(60, 74, 201, 0.08); transition: background 0.15s; }
      .asq .node-btn:hover { background: rgba(60, 74, 201, 0.15); }
      .asq .node .mini-select { margin-top: 8px; width: auto; padding-right: 28px; }
      .asq .node .mini-num { margin-top: 8px; }
      .asq .node-tools { position: absolute; top: 50%; left: calc(100% + 8px); transform: translateY(-50%); display: none; flex-direction: column; gap: 4px; }
      /* Invisible hover-bridge across the gap between the card's right edge and
         this detached tool strip. Without it, moving the cursor toward the
         delete/move buttons crossed a non-hoverable gap, dropped .node:hover,
         and the buttons vanished before you could click them — which made steps
         feel impossible to delete or reorder. The bridge keeps the pointer over
         a descendant of .node the whole way across, so the strip stays open. */
      .asq .node-tools::before { content: ''; position: absolute; top: -10px; bottom: -10px; left: -16px; width: 16px; }
      .asq .node:hover .node-tools { display: flex; }
      .asq .nt-btn { width: 27px; height: 27px; border-radius: 50%; background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.6)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--text-2); display: grid; place-items: center; box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1px rgba(20, 22, 50, 0.05), 0 4px 10px rgba(20, 22, 50, 0.12); transition: color 0.15s, transform 0.12s; }
      .asq .nt-btn:hover { color: var(--text); transform: scale(1.08); }
      .asq .nt-btn.del:hover { color: #c93c3c; }

      .asq .conn { display: flex; flex-direction: column; align-items: center; }
      .asq .conn .line { width: 2px; height: 14px; background: rgba(20, 22, 50, 0.13); }
      .asq .conn-add { width: 26px; height: 26px; border-radius: 50%; background: linear-gradient(180deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.55)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); color: var(--text-2); display: grid; place-items: center; box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1px rgba(20, 22, 50, 0.06), 0 4px 10px rgba(20, 22, 50, 0.1); transition: color 0.15s, transform 0.15s, box-shadow 0.18s; }
      .asq .conn-add:hover { color: var(--blue); transform: scale(1.15); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1px rgba(20, 22, 50, 0.06), 0 6px 16px rgba(60, 74, 201, 0.22); }

      .asq .branch-wrap { display: flex; gap: 36px; align-items: flex-start; }
      .asq .branch-leg { display: flex; flex-direction: column; align-items: center; min-width: 320px; }
      .asq .leg-label { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 3px 10px; border-radius: 980px; }
      .asq .leg-label.yes { background: linear-gradient(180deg, rgba(110, 210, 150, 0.3), rgba(35, 160, 80, 0.1)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.7); color: #1d8745; }
      .asq .leg-label.no { background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.45)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1px rgba(20, 22, 50, 0.05), 0 2px 6px rgba(20, 22, 50, 0.06); color: var(--text-2); }
      .asq .branch-split { position: relative; width: 676px; height: 22px; }
      .asq .branch-split::before { content: ''; position: absolute; left: 160px; right: 160px; top: 0; height: 22px; border: 2px solid rgba(0, 0, 0, 0.16); border-bottom: none; border-radius: 14px 14px 0 0; }
      .asq .branch-split .stem { position: absolute; left: 50%; top: -2px; transform: translateX(-50%); width: 2px; height: 12px; background: rgba(0, 0, 0, 0.16); }
      .asq .branch-split .armL, .asq .branch-split .armR { position: absolute; top: 10px; width: 2px; height: 12px; background: rgba(0, 0, 0, 0.16); }
      .asq .branch-split .armL { left: 160px; }
      .asq .branch-split .armR { right: 160px; }
      .asq .branch-split .bar { position: absolute; left: 160px; right: 160px; top: 10px; height: 2px; background: rgba(0, 0, 0, 0.16); }

      .asq .exit-pill { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; color: var(--text-2); background: linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.45)); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1px rgba(20, 22, 50, 0.05), 0 4px 10px rgba(20, 22, 50, 0.07); border-radius: 980px; padding: 7px 15px; }
      .asq .empty-hint { width: 300px; border-radius: 20px; background: rgba(255, 255, 255, 0.4); -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), inset 0 0 0 1px rgba(255, 255, 255, 0.4), 0 10px 20px rgba(20, 22, 50, 0.05); padding: 18px 16px; text-align: center; font-size: 13px; line-height: 1.5; color: var(--text-2); }

      .asq .menu { position: fixed; z-index: 200; width: 244px; background: rgba(255, 255, 255, 0.7); -webkit-backdrop-filter: blur(50px) saturate(180%); backdrop-filter: blur(50px) saturate(180%); border-radius: 22px; box-shadow: 0 40px 60px rgba(20, 22, 50, 0.18), 0 4px 16px rgba(20, 22, 50, 0.08), inset 0 1px 1px rgba(255, 255, 255, 0.95), inset 0 0 0 1px rgba(255, 255, 255, 0.45); padding: 7px; }
      .asq .menu button { display: flex; align-items: center; gap: 12px; width: 100%; padding: 9px 10px; border-radius: 10px; text-align: left; transition: background 0.12s, box-shadow 0.12s; }
      .asq .menu button:hover { background: rgba(255, 255, 255, 0.75); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.9), 0 2px 8px rgba(20, 22, 50, 0.06); }
      .asq .menu button:disabled { opacity: 0.4; cursor: default; }
      .asq .menu button:disabled:hover { background: none; box-shadow: none; }
      .asq .m-ico { flex: none; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.35)); box-shadow: inset 0 1px 1px rgba(255, 255, 255, 1), inset 0 -1px 1.5px rgba(20, 22, 50, 0.08), 0 3px 7px rgba(20, 22, 50, 0.08); display: grid; place-items: center; color: #46464c; }
      .asq .m-t { font-size: 13.5px; font-weight: 600; }
      .asq .m-s { font-size: 11.5px; color: var(--text-2); }

      .asq .toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 600; display: inline-flex; align-items: center; gap: 9px; height: 44px; padding: 0 20px; border-radius: 980px; background: rgba(15, 15, 18, 0.8); color: #fff; -webkit-backdrop-filter: blur(20px) saturate(150%); backdrop-filter: blur(20px) saturate(150%); font-size: 14px; font-weight: 600; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3); }
      .asq .toast .tk { color: #6ddb8a; display: grid; place-items: center; }

      .asq .leave-overlay {
        position: fixed; inset: 0; z-index: 700; display: grid; place-items: center;
        padding: 24px; background: rgba(15, 15, 18, 0.42);
        -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px);
      }
      .asq .leave-card {
        width: min(420px, 100%); background: var(--card); border-radius: 18px;
        padding: 22px; box-shadow: 0 40px 90px rgba(0, 0, 0, 0.34);
      }
      .asq .leave-title { font-size: 17px; font-weight: 650; letter-spacing: -0.02em; }
      .asq .leave-body { margin-top: 8px; font-size: 13.5px; line-height: 1.5; color: var(--text-2); }
      .asq .leave-actions {
        margin-top: 20px; display: flex; align-items: center; justify-content: space-between; gap: 10px;
      }
      .asq .leave-right { display: flex; align-items: center; gap: 8px; }
      .asq .leave-discard, .asq .leave-cancel, .asq .leave-save {
        height: 38px; padding: 0 16px; border-radius: 980px; font-size: 13.5px; font-weight: 600;
      }
      .asq .leave-discard { color: #c2433a; background: rgba(194, 67, 58, 0.1); }
      .asq .leave-discard:hover { background: rgba(194, 67, 58, 0.16); }
      .asq .leave-cancel { color: var(--text); background: rgba(0, 0, 0, 0.06); }
      .asq .leave-cancel:hover { background: rgba(0, 0, 0, 0.1); }
      .asq .leave-save { color: #fff; background: var(--blue); }
      .asq .leave-save:hover { opacity: 0.92; }

      /* ───────────────────────── dark mode ─────────────────────────
         The builder is glassmorphism with many hardcoded white frosted
         surfaces; each is remapped to a dark frosted equivalent so nodes, the
         tree connectors, icons and text all read correctly. The accent matches
         the rest of the course editor (community-blue #2997ff on #141416). */
      .asq.dark {
        --bg: #141416;
        --canvas: #161618;
        --card: #1d1d20;
        --text: #f5f5f7;
        --text-2: rgba(245, 245, 247, 0.6);
        --blue: #2997ff;
        --hair: rgba(245, 245, 247, 0.12);
        --ans: rgba(245, 245, 247, 0.82);
      }
      .asq.dark .topbar {
        background: rgba(24, 24, 27, 0.72);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.04);
      }
      .asq.dark .side { background: linear-gradient(180deg, #1a1a1d, #161618); }
      .asq.dark .card { background: var(--card); }
      .asq.dark .field + .field,
      .asq.dark .field + .q-row,
      .asq.dark .q-row + .field { border-top-color: rgba(255, 255, 255, 0.07); }
      .asq.dark .chip.done { background: rgba(48, 180, 100, 0.16); color: #4ad991; }
      .asq.dark .radio-row:hover { background: rgba(255, 255, 255, 0.05); }
      .asq.dark .rr-dot { box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, 0.28); }
      .asq.dark .mini-select,
      .asq.dark .mini-num { background: rgba(255, 255, 255, 0.08); }
      .asq.dark .seg button.on {
        background: linear-gradient(180deg, #3a3a40, #313137); color: var(--text);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 1px 4px rgba(0, 0, 0, 0.45);
      }
      .asq.dark .canvas {
        background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px);
      }
      .asq.dark .node {
        background: rgba(255, 255, 255, 0.045);
        box-shadow: 0 20px 30px rgba(0, 0, 0, 0.35), 0 2px 6px rgba(0, 0, 0, 0.25),
          inset 0 1px 1px rgba(255, 255, 255, 0.06), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .asq.dark .node:hover {
        background: rgba(255, 255, 255, 0.075);
        box-shadow: 0 28px 42px rgba(0, 0, 0, 0.45), 0 3px 8px rgba(0, 0, 0, 0.3),
          inset 0 1px 1px rgba(255, 255, 255, 0.09), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      }
      .asq.dark .node-ico {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 4px 8px rgba(0, 0, 0, 0.3);
        color: rgba(245, 245, 247, 0.85);
      }
      .asq.dark .node.is-trigger .node-ico,
      .asq.dark .node.is-email .node-ico {
        background: linear-gradient(180deg, rgba(122, 134, 243, 0.4), rgba(60, 74, 201, 0.16));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.18), 0 4px 10px rgba(20, 30, 90, 0.4);
        color: #6ea8ff;
      }
      .asq.dark .node.is-goal .node-ico {
        background: linear-gradient(180deg, rgba(70, 200, 130, 0.38), rgba(35, 160, 80, 0.14));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.16), 0 4px 10px rgba(10, 80, 40, 0.4);
        color: #4ad991;
      }
      .asq.dark .node-btn { background: rgba(41, 151, 255, 0.16); color: #6ea8ff; }
      .asq.dark .node-btn:hover { background: rgba(41, 151, 255, 0.26); }
      .asq.dark .conn .line { background: rgba(255, 255, 255, 0.16); }
      .asq.dark .nt-btn,
      .asq.dark .conn-add {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 4px 10px rgba(0, 0, 0, 0.4);
      }
      .asq.dark .conn-add:hover {
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 6px 16px rgba(41, 151, 255, 0.3);
      }
      .asq.dark .branch-split::before { border-color: rgba(255, 255, 255, 0.2); }
      .asq.dark .branch-split .stem,
      .asq.dark .branch-split .armL,
      .asq.dark .branch-split .armR,
      .asq.dark .branch-split .bar { background: rgba(255, 255, 255, 0.2); }
      .asq.dark .leg-label.yes {
        background: linear-gradient(180deg, rgba(70, 200, 130, 0.3), rgba(35, 160, 80, 0.12));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.12); color: #4ad991;
      }
      .asq.dark .leg-label.no {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.08), 0 2px 6px rgba(0, 0, 0, 0.3);
        color: var(--text-2);
      }
      .asq.dark .exit-pill,
      .asq.dark .empty-hint {
        background: rgba(255, 255, 255, 0.05);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.07), 0 4px 10px rgba(0, 0, 0, 0.3);
      }
      .asq.dark .menu {
        background: rgba(34, 34, 38, 0.82);
        box-shadow: 0 40px 60px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.4),
          inset 0 1px 1px rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.08);
      }
      .asq.dark .menu button:hover {
        background: rgba(255, 255, 255, 0.06);
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.06), 0 2px 8px rgba(0, 0, 0, 0.3);
      }
      .asq.dark .m-ico {
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.02));
        box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 3px 7px rgba(0, 0, 0, 0.3);
        color: rgba(245, 245, 247, 0.85);
      }
      .asq.dark .leave-cancel { background: rgba(255, 255, 255, 0.1); }
      .asq.dark .leave-cancel:hover { background: rgba(255, 255, 255, 0.16); }

      @media (max-width: 980px) {
        .asq { height: auto; overflow: auto; }
        .asq .shell { flex-direction: column; overflow: auto; }
        .asq .side { width: 100%; border-right: none; border-bottom: 1px solid var(--hair); }
        .asq .canvas { overflow: visible; }
      }
    `}</style>
  )
}
