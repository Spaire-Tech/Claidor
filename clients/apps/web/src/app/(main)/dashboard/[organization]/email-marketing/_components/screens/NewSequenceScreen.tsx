'use client'

import { FeatureGate } from '@/components/Entitlements/FeatureGate'
import { useCourseById } from '@/hooks/queries/courses'
import {
  useCreateEmailSequence,
  useCreateSequenceStep,
  useDeleteSequenceStep,
  useEmailSequence,
  useEmailSequences,
  useReorderSequenceSteps,
  useSendTestSequenceStep,
  useSequenceSteps,
  useUpdateEmailSequence,
  useUpdateSequenceStep,
  useUploadSequenceImage,
} from '@/hooks/queries/emailMarketing'
import { useProducts } from '@/hooks/queries/products'
import { schemas } from '@spaire/client'
import { useQueryClient } from '@tanstack/react-query'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BroadcastEditor } from '../blockEditor/BroadcastEditor'
import { renderBlocksToHtml } from '../blockEditor/render'
import {
  Block,
  ContentDoc,
  isContentDoc,
  newId as newBlockId,
  normalizeContentDoc,
} from '../blockEditor/types'
import { useDialogs } from '../dialogs'
import {
  ActionStepValue,
  BranchStepValue,
  DEFAULT_FLOW_DOC,
  EmailStepValue,
  FlowDoc,
  GoalStepValue,
  StepNode,
  WaitStepValue,
  adoptFlowDoc,
  appendStep,
  blankStepNode,
  blankStepNodeWithValue,
  countEmailsInTree,
  deepCloneStep,
  estimateDays,
  findStepById,
  insertAfterInTree,
  materializeEmailsFromFlow,
  moveSiblingInTree,
  newId,
  removeStepById,
  reorderSiblingTree,
  replaceStepInTree,
  stepSummary,
  stepTitle,
} from '../flow'
import { Icon } from '../Icon'
import { SequenceFlowPreview } from '../SequenceFlowPreview'
import {
  Field,
  FormSection,
  SegmentedControl,
  SelectField,
  SettingRow,
  TileOption,
  Toggle,
} from '../shared'
import {
  ActionStepBody,
  BranchStepBody,
  EmailStepBody,
  GoalStepBody,
  StepCard,
  WaitStepBody,
} from '../stepBlocks'

type TriggerId =
  | 'on_subscribe'
  | 'on_purchase'
  | 'on_subscription_created'
  | 'on_subscription_cancelled'
  | 'on_form_submit'
  | 'manual'

const TRIGGERS: {
  id: TriggerId
  label: string
  desc: string
  icon: string
  badge: string | null
}[] = [
  {
    id: 'on_subscribe',
    label: 'On subscribe',
    desc: 'When someone joins your list.',
    icon: 'user',
    badge: null,
  },
  {
    id: 'on_purchase',
    label: 'On purchase',
    desc: 'When a buyer completes checkout.',
    icon: 'shopping-cart',
    badge: null,
  },
  {
    id: 'on_subscription_created',
    label: 'Subscription started',
    desc: 'When a recurring sub begins.',
    icon: 'rotate',
    badge: null,
  },
  {
    id: 'on_subscription_cancelled',
    label: 'Subscription ended',
    desc: 'When a recurring sub stops.',
    icon: 'x-circle',
    badge: null,
  },
  {
    id: 'on_form_submit',
    label: 'Tag added',
    desc: 'When a tag is applied.',
    icon: 'tag',
    badge: null,
  },
  {
    id: 'manual',
    label: 'Manual / API',
    desc: 'Enrol via dashboard or API call.',
    icon: 'mouse-pointer',
    badge: null,
  },
]

// ── Course-flavoured trigger choices ──────────────────────────────────────
// Each maps to a backend on_purchase trigger (product locked to the course)
// plus a specific leading flow shape. See seedFlowForCourseTrigger below.
type CourseTriggerChoice =
  | 'enrolled'
  | 'lesson_completed'
  | 'first_lesson_completed'
  | 'mid_checkpoint'
  | 'course_completed'
  | 'inactive'

const COURSE_TRIGGER_TILES: {
  id: CourseTriggerChoice
  label: string
  desc: string
  icon: string
}[] = [
  {
    id: 'enrolled',
    label: 'Student enrols',
    desc: 'Send the moment they get access to the course.',
    icon: 'user',
  },
  {
    id: 'lesson_completed',
    label: 'Lesson completed',
    desc: 'Pick a specific lesson — fires when a student finishes it.',
    icon: 'check-circle',
  },
  {
    id: 'first_lesson_completed',
    label: 'First lesson completed',
    desc: 'Celebrate momentum the first time they finish any lesson.',
    icon: 'sparkles',
  },
  {
    id: 'mid_checkpoint',
    label: 'Halfway through',
    desc: 'Fires when the student crosses 50% of the course.',
    icon: 'rotate',
  },
  {
    id: 'course_completed',
    label: 'Course completed',
    desc: 'Wrap up — fires when every lesson is done.',
    icon: 'check-circle',
  },
  {
    id: 'inactive',
    label: 'Inactive for N days',
    desc: 'Pick up where they left off after a quiet stretch.',
    icon: 'mail-open',
  },
]

const COURSE_TRIGGER_EVENT: Record<
  Exclude<CourseTriggerChoice, 'enrolled' | 'inactive'>,
  string
> = {
  lesson_completed: 'course.lesson_completed',
  first_lesson_completed: 'course.first_lesson_completed',
  mid_checkpoint: 'course.mid_checkpoint',
  course_completed: 'course.completed',
}

type SequenceShape = {
  id: string
  name: string
  description: string | null
  trigger_type: string
  trigger_config: Record<string, unknown>
  status: 'draft' | 'active' | 'paused'
}

type ServerStep = {
  id: string
  position: number
  delay_hours: number
  subject: string
  sender_name: string
  sender_email: string | null
  flow_step_id?: string | null
  reply_to_email: string | null
  content_html: string | null
  content_json: Record<string, unknown> | null
}

const STARTER_DOC = (): ContentDoc => ({
  version: 1,
  blocks: [
    { id: newBlockId(), type: 'heading', level: 2, text: 'Heading' } as Block,
    {
      id: newBlockId(),
      type: 'paragraph',
      text: 'Write your email here.',
    } as Block,
  ],
})

const adoptContentJson = (raw: unknown): ContentDoc => {
  if (isContentDoc(raw)) {
    const withIds = {
      version: 1 as const,
      accent: raw.accent,
      blocks: raw.blocks.map((b) =>
        'id' in b && b.id ? b : ({ ...b, id: newBlockId() } as Block),
      ),
    }
    return normalizeContentDoc(withIds)
  }
  return STARTER_DOC()
}

export const NewSequenceScreen = (props: {
  organization: schemas['Organization']
  sequenceId: string | null
  onBack: () => void
  onOpened?: (id: string) => void
  /** Scope this sequence to a specific course when first persisted. */
  courseId?: string
  /** Scope this sequence to a specific lesson when first persisted. */
  lessonId?: string
}) => {
  const { sequenceId } = props
  const sequenceQuery = useEmailSequence(sequenceId ?? '')
  const stepsQuery = useSequenceSteps(sequenceId ?? '')

  if (sequenceId && (sequenceQuery.isLoading || stepsQuery.isLoading)) {
    return (
      <div
        className="card"
        style={{ padding: 60, textAlign: 'center', color: 'var(--ink-3)' }}
      >
        Loading sequence…
      </div>
    )
  }

  return (
    <SequenceEditorInner
      {...props}
      existing={(sequenceQuery.data as SequenceShape | undefined) ?? null}
      existingSteps={(stepsQuery.data as ServerStep[] | undefined) ?? []}
    />
  )
}

const SequenceEditorInner = ({
  organization,
  sequenceId,
  onBack,
  onOpened,
  courseId,
  lessonId,
  existing,
  existingSteps,
}: {
  organization: schemas['Organization']
  sequenceId: string | null
  onBack: () => void
  onOpened?: (id: string) => void
  courseId?: string
  lessonId?: string
  existing: SequenceShape | null
  existingSteps: ServerStep[]
}) => {
  // Hydrate the editable draft. The flow_doc lives on trigger_config and is
  // the source of truth for what the UI shows. If an existing sequence has
  // no flow_doc, synthesize one from the existing email steps so editing a
  // legacy sequence stays meaningful.
  const initialFlow = useMemo<FlowDoc>(() => {
    const stored = (existing?.trigger_config ?? {}) as Record<string, unknown>
    const adopted = adoptFlowDoc(stored.flow_doc)
    if (adopted) return adopted

    const fallback = DEFAULT_FLOW_DOC()
    if (existingSteps.length === 0) return fallback

    // Reconstruct steps as alternating wait + email rows from server data.
    const steps: StepNode[] = []
    const sorted = [...existingSteps].sort((a, b) => a.position - b.position)
    for (const s of sorted) {
      if (s.delay_hours > 0) {
        steps.push({
          id: newId(),
          type: 'wait',
          value: {
            mode: 'duration',
            amount: Math.max(1, Math.round(s.delay_hours / 24)),
            unit: 'day',
          },
        })
      }
      steps.push({
        id: newId(),
        type: 'email',
        value: {
          subject: s.subject,
          preview: '',
          fromName: s.sender_name,
          fromEmail: s.sender_email ?? 'hello@yoursite.com',
          template: 'plain',
          abTest: false,
          trackClicks: true,
          content_html: s.content_html,
          content_json: s.content_json ?? null,
        },
      })
    }
    return { ...fallback, steps }
  }, [existing, existingSteps])

  const [name, setName] = useState(existing?.name ?? 'Untitled sequence')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [trigger, setTrigger] = useState<TriggerId>(
    (existing?.trigger_type as TriggerId | undefined) ?? 'manual',
  )
  const [triggerProduct, setTriggerProduct] = useState<string>(() => {
    const cfg = (existing?.trigger_config ?? {}) as Record<string, unknown>
    return typeof cfg.product_id === 'string'
      ? (cfg.product_id as string)
      : 'any'
  })
  const [flow, setFlow] = useState<FlowDoc>(initialFlow)
  const [expandedId, setExpandedId] = useState<string | null>(
    initialFlow.steps[0]?.id ?? null,
  )
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null)

  // ── Course-aware authoring ──────────────────────────────────────────────
  // When a courseId is passed (the editor was opened from the course
  // Automations panel), we swap the generic trigger picker for a course-
  // friendly one: pick a moment in the student's journey, the editor
  // wires the underlying on_purchase trigger + flow shape automatically.
  const courseMode = Boolean(courseId)
  const courseQuery = useCourseById(courseMode ? courseId : undefined)
  const course = courseQuery.data ?? null
  const [courseTriggerChoice, setCourseTriggerChoice] =
    useState<CourseTriggerChoice | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | undefined>(
    lessonId,
  )
  const [inactiveDays, setInactiveDays] = useState<number>(7)

  // Lock the underlying trigger + product to the course's product as soon
  // as we know what the course is. The user never sees this — they pick
  // "When student enrols" / "When lesson is completed" etc., which all run
  // on top of on_purchase + this product_id.
  useEffect(() => {
    if (!courseMode || !course) return
    if (trigger !== 'on_purchase') setTrigger('on_purchase')
    if (triggerProduct !== course.product_id)
      setTriggerProduct(course.product_id)
  }, [courseMode, course, trigger, triggerProduct])

  const persistedIdRef = useRef<string | null>(sequenceId)
  const persistedId = persistedIdRef.current

  const createSequence = useCreateEmailSequence(organization.id)
  const updateSequence = useUpdateEmailSequence()

  const upd = (patch: Partial<FlowDoc>) => setFlow((f) => ({ ...f, ...patch }))
  const updSteps = (next: StepNode[]) => setFlow((f) => ({ ...f, steps: next }))

  // Drop a fresh starter flow shaped to the chosen course trigger:
  //   - "enrolled"        → just one starter email
  //   - "inactive"        → leading duration wait + email
  //   - event-based ones  → leading until-event wait + email
  // The wait nodes are wired to the events fired from course/service.py.
  // Sequence's course_id/lesson_id columns scope the wakes to this course
  // / lesson so a completion in course A never fires sequence B.
  const seedFlowForCourseTrigger = (choice: CourseTriggerChoice) => {
    const starterEmail: StepNode = {
      id: newBlockId(),
      type: 'email',
      value: {
        subject: 'Untitled',
        preview: '',
        fromName: organization.name ?? 'Course Team',
        fromEmail: 'hello@yoursite.com',
        template: 'plain',
        abTest: false,
        trackClicks: true,
        content_html: null,
        content_json: null,
      },
    }
    let steps: StepNode[]
    if (choice === 'enrolled') {
      steps = [starterEmail]
    } else if (choice === 'inactive') {
      steps = [
        {
          id: newBlockId(),
          type: 'wait',
          value: {
            mode: 'duration',
            amount: Math.max(1, inactiveDays),
            unit: 'day',
          },
        },
        starterEmail,
      ]
    } else {
      const event = COURSE_TRIGGER_EVENT[choice]
      steps = [
        {
          id: newBlockId(),
          type: 'wait',
          value: { mode: 'until-event', amount: 1, unit: 'day', event },
        },
        starterEmail,
      ]
    }
    setFlow((f) => ({ ...f, steps }))
    setExpandedId(starterEmail.id)
  }

  const onCourseTriggerPick = (choice: CourseTriggerChoice) => {
    setCourseTriggerChoice(choice)
    seedFlowForCourseTrigger(choice)
  }

  // Lesson-context default: when the editor is opened from a specific lesson
  // (lessonId is set on top of courseId), pre-select "Lesson completed" with
  // that lesson highlighted and seed the flow with the until-event wait.
  // Cuts the number of clicks from 3 → 0 in the most common path for
  // lesson-scoped automations.
  const lessonDefaultAppliedRef = useRef(false)
  useEffect(() => {
    if (lessonDefaultAppliedRef.current) return
    if (!courseMode || sequenceId) return
    if (!lessonId) return
    if (courseTriggerChoice) return
    // Wait until the course query has loaded so the lesson dropdown has data.
    if (!course) return
    lessonDefaultAppliedRef.current = true
    onCourseTriggerPick('lesson_completed')
  }, [courseMode, sequenceId, lessonId, courseTriggerChoice, course])

  // Tree-aware step helpers (Phase 3b — branches now carry yes/no children
  // recursively, so manipulations need to walk into both arms instead of
  // just the top-level array).

  const updateStep = <T extends StepNode['type']>(
    id: string,
    type: T,
    value: Extract<StepNode, { type: T }>['value'],
  ) => {
    setFlow((f) => ({
      ...f,
      steps: replaceStepInTree(f.steps, id, (existing) => {
        if (existing.type === 'branch' && type === 'branch') {
          return {
            ...existing,
            value: value as BranchStepValue,
          }
        }
        // Non-branch types swap shape entirely. The cast is a deliberate
        // widening — TypeScript can't reduce `Extract<StepNode, { type: T }>`
        // when T is itself a generic, so we route through unknown and let
        // the runtime contract enforce the right value shape per type.
        return blankStepNodeWithValue<StepNode['type']>(
          id,
          type,
          value as unknown as Extract<
            StepNode,
            { type: StepNode['type'] }
          >['value'],
        )
      }),
    }))
  }

  /**
   * Insert a fresh step under either the root list or a specific branch arm.
   * Without `parentBranchId` the new step appends at the end of the root.
   */
  const addStep = (
    type: StepNode['type'],
    parentBranchId: string | null = null,
    arm: 'yes' | 'no' | null = null,
  ) => {
    const node = blankStepNode(type)
    setFlow((f) => ({
      ...f,
      steps: appendStep(f.steps, node, parentBranchId, arm),
    }))
    setExpandedId(node.id)
  }

  const removeStep = (id: string) =>
    setFlow((f) => ({ ...f, steps: removeStepById(f.steps, id) }))

  const duplicateStep = (id: string) => {
    const target = findStepById(flow.steps, id)
    if (!target) return
    const copy = deepCloneStep(target)
    setFlow((f) => ({ ...f, steps: insertAfterInTree(f.steps, id, copy) }))
  }

  const moveStep = (id: string, dir: -1 | 1) => {
    setFlow((f) => ({ ...f, steps: moveSiblingInTree(f.steps, id, dir) }))
  }

  const handleDragOver = (overId: string) => {
    // Drag-and-drop within the tree only swaps siblings of the same parent
    // for now. Cross-arm drag is intentionally deferred — moving a step
    // between branch arms changes its semantic context, so we'd want a
    // confirmation dialog in a follow-up.
    if (!draggingId || draggingId === overId) return
    setFlow((f) => ({
      ...f,
      steps: reorderSiblingTree(f.steps, draggingId, overId),
    }))
  }

  const totalEmails = countEmailsInTree(flow.steps)
  const totalDays = estimateDays(flow.steps)

  const buildTriggerConfig = (): Record<string, unknown> => {
    const cfg: Record<string, unknown> = {
      flow_doc: flow,
      skip_if_in_another: flow.send.skipIfInOther,
      pause_on_unsubscribe: flow.send.pauseOnUnsub,
      send_window:
        flow.send.window === 'anytime'
          ? {
              enabled: false,
              respect_timezone: flow.send.respectTimezone,
              frequency_cap: flow.send.frequencyCap,
            }
          : {
              enabled: true,
              days:
                flow.send.window === 'weekdays'
                  ? [0, 1, 2, 3, 4]
                  : flow.send.window === 'daily'
                    ? [0, 1, 2, 3, 4, 5, 6]
                    : [0, 1, 2, 3, 4],
              start_hour: parseInt(flow.send.start.split(':')[0] || '9', 10),
              end_hour: parseInt(flow.send.end.split(':')[0] || '17', 10) + 1,
              respect_timezone: flow.send.respectTimezone,
              frequency_cap: flow.send.frequencyCap,
            },
    }
    if (
      triggerProduct &&
      triggerProduct !== 'any' &&
      (trigger === 'on_purchase' || trigger === 'on_subscription_created')
    ) {
      cfg.product_id = triggerProduct
    }
    if (flow.goal.event && flow.goal.event !== 'none') {
      cfg.goal_event = { type: 'event', event: flow.goal.event }
    }
    return cfg
  }

  // Synchronise materialized email steps with the server-side EmailSequenceStep
  // rows: create/update/delete to match the email entries in the flow.
  const createStepMutation = useCreateSequenceStep(persistedId ?? '')
  const updateStepMutation = useUpdateSequenceStep(persistedId ?? '')
  const deleteStepMutation = useDeleteSequenceStep(persistedId ?? '')
  const reorderMutation = useReorderSequenceSteps(persistedId ?? '')
  const queryClient = useQueryClient()

  const sendTestMutation = useSendTestSequenceStep()
  const dialogs = useDialogs()

  const ensurePersisted = async (): Promise<string> => {
    if (persistedIdRef.current) return persistedIdRef.current
    const created = await createSequence.mutateAsync({
      name,
      description: description || undefined,
      trigger_type: trigger,
      trigger_config: buildTriggerConfig(),
      // Ship the authored flow on first save so a freshly-created sequence
      // already has the audience filters, waits, and goal in place — without
      // this the editor used to PATCH a second time, which raced with
      // syncEmailSteps and risked dropping flow nodes (audit issue #27).
      flow_doc: flow as unknown as Record<string, unknown>,
      course_id: courseId,
      // Prefer the lesson picked inside the editor (course mode) over the
      // hint that came in via URL — so picking a different lesson in the
      // trigger inspector wins.
      lesson_id: selectedLessonId ?? lessonId,
    })
    persistedIdRef.current = created.id
    onOpened?.(created.id)
    return created.id
  }

  /**
   * Align the server's email step rows with the flow's email nodes by
   * stable `flow_step_id` (audit issue #5).
   *
   * Previously this aligned by array index against `existingSteps`, a
   * snapshot captured at mount time. After the first save the indices
   * drifted because newly-created rows weren't reflected in the snapshot;
   * subsequent saves wrote to the wrong row, double-created, or deleted
   * something they didn't mean to.
   *
   * The new pipeline:
   *   1. Refetch the live server rows (don't trust the captured snapshot).
   *   2. Build a `flow_step_id → ServerStep` map.
   *   3. For each desired email node:
   *        - row missing → CREATE (capture the new id)
   *        - row exists → UPDATE
   *      For each server row whose flow_step_id no longer appears in
   *      `desired` → DELETE.
   *   4. POST the final positional ordering in one reorder call.
   *
   * Legacy rows persisted before flow_step_id existed have `flow_step_id ===
   * null`; we adopt them in order until exhausted, attaching the next
   * desired flow_step_id. After one save they're fully migrated.
   */
  const syncEmailSteps = async (sequenceIdNow: string): Promise<void> => {
    const desired = materializeEmailsFromFlow(flow.steps)

    // 1. Refetch live server state. The cache may be stale right after a
    // mutation we issued ourselves earlier in this save sequence.
    const fresh = await queryClient.fetchQuery<ServerStep[]>({
      queryKey: ['email_sequence_steps', sequenceIdNow],
    })

    // 2. Build the map. Legacy rows (flow_step_id = null) are queued
    // separately and adopted by the next un-mapped desired entry.
    const byFlowId = new Map<string, ServerStep>()
    const legacyRows: ServerStep[] = []
    for (const row of fresh) {
      if (row.flow_step_id) byFlowId.set(row.flow_step_id, row)
      else legacyRows.push(row)
    }
    legacyRows.sort((a, b) => a.position - b.position)

    const seen = new Set<string>()
    type SyncedRow = { serverId: string; flowStepId: string }
    const synced: SyncedRow[] = []

    // 3a. Create / update each desired email in flow order. The position
    // we send is the desired index; the reorder call below normalises any
    // drift if the server picked a different position for a fresh insert.
    for (let i = 0; i < desired.length; i++) {
      const want = desired[i]
      const flowStepId = want.step.id
      seen.add(flowStepId)

      const payload = {
        delay_hours: Math.round(want.delayHours),
        subject: want.step.value.subject,
        sender_name: want.step.value.fromName,
        content_html:
          want.step.value.content_html ?? renderEmailFallback(want.step.value),
        flow_step_id: flowStepId,
      }

      let row = byFlowId.get(flowStepId)
      if (!row && legacyRows.length > 0) {
        // Adopt a legacy un-mapped row in arrival order so existing data
        // doesn't get duplicated on the first id-aware save.
        row = legacyRows.shift()
      }

      if (row) {
        await updateStepMutation.mutateAsync({
          stepId: row.id,
          ...payload,
        })
        synced.push({ serverId: row.id, flowStepId })
      } else {
        const created = await createStepMutation.mutateAsync(payload)
        synced.push({ serverId: created.id, flowStepId })
      }
    }

    // 3b. Delete server rows that have no corresponding desired flow node.
    // Includes leftover legacy rows that didn't get adopted above.
    for (const row of fresh) {
      const stillWanted =
        (row.flow_step_id !== null &&
          row.flow_step_id !== undefined &&
          seen.has(row.flow_step_id)) ||
        synced.some((s) => s.serverId === row.id)
      if (!stillWanted) {
        await deleteStepMutation.mutateAsync(row.id)
      }
    }

    // 4. Persist the final ordering (audit issue #6 — reorder used to be a
    // dead void branch). Skip the round-trip when nothing's reorderable.
    if (synced.length > 1) {
      await reorderMutation.mutateAsync(
        synced.map((s, i) => ({ id: s.serverId, position: i })),
      )
    }
  }

  const onSaveDraft = async () => {
    const id = await ensurePersisted()
    await updateSequence.mutateAsync({
      sequenceId: id,
      name,
      description,
      trigger_type: trigger,
      trigger_config: buildTriggerConfig(),
    })
    await syncEmailSteps(id)
    setSavedAt(new Date())
  }

  const onActivate = async () => {
    if (totalEmails === 0) {
      await dialogs.alert({
        title: 'Add an email first',
        message:
          'A sequence needs at least one email step before it can go live.',
      })
      return
    }
    const id = await ensurePersisted()
    await updateSequence.mutateAsync({
      sequenceId: id,
      name,
      description,
      trigger_type: trigger,
      trigger_config: buildTriggerConfig(),
      status: 'active',
    })
    await syncEmailSteps(id)
    onBack()
  }

  // All hooks must run on every render — the previewing branch's
  // early return below would otherwise skip these and trip React's
  // rules-of-hooks check, which is what was making the Preview-flow
  // toggle and the email editor modal both look "dead" after a click.
  const productsQuery = useProducts(organization.id, { limit: 100 })
  const products = productsQuery.data?.items ?? []
  const productOptions = products.map((p) => ({ id: p.id, label: p.name }))
  // Sequences in the same org so the "Enrol in another sequence" action
  // step has a non-empty dropdown (audit issue #10 / fix-list #40 — the
  // option used to ship hardcoded `[]`). Filter out the current sequence
  // so we don't suggest enrolling into ourselves (would loop forever).
  const sequencesQuery = useEmailSequences(organization.id, { limit: 100 })
  const sequenceOptions = (sequencesQuery.data?.items ?? [])
    .filter((s: { id: string }) => s.id !== sequenceId)
    .map((s: { id: string; name: string }) => ({ id: s.id, label: s.name }))

  // Course-progress branches need lesson + module pickers populated from
  // the course this sequence is linked to. Outside of course-mode these
  // arrays are empty and the BranchStepBody hides those options entirely.
  const moduleOptions = courseMode
    ? (course?.modules ?? []).map((m, i) => ({
        id: m.id,
        label: m.title || `Season ${i + 1}`,
      }))
    : []
  const lessonOptions = courseMode
    ? (course?.modules ?? []).flatMap((m, mi) =>
        m.lessons
          .filter((l) => l.published)
          .map((l, li) => ({
            id: l.id,
            label: `${mi + 1}.${li + 1} ${l.title || 'Untitled lesson'}`,
          })),
      )
    : []

  // Tree-aware lookup so emails authored inside branch arms still open in
  // the editor modal (the previous flat-array `find` missed nested ones).
  const editingEmailNode = editingEmailId
    ? findStepById(flow.steps, editingEmailId)
    : undefined
  const editingEmail =
    editingEmailNode?.type === 'email' ? editingEmailNode : undefined

  if (previewing) {
    return (
      <SequenceFlowPreview
        steps={flow.steps}
        name={name}
        trigger={trigger}
        onBack={onBack}
        onEdit={() => setPreviewing(false)}
        onActivate={onActivate}
      />
    )
  }

  return (
    <div className="fade-up" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 36,
          gap: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 16,
            minWidth: 0,
            flex: 1,
          }}
        >
          <button
            type="button"
            className="btn-icon"
            onClick={onBack}
            style={{ marginTop: 4 }}
            aria-label="Back"
          >
            <Icon name="arrow-left" size={16} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="eyebrow">
              {existing
                ? `${existing.status === 'active' ? 'Active' : existing.status === 'paused' ? 'Paused' : 'Draft'} · Editing`
                : 'New sequence · Draft'}
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                fontSize: 36,
                fontWeight: 400,
                letterSpacing: '-0.02em',
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: '6px 0',
                color: 'var(--ink)',
                width: '100%',
                marginTop: 4,
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 14,
                alignItems: 'center',
                marginTop: 4,
                fontSize: 13,
                color: 'var(--ink-3)',
              }}
            >
              <span>
                <Icon
                  name="mail"
                  size={12}
                  style={{ verticalAlign: '-2px', marginRight: 5 }}
                />
                {totalEmails} email{totalEmails === 1 ? '' : 's'}
              </span>
              <span style={{ color: 'var(--ink-4)' }}>·</span>
              <span>
                <Icon
                  name="clock"
                  size={12}
                  style={{ verticalAlign: '-2px', marginRight: 5 }}
                />
                ~{totalDays} day{totalDays === 1 ? '' : 's'}
              </span>
              <span style={{ color: 'var(--ink-4)' }}>·</span>
              <span
                className="chip"
                style={{ padding: '3px 9px', fontSize: 11 }}
              >
                <span className="dot" style={{ background: 'var(--ink-4)' }} />
                {savedAt
                  ? `Draft · saved ${savedAt.toLocaleTimeString()}`
                  : 'Draft'}
              </span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setPreviewing(true)}
          >
            <Icon name="play" size={12} />
            Preview flow
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSaveDraft}
            disabled={createSequence.isPending || updateSequence.isPending}
          >
            {createSequence.isPending || updateSequence.isPending
              ? 'Saving…'
              : 'Save draft'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onActivate}
          >
            <Icon name="zap" size={13} />
            Activate
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 28,
          alignItems: 'flex-start',
        }}
      >
        {/* Left column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            minWidth: 0,
          }}
        >
          {/* === 01 Basics === */}
          <FormSection
            num="01"
            title="Basics"
            subtitle="Name and description. These help you find and organise sequences later."
            status={name.trim().length > 0 ? 'complete' : 'progress'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field
                label="Internal name"
                hint="Subscribers will never see this."
              >
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label="Description" optional>
                <textarea
                  className="input"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  style={{
                    resize: 'vertical',
                    minHeight: 70,
                    fontFamily: 'inherit',
                  }}
                />
              </Field>
            </div>
          </FormSection>

          {/* === 02 Trigger === */}
          <FormSection
            num="02"
            title="Trigger"
            subtitle="The event that enrols a subscriber into this sequence."
            status="complete"
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
              {courseMode && sequenceId ? (
                <div
                  style={{
                    background: 'var(--indigo-soft)',
                    border: '1px solid var(--indigo-line)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    fontSize: 13,
                    color: 'var(--indigo-2)',
                    lineHeight: 1.5,
                  }}
                >
                  This automation is linked to
                  {course?.title ? ` "${course.title}"` : ' a course'}. Edit the
                  leading wait step below to change when it fires.
                </div>
              ) : courseMode ? (
                <CourseTriggerSection
                  choice={courseTriggerChoice}
                  onPick={onCourseTriggerPick}
                  lessons={
                    course?.modules?.flatMap((m) => m.lessons ?? []) ?? []
                  }
                  selectedLessonId={selectedLessonId}
                  onSelectLesson={setSelectedLessonId}
                  inactiveDays={inactiveDays}
                  onChangeInactiveDays={(n) => {
                    setInactiveDays(n)
                    // Keep the leading wait node in sync if the user is
                    // editing days after picking "Inactive". Without this
                    // the picker would say "10 days" but the seeded wait
                    // would still say 7.
                    if (courseTriggerChoice === 'inactive') {
                      setFlow((f) => {
                        const next = [...f.steps]
                        const lead = next[0]
                        if (
                          lead &&
                          lead.type === 'wait' &&
                          lead.value.mode === 'duration'
                        ) {
                          next[0] = {
                            ...lead,
                            value: { ...lead.value, amount: Math.max(1, n) },
                          }
                        }
                        return { ...f, steps: next }
                      })
                    }
                  }}
                  courseTitle={course?.title ?? null}
                />
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                  }}
                >
                  {TRIGGERS.map((t) => (
                    <TileOption
                      key={t.id}
                      active={trigger === t.id}
                      onClick={() => setTrigger(t.id)}
                      icon={t.icon}
                      title={t.label}
                      desc={t.desc}
                      badge={t.badge}
                    />
                  ))}
                </div>
              )}
              {!courseMode &&
                (trigger === 'on_purchase' ||
                  trigger === 'on_subscription_created') && (
                  <div
                    style={{
                      background: '#fafafa',
                      border: '1px solid var(--line)',
                      borderRadius: 12,
                      padding: 20,
                    }}
                  >
                    <Field
                      label="Triggering product"
                      hint="Enrol the buyer when this product is purchased. Pick a specific product or leave on “Any product”."
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(2, 1fr)',
                          gap: 10,
                          marginTop: 4,
                        }}
                      >
                        <ProductCard
                          active={triggerProduct === 'any'}
                          onClick={() => setTriggerProduct('any')}
                          name="Any product"
                          kind="All products"
                        />
                        {products.map((p) => (
                          <ProductCard
                            key={p.id}
                            active={triggerProduct === p.id}
                            onClick={() => setTriggerProduct(p.id)}
                            name={p.name}
                            kind={p.is_recurring ? 'Subscription' : 'One-time'}
                            coverUrl={p.medias[0]?.public_url ?? null}
                          />
                        ))}
                      </div>
                    </Field>
                  </div>
                )}
              {trigger === 'manual' && (
                <div
                  style={{
                    background: 'var(--indigo-soft)',
                    border: '1px solid var(--indigo-line)',
                    borderRadius: 12,
                    padding: '14px 18px',
                    fontSize: 13,
                    color: 'var(--indigo-2)',
                    display: 'flex',
                    gap: 10,
                  }}
                >
                  <Icon
                    name="info"
                    size={14}
                    style={{ flexShrink: 0, marginTop: 2 }}
                  />
                  <div>
                    Subscribers can be enrolled manually from the dashboard, or
                    via API call to{' '}
                    <code
                      style={{
                        fontFamily: 'JetBrains Mono, monospace',
                        background: 'rgba(255,255,255,0.6)',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      POST /v1/email-sequences/{'{id}'}/enrollments
                    </code>
                    .
                  </div>
                </div>
              )}
            </div>
          </FormSection>

          {/* === 03 Audience === */}
          <FormSection
            num="03"
            title="Audience filter"
            subtitle="Restrict who can be enrolled, even if the trigger fires."
            status="progress"
          >
            <Field label="Who is eligible?">
              <SegmentedControl
                value={flow.audience.mode}
                onChange={(m) =>
                  upd({ audience: { ...flow.audience, mode: m } })
                }
                options={[
                  { id: 'all', label: 'Everyone who matches the trigger' },
                  { id: 'filtered', label: 'Only subscribers who match…' },
                ]}
              />
            </Field>

            {flow.audience.mode === 'filtered' && (
              <div
                style={{
                  marginTop: 18,
                  padding: 18,
                  background: '#fafafa',
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                {flow.audience.filters.map((f, i) => (
                  <div
                    key={f.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '40px 1fr 140px 1fr 32px',
                      gap: 8,
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--ink-3)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {i === 0 ? 'Where' : 'And'}
                    </span>
                    <SelectField
                      value={
                        f.field as
                          | 'country'
                          | 'tag'
                          | 'engagement'
                          | 'subscribed-for'
                          | 'source'
                      }
                      onChange={(v) =>
                        upd({
                          audience: {
                            ...flow.audience,
                            filters: flow.audience.filters.map((x) =>
                              x.id === f.id ? { ...x, field: v } : x,
                            ),
                          },
                        })
                      }
                      options={[
                        { id: 'country', label: 'Country' },
                        { id: 'tag', label: 'Has tag' },
                        { id: 'engagement', label: 'Engagement score' },
                        { id: 'subscribed-for', label: 'Subscribed for' },
                        { id: 'source', label: 'Signup source' },
                      ]}
                    />
                    <SelectField
                      value={f.op as 'is' | 'is-not' | 'contains' | 'gte'}
                      onChange={(v) =>
                        upd({
                          audience: {
                            ...flow.audience,
                            filters: flow.audience.filters.map((x) =>
                              x.id === f.id ? { ...x, op: v } : x,
                            ),
                          },
                        })
                      }
                      options={[
                        { id: 'is', label: 'is' },
                        { id: 'is-not', label: 'is not' },
                        { id: 'contains', label: 'contains' },
                        { id: 'gte', label: 'is at least' },
                      ]}
                    />
                    <input
                      className="input"
                      value={f.value}
                      onChange={(e) =>
                        upd({
                          audience: {
                            ...flow.audience,
                            filters: flow.audience.filters.map((x) =>
                              x.id === f.id
                                ? { ...x, value: e.target.value }
                                : x,
                            ),
                          },
                        })
                      }
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        color: 'var(--red)',
                      }}
                      onClick={() =>
                        upd({
                          audience: {
                            ...flow.audience,
                            filters: flow.audience.filters.filter(
                              (x) => x.id !== f.id,
                            ),
                          },
                        })
                      }
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ alignSelf: 'flex-start', marginTop: 4 }}
                  onClick={() =>
                    upd({
                      audience: {
                        ...flow.audience,
                        filters: [
                          ...flow.audience.filters,
                          {
                            id: newBlockId(),
                            field: 'tag',
                            op: 'is',
                            value: '',
                          },
                        ],
                      },
                    })
                  }
                >
                  <Icon name="plus" size={11} />
                  Add condition
                </button>
              </div>
            )}

            <div className="divider" style={{ margin: '22px 0' }} />

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
            >
              <SettingRow
                label="Skip if already in another sequence"
                hint="Prevent the same subscriber being in this and another sequence at once."
                control={
                  <Toggle
                    on={flow.send.skipIfInOther}
                    onChange={(v) =>
                      upd({ send: { ...flow.send, skipIfInOther: v } })
                    }
                  />
                }
              />
              <SettingRow
                label="Exclude tags"
                hint="Subscribers with any of these tags will not be enrolled."
                control={
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    {flow.audience.excludeTags.map((t) => (
                      <span
                        key={t}
                        className="chip"
                        style={{
                          background: 'var(--red-soft)',
                          color: 'var(--red)',
                          borderColor: 'transparent',
                          fontSize: 11.5,
                        }}
                      >
                        {t}
                        <button
                          type="button"
                          onClick={() =>
                            upd({
                              audience: {
                                ...flow.audience,
                                excludeTags: flow.audience.excludeTags.filter(
                                  (x) => x !== t,
                                ),
                              },
                            })
                          }
                          style={{
                            marginLeft: 4,
                            opacity: 0.7,
                            lineHeight: 0,
                          }}
                        >
                          <Icon name="x-circle" size={11} />
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11.5 }}
                      onClick={async () => {
                        const t = await dialogs.prompt({
                          title: 'Exclude a tag',
                          message:
                            'Subscribers carrying this tag will be skipped.',
                          placeholder: 'engaged',
                          validate: (v) => {
                            const trimmed = v.trim()
                            if (!trimmed) return 'Tag cannot be empty.'
                            if (trimmed.length > 64)
                              return 'Tag is too long (max 64 chars).'
                            if (flow.audience.excludeTags.includes(trimmed))
                              return 'That tag is already excluded.'
                            return null
                          },
                        })
                        if (t)
                          upd({
                            audience: {
                              ...flow.audience,
                              excludeTags: [
                                ...flow.audience.excludeTags,
                                t.trim(),
                              ],
                            },
                          })
                      }}
                    >
                      <Icon name="plus" size={11} />
                      Add tag
                    </button>
                  </div>
                }
              />
            </div>
          </FormSection>

          {/* === 04 Steps === */}
          <FormSection
            num="04"
            title="Sequence steps"
            subtitle={`${flow.steps.length} step${flow.steps.length === 1 ? '' : 's'} · drag to reorder. Each email opens in the visual editor.`}
            status={flow.steps.length === 0 ? 'progress' : 'progress'}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {flow.steps.length === 0 && (
                <div
                  style={{
                    border: '1.5px dashed var(--line-2)',
                    borderRadius: 14,
                    padding: '28px 24px',
                    color: 'var(--ink-3)',
                    fontSize: 13,
                    textAlign: 'center',
                  }}
                >
                  No steps yet — add an email, wait, branch, action, or goal
                  below.
                </div>
              )}
              <StepList
                steps={flow.steps}
                parentBranchId={null}
                arm={null}
                expandedId={expandedId}
                draggingId={draggingId}
                productOptions={productOptions}
                sequenceOptions={sequenceOptions}
                lessonOptions={lessonOptions}
                moduleOptions={moduleOptions}
                courseMode={courseMode}
                setEditingEmailId={setEditingEmailId}
                setExpandedId={setExpandedId}
                setDraggingId={setDraggingId}
                handleDragOver={handleDragOver}
                updateStep={updateStep}
                addStep={addStep}
                removeStep={removeStep}
                duplicateStep={duplicateStep}
                moveStep={moveStep}
              />
            </div>
            {/* StepList renders its own AddStepDock at every level (root and
                each branch arm) so we no longer need a separate dock here. */}
          </FormSection>

          {/* === 05 Goal === */}
          <FormSection
            num="05"
            title="Conversion goal"
            subtitle="When this happens, count it as a conversion and exit the subscriber from the sequence."
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              <Field label="Goal event">
                <SelectField
                  value={flow.goal.event}
                  onChange={(ev) => upd({ goal: { ...flow.goal, event: ev } })}
                  options={[
                    { id: 'module-1-started', label: 'Season 1 started' },
                    { id: 'module-1-completed', label: 'Season 1 completed' },
                    { id: 'product-purchased', label: 'Product purchased' },
                    { id: 'link-clicked', label: 'Email link clicked' },
                    { id: 'tag-added', label: 'Tag added' },
                    { id: 'none', label: 'No goal — just send' },
                  ]}
                />
              </Field>
              <Field
                label="Window"
                hint="How long after enrolment to track the goal."
              >
                <SegmentedControl
                  value={flow.goal.window}
                  onChange={(w) => upd({ goal: { ...flow.goal, window: w } })}
                  options={[
                    { id: '7', label: '7 days' },
                    { id: '14', label: '14 days' },
                    { id: '30', label: '30 days' },
                    { id: 'forever', label: 'Always' },
                  ]}
                />
              </Field>
            </div>
          </FormSection>

          {/* === 06 Settings === */}
          <FormSection
            num="06"
            title="Send settings"
            subtitle="When and how often subscribers receive the emails."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="Send window">
                <SegmentedControl
                  value={flow.send.window}
                  onChange={(w) => upd({ send: { ...flow.send, window: w } })}
                  options={[
                    { id: 'anytime', label: 'Any time' },
                    { id: 'daily', label: 'Every day · 9–5' },
                    { id: 'weekdays', label: 'Mon–Fri · 9–5' },
                    { id: 'custom', label: 'Custom' },
                  ]}
                />
              </Field>
              {flow.send.window === 'custom' && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                  }}
                >
                  <Field label="Earliest">
                    <input
                      className="input"
                      type="time"
                      value={flow.send.start}
                      onChange={(e) =>
                        upd({
                          send: { ...flow.send, start: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label="Latest">
                    <input
                      className="input"
                      type="time"
                      value={flow.send.end}
                      onChange={(e) =>
                        upd({
                          send: { ...flow.send, end: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
              )}
              <SettingRow
                label="Send in subscriber's timezone"
                hint="If we know it. Falls back to UTC otherwise."
                control={
                  <Toggle
                    on={flow.send.respectTimezone}
                    onChange={(v) =>
                      upd({
                        send: { ...flow.send, respectTimezone: v },
                      })
                    }
                  />
                }
              />
              <SettingRow
                label="Pause if subscriber unsubscribes"
                hint="Stop all in-flight emails immediately on unsub."
                control={
                  <Toggle
                    on={flow.send.pauseOnUnsub}
                    onChange={(v) =>
                      upd({ send: { ...flow.send, pauseOnUnsub: v } })
                    }
                  />
                }
              />
              <SettingRow
                label="Skip if in another active sequence"
                hint="Subscriber must be enrolled in only one at a time."
                control={
                  <Toggle
                    on={flow.send.skipIfInOther}
                    onChange={(v) =>
                      upd({ send: { ...flow.send, skipIfInOther: v } })
                    }
                  />
                }
              />
              <SettingRow
                label="Respect frequency cap (3 / week)"
                hint="Won't send if it would exceed the workspace-wide cap."
                control={
                  <Toggle
                    on={flow.send.frequencyCap}
                    onChange={(v) =>
                      upd({ send: { ...flow.send, frequencyCap: v } })
                    }
                  />
                }
              />
            </div>
          </FormSection>

          {/* Final actions */}
          <div
            className="card"
            style={{
              padding: '22px 28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              background: 'linear-gradient(180deg, #fafafa 0%, #fff 100%)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: 'var(--green-soft)',
                  color: 'var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="check-circle" size={15} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 14,
                    color: 'var(--ink)',
                    fontWeight: 500,
                  }}
                >
                  Ready to activate
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  Sequence will start enrolling subscribers immediately on save.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onSaveDraft}
              >
                Save as draft
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onActivate}
              >
                <Icon name="zap" size={13} />
                Activate sequence
              </button>
            </div>
          </div>
        </div>

      </div>

      {editingEmail && (
        <SequenceEmailComposerModal
          organization={organization}
          step={editingEmail}
          emailNum={
            // Tree-aware ordinal: pre-order walk counts nested emails too,
            // including those inside branch arms (audit issue #7 follow-on
            // — flat-array slice undercounted once nested authoring landed).
            (() => {
              const target = editingEmail.id
              let n = 0
              const visit = (nodes: StepNode[]): boolean => {
                for (const node of nodes) {
                  if (node.type === 'email') {
                    n += 1
                    if (node.id === target) return true
                  }
                  if (node.type === 'branch') {
                    if (visit(node.yes)) return true
                    if (visit(node.no)) return true
                  }
                }
                return false
              }
              visit(flow.steps)
              return n
            })()
          }
          sequenceName={name}
          onChange={(v) => updateStep(editingEmail.id, 'email', v)}
          onClose={() => setEditingEmailId(null)}
          onSendTest={async (email) => {
            const id = await ensurePersisted()
            await syncEmailSteps(id)
            // Look up the server step by stable flow_step_id rather than
            // the previous ordinal-against-stale-snapshot dance (audit
            // issue #20). syncEmailSteps already invalidated the cache.
            const fresh = await queryClient.fetchQuery<ServerStep[]>({
              queryKey: ['email_sequence_steps', id],
            })
            const target = fresh.find((s) => s.flow_step_id === editingEmail.id)
            if (target) {
              await sendTestMutation.mutateAsync({
                sequenceId: id,
                stepId: target.id,
                email,
              })
            }
          }}
        />
      )}
    </div>
  )
}

// ── Course trigger picker ──────────────────────────────────────────────────
// Rendered in place of the generic 3x2 TRIGGERS grid when the editor is
// opened from a course's Automations panel. Speaks course-language; under
// the hood every choice maps to on_purchase + a leading wait shape in the
// flow_doc (see seedFlowForCourseTrigger).
const CourseTriggerSection = ({
  choice,
  onPick,
  lessons,
  selectedLessonId,
  onSelectLesson,
  inactiveDays,
  onChangeInactiveDays,
  courseTitle,
}: {
  choice: CourseTriggerChoice | null
  onPick: (choice: CourseTriggerChoice) => void
  lessons: { id: string; title: string | null }[]
  selectedLessonId: string | undefined
  onSelectLesson: (id: string) => void
  inactiveDays: number
  onChangeInactiveDays: (n: number) => void
  courseTitle: string | null
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--ink-3)',
          lineHeight: 1.5,
        }}
      >
        Pick a moment in the student&rsquo;s journey through
        {courseTitle ? ` "${courseTitle}"` : ' this course'}. The automation
        enrols every buyer on purchase and waits for the moment you pick before
        sending.
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {COURSE_TRIGGER_TILES.map((t) => (
          <TileOption
            key={t.id}
            active={choice === t.id}
            onClick={() => onPick(t.id)}
            icon={t.icon}
            title={t.label}
            desc={t.desc}
            badge={null}
          />
        ))}
      </div>

      {choice === 'lesson_completed' && (
        <div
          style={{
            background: '#fafafa',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <Field
            label="Which lesson?"
            hint="Fires when a student marks this lesson complete."
          >
            <SelectField
              value={selectedLessonId ?? ''}
              onChange={(v) => onSelectLesson(v)}
              placeholder="Choose a lesson…"
              options={lessons.map((l) => ({
                id: l.id,
                label: l.title ?? 'Untitled lesson',
              }))}
            />
          </Field>
        </div>
      )}

      {choice === 'inactive' && (
        <div
          style={{
            background: '#fafafa',
            border: '1px solid var(--line)',
            borderRadius: 12,
            padding: 20,
          }}
        >
          <Field
            label="Days of inactivity"
            hint="Sent this many days after the student enrolled if they haven't been around."
          >
            <input
              type="number"
              min={1}
              max={365}
              value={inactiveDays}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!Number.isFinite(n)) return
                onChangeInactiveDays(Math.max(1, Math.min(365, n)))
              }}
              className="input"
              style={{ maxWidth: 160 }}
            />
          </Field>
        </div>
      )}
    </div>
  )
}

const ProductCard = ({
  active,
  onClick,
  name,
  kind,
  coverUrl,
}: {
  active: boolean
  onClick: () => void
  name: string
  kind: string
  coverUrl?: string | null
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`option-card ${active ? 'is-active' : ''}`}
    style={{
      padding: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      textAlign: 'left',
    }}
  >
    {coverUrl ? (
      <img
        src={coverUrl}
        alt=""
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          objectFit: 'cover',
          flexShrink: 0,
          border: '1px solid var(--line)',
        }}
      />
    ) : (
      <div
        className="cover-placeholder"
        style={{ width: 42, height: 42, borderRadius: 8 }}
      />
    )}
    <div style={{ flex: 1, minWidth: 0 }}>
      <div
        style={{
          fontSize: 13.5,
          fontWeight: 500,
          color: 'var(--ink)',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {name}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ink-3)', marginTop: 3 }}>
        {kind}
      </div>
    </div>
    <span className="option-card-radio" />
  </button>
)

// — Email content editor modal (BlockEditor reused from broadcasts).
// Fullscreen sequence email composer — hosts the broadcast Composer in
// embedded mode, so editing an email step inside a sequence reuses the
// same template gallery, block palette, and inspector as standalone
// broadcasts. Mirrors the design's sequence-email-composer modal.
const SequenceEmailComposerModal = ({
  organization,
  step,
  emailNum,
  sequenceName,
  onChange,
  onClose,
  onSendTest,
}: {
  organization: schemas['Organization']
  step: Extract<StepNode, { type: 'email' }>
  emailNum: number
  sequenceName: string
  onChange: (v: EmailStepValue) => void
  onClose: () => void
  onSendTest: (email: string) => Promise<void>
}) => {
  const [doc, setDoc] = useState<ContentDoc>(() =>
    adoptContentJson(step.value.content_json),
  )
  const [subject, setSubject] = useState(step.value.subject)
  const [preview, setPreview] = useState(step.value.preview)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>(
    'idle',
  )
  const [testEmail, setTestEmail] = useState('')
  const [testStatus, setTestStatus] = useState<
    'idle' | 'sending' | 'sent' | 'error'
  >('idle')
  const [showTestField, setShowTestField] = useState(false)
  const upload = useUploadSequenceImage(organization.id)

  // Lock body scroll while open + Esc / ⌘S shortcuts.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        triggerSave(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose])

  const persist = () => {
    const html = renderBlocksToHtml(doc)
    onChange({
      ...step.value,
      subject,
      preview,
      content_html: html,
      content_json: doc as unknown as Record<string, unknown>,
    })
  }

  const triggerSave = (close = false) => {
    setSaveStatus('saving')
    persist()
    // Tiny artificial settle so the indicator visibly transitions.
    window.setTimeout(() => {
      setSaveStatus('saved')
      if (close) {
        window.setTimeout(onClose, 250)
      } else {
        window.setTimeout(() => setSaveStatus('idle'), 1800)
      }
    }, 300)
  }

  // Portal to <body> so the modal escapes the dashboard's stacking
  // context and the .spaire-email-app `zoom: 0.9` scale. Wrapping it
  // back in a `.spaire-email-app` host preserves the scoped CSS used
  // throughout the modal (`.btn`, `.input`, `.modal-fade-in`,
  // `--ink-*` tokens, …). Without this the modal mounted but was
  // hidden behind ancestor layers and the editor looked "dead".
  if (typeof window === 'undefined') return null
  return createPortal(
    <div className="spaire-email-app">
      <div
        className="modal-fade-in"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: 'rgba(15,23,42,0.45)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flexShrink: 0,
            background: '#fff',
            borderBottom: '1px solid var(--line)',
            padding: '14px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              minWidth: 0,
              flex: 1,
            }}
          >
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              title="Close (Esc)"
            >
              <Icon name="x" size={16} />
            </button>
            <div style={{ height: 24, width: 1, background: 'var(--line)' }} />
            <div style={{ minWidth: 0 }}>
              <div className="eyebrow" style={{ marginBottom: 2 }}>
                {sequenceName} · Email {String(emailNum).padStart(2, '0')}
              </div>
              <div
                style={{
                  fontSize: 14.5,
                  color: 'var(--ink)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 480,
                }}
              >
                {subject || 'Untitled email'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                fontSize: 12,
                color: saveStatus === 'saved' ? 'var(--green)' : 'var(--ink-3)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'color 0.2s',
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background:
                    saveStatus === 'saved' ? 'var(--green)' : 'var(--ink-4)',
                }}
              />
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved'
                  : 'Auto-saving'}
            </span>
            {showTestField ? (
              <>
                <input
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={testEmail}
                  onChange={(e) => {
                    setTestEmail(e.target.value)
                    setTestStatus('idle')
                  }}
                  style={{ width: 200, fontSize: 12 }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={!testEmail.trim() || testStatus === 'sending'}
                  onClick={async () => {
                    setTestStatus('sending')
                    try {
                      persist()
                      await onSendTest(testEmail.trim())
                      setTestStatus('sent')
                    } catch {
                      setTestStatus('error')
                    }
                  }}
                >
                  <Icon name="send" size={12} />
                  {testStatus === 'sending'
                    ? 'Sending…'
                    : testStatus === 'sent'
                      ? 'Sent ✓'
                      : testStatus === 'error'
                        ? 'Failed'
                        : 'Send'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowTestField(false)
                    setTestStatus('idle')
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowTestField(true)}
              >
                <Icon name="send" size={12} />
                Send test
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => triggerSave(true)}
            >
              <Icon name="check" size={12} />
              Save & update sequence
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            background: '#f0f0f3',
            padding: '24px 24px 48px',
          }}
        >
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <BroadcastEditor
              embedded
              doc={doc}
              setDoc={setDoc}
              uploadImage={async (file) => (await upload.mutateAsync(file)).url}
              sender={{
                name: step.value.fromName,
                email: step.value.fromEmail,
              }}
              subject={subject}
              onSubjectChange={setSubject}
              previewText={preview}
              onPreviewTextChange={setPreview}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

// — When the email step has no authored content_html, render a minimal one
// from subject + preview so the worker has something to send.
const renderEmailFallback = (v: EmailStepValue): string => {
  const safeSubject = (v.subject ?? '').replace(/</g, '&lt;')
  const safePreview = (v.preview ?? '').replace(/</g, '&lt;')
  return `<h2>${safeSubject}</h2><p>${safePreview}</p>`
}

export const NewSequenceRoute = ({
  organization,
  sequenceId,
}: {
  organization: schemas['Organization']
  sequenceId: string | null
}) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const base = `/dashboard/${organization.slug}/email-marketing/sequences`

  const embed = searchParams.get('embed') === '1'
  const courseId = searchParams.get('course_id') ?? undefined
  const lessonId = searchParams.get('lesson_id') ?? undefined

  const handleBack = () => {
    if (embed && typeof window !== 'undefined') {
      // Posted from the iframe to the host page so the modal can close
      // and refresh its sequence list. Hosts listen on window 'message'.
      window.parent.postMessage(
        { type: 'spaire.sequence-editor.close' },
        window.location.origin,
      )
      return
    }
    router.push(base)
  }

  return (
    <FeatureGate
      feature="email_sequences_and_segments"
      organizationId={organization.id}
      organizationSlug={organization.slug}
    >
      {embed ? (
        <style>{`
          [data-dashboard-sidebar],
          [data-dashboard-mobile-nav],
          [data-email-marketing-chrome] { display: none !important; }
          .spaire-email-app .container { max-width: none; padding: 0 !important; }
        `}</style>
      ) : null}
      <NewSequenceScreen
        organization={organization}
        sequenceId={sequenceId}
        courseId={courseId}
        lessonId={lessonId}
        onBack={handleBack}
        onOpened={(id) => {
          if (sequenceId !== id) {
            // Preserve embed + scoping params so the URL stays consistent
            // for any refresh inside the iframe.
            const next = new URLSearchParams()
            if (embed) next.set('embed', '1')
            if (courseId) next.set('course_id', courseId)
            if (lessonId) next.set('lesson_id', lessonId)
            const qs = next.toString()
            router.replace(`${base}/${id}/edit${qs ? `?${qs}` : ''}`)
          }
        }}
      />
    </FeatureGate>
  )
}

// ── Recursive step list ──────────────────────────────────────────────────────
// Renders the editor's step cards. Each branch's yes/no arms render a nested
// StepList (with their own "+ add step" affordances) so authoring multi-step
// arms and nested branches works natively (audit issue #7).

type StepListProps = {
  steps: StepNode[]
  parentBranchId: string | null
  arm: 'yes' | 'no' | null
  expandedId: string | null
  draggingId: string | null
  productOptions: { id: string; label: string }[]
  sequenceOptions: { id: string; label: string }[]
  lessonOptions: { id: string; label: string }[]
  moduleOptions: { id: string; label: string }[]
  courseMode: boolean
  setEditingEmailId: (id: string | null) => void
  setExpandedId: (id: string | null) => void
  setDraggingId: (id: string | null) => void
  handleDragOver: (overId: string) => void
  // Non-generic form here so the prop type doesn't need to unify the
  // generic instantiation; consumers cast at the call site.
  updateStep: (
    id: string,
    type: StepNode['type'],
    value: StepNode['value'],
  ) => void
  addStep: (
    type: StepNode['type'],
    parentBranchId?: string | null,
    arm?: 'yes' | 'no' | null,
  ) => void
  removeStep: (id: string) => void
  duplicateStep: (id: string) => void
  moveStep: (id: string, dir: -1 | 1) => void
}

const StepList = (props: StepListProps) => {
  const {
    steps,
    parentBranchId,
    arm,
    expandedId,
    draggingId,
    productOptions,
    sequenceOptions,
    lessonOptions,
    moduleOptions,
    courseMode,
    setEditingEmailId,
    setExpandedId,
    setDraggingId,
    handleDragOver,
    updateStep,
    addStep,
    removeStep,
    duplicateStep,
    moveStep,
  } = props
  return (
    <>
      {steps.map((step, idx) => {
        const expanded = expandedId === step.id
        return (
          <div key={step.id}>
            <StepCard
              type={step.type}
              dragging={draggingId === step.id}
              onDragStart={() => setDraggingId(step.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={() => handleDragOver(step.id)}
              onDrop={() => setDraggingId(null)}
              title={stepTitle(step)}
              summary={stepSummary(step)}
              expanded={expanded}
              onToggleExpand={() => setExpandedId(expanded ? null : step.id)}
              onRemove={() => removeStep(step.id)}
              onDuplicate={() => duplicateStep(step.id)}
              onMove={(dir) => moveStep(step.id, dir)}
              canMoveUp={idx > 0}
              canMoveDown={idx < steps.length - 1}
            >
              {step.type === 'email' && (
                <EmailStepBody
                  value={step.value}
                  onChange={(v) =>
                    updateStep(step.id, 'email', v as EmailStepValue)
                  }
                  onOpenEditor={() => setEditingEmailId(step.id)}
                />
              )}
              {step.type === 'wait' && (
                <WaitStepBody
                  value={step.value}
                  onChange={(v) =>
                    updateStep(step.id, 'wait', v as WaitStepValue)
                  }
                />
              )}
              {step.type === 'branch' && (
                <BranchStepBody
                  value={step.value}
                  onChange={(v) =>
                    updateStep(step.id, 'branch', v as BranchStepValue)
                  }
                  productOptions={productOptions}
                  lessonOptions={lessonOptions}
                  moduleOptions={moduleOptions}
                  courseMode={courseMode}
                />
              )}
              {step.type === 'action' && (
                <ActionStepBody
                  value={step.value}
                  onChange={(v) =>
                    updateStep(step.id, 'action', v as ActionStepValue)
                  }
                  sequenceOptions={sequenceOptions}
                />
              )}
              {step.type === 'goal' && (
                <GoalStepBody
                  value={step.value}
                  onChange={(v) =>
                    updateStep(step.id, 'goal', v as GoalStepValue)
                  }
                />
              )}
            </StepCard>

            {step.type === 'branch' && (
              <BranchArms
                branchId={step.id}
                yes={step.yes}
                no={step.no}
                listProps={props}
              />
            )}
          </div>
        )
      })}

      <AddStepDock
        parentBranchId={parentBranchId}
        arm={arm}
        onAdd={(type) => addStep(type, parentBranchId, arm)}
      />
    </>
  )
}

const BranchArms = ({
  branchId,
  yes,
  no,
  listProps,
}: {
  branchId: string
  yes: StepNode[]
  no: StepNode[]
  listProps: StepListProps
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 16,
      marginTop: 12,
      marginBottom: 12,
      paddingLeft: 24,
      borderLeft: '2px dashed var(--indigo-line)',
    }}
  >
    <BranchArmColumn
      label="Yes"
      tone="success"
      branchId={branchId}
      arm="yes"
      steps={yes}
      listProps={listProps}
    />
    <BranchArmColumn
      label="No"
      tone="muted"
      branchId={branchId}
      arm="no"
      steps={no}
      listProps={listProps}
    />
  </div>
)

const BranchArmColumn = ({
  label,
  tone,
  branchId,
  arm,
  steps,
  listProps,
}: {
  label: 'Yes' | 'No'
  tone: 'success' | 'muted'
  branchId: string
  arm: 'yes' | 'no'
  steps: StepNode[]
  listProps: StepListProps
}) => {
  const palette = {
    success: {
      bg: 'var(--green-soft)',
      color: 'var(--green)',
      border: 'rgba(26,122,62,0.25)',
    },
    muted: {
      bg: 'var(--bg-softer)',
      color: 'var(--ink-3)',
      border: 'var(--line-2)',
    },
  } as const
  const p = palette[tone]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span
        style={{
          alignSelf: 'flex-start',
          padding: '3px 10px',
          borderRadius: 999,
          fontSize: 11,
          background: p.bg,
          color: p.color,
          border: `1px solid ${p.border}`,
        }}
      >
        {label}
      </span>
      <StepList
        {...listProps}
        steps={steps}
        parentBranchId={branchId}
        arm={arm}
      />
    </div>
  )
}

const AddStepDock = ({
  parentBranchId,
  arm,
  onAdd,
}: {
  parentBranchId: string | null
  arm: 'yes' | 'no' | null
  onAdd: (type: StepNode['type']) => void
}) => (
  <div
    style={{
      marginTop: 12,
      padding: 10,
      border: '1px dashed var(--line-2)',
      borderRadius: 10,
      background: '#fafafa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    }}
  >
    <span style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>
      {parentBranchId == null
        ? 'Add a step'
        : `Add to ${arm === 'yes' ? 'Yes' : 'No'} arm`}
    </span>
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {(
        [
          { t: 'email', icon: 'mail', label: 'Email' },
          { t: 'wait', icon: 'clock', label: 'Wait' },
          { t: 'branch', icon: 'split', label: 'Branch' },
          { t: 'action', icon: 'tag', label: 'Action' },
          { t: 'goal', icon: 'target', label: 'Goal' },
        ] as const
      ).map((b) => (
        <button
          key={b.t}
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onAdd(b.t)}
        >
          <Icon name={b.icon} size={11} />
          {b.label}
        </button>
      ))}
    </div>
  </div>
)
