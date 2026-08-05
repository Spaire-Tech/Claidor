// Sequence flow document — the canonical client-side representation of a
// sequence's authored content. We persist this whole tree via
// `trigger_config.flow_doc` on the EmailSequence row, and additionally
// materialize email steps as real `EmailSequenceStep` rows so the worker
// (which today walks linear email steps with a delay_hours) keeps working.
//
// The full set of step types — wait / branch / action / goal — is rendered
// and authored in the UI but interpreted today as visual-only structure;
// the worker will gain branch/action/goal handling in a follow-up.

export type StepId = string

export type EmailStepValue = {
  subject: string
  preview: string
  fromName: string
  fromEmail: string
  template: 'blank' | 'plain' | 'announcement' | 'product' | 'digest'
  abTest: boolean
  trackClicks: boolean
  // Mirror of authored block content (optional; if present we render it via
  // the email worker, otherwise fall back to a plain wrapper).
  content_html?: string | null
  content_json?: Record<string, unknown> | null
}

export type WaitStepValue = {
  mode: 'duration' | 'until-time' | 'until-event'
  amount: number
  unit: 'min' | 'hour' | 'day' | 'week'
  dayOffset?: 'next' | '+2' | '+3' | '+7'
  time?: string
  event?: string
}

export type BranchStepValue = {
  field:
    | 'opened-prev'
    | 'clicked-prev'
    | 'has-tag'
    | 'product-bought'
    | 'engagement'
    // Course-progress family — only meaningful when the sequence is
    // linked to a course (sequence.course_id is set). The editor hides
    // these options outside of course-mode authoring.
    | 'lesson-completed'
    | 'module-completed'
    | 'course-progress'
    | 'course-completed-within'
  tag?: string
  product?: string
  // `op` is overloaded across branch types:
  //   engagement       → 'gte' | 'lte' | 'eq'         (threshold comparison)
  //   course-progress  → 'gte' | 'lte' | 'eq'         (percent comparison)
  //   course-completed-within
  //                    → 'within' | 'over'            (fast vs slow completer)
  op?: 'gte' | 'lte' | 'eq' | 'within' | 'over'
  threshold?: number
  // Course-progress branch fields.
  lesson?: string
  module?: string
  days?: number
}

export type ActionStepValue = {
  action:
    | 'add-tag'
    | 'remove-tag'
    | 'update-field'
    | 'enroll'
    | 'webhook'
    | 'notify'
  tag?: string
  sequence?: string
  url?: string
  // update-field key/value pair, persisted on the subscriber's
  // custom_fields. Empty key is treated as a no-op by the worker.
  key?: string
  value?: string
}

export type GoalStepValue = {
  event: string
}

/**
 * The flow document's structural shape.
 *
 * Until phase 3b a `branch` was a flat node followed by exactly two adjacent
 * siblings — `steps[i+1]` was the Yes path, `steps[i+2]` was No, the engine
 * advanced past `i+3`. That heuristic forbade two-step arms, nested branches,
 * and waits between a branch and its arm; `materializeEmailsFromFlow` and
 * `SequenceFlowPreview` both leaked it.
 *
 * Now branches are real subtrees — `yes` and `no` are full `StepNode[]`,
 * each child can itself be any step type including another branch. Empty
 * arrays mean "no-op on that arm, fall through to after-branch".
 */
export type BranchChildren = {
  yes: StepNode[]
  no: StepNode[]
}

export type StepNode =
  | { id: StepId; type: 'email'; value: EmailStepValue }
  | { id: StepId; type: 'wait'; value: WaitStepValue }
  | {
      id: StepId
      type: 'branch'
      value: BranchStepValue
      yes: StepNode[]
      no: StepNode[]
    }
  | { id: StepId; type: 'action'; value: ActionStepValue }
  | { id: StepId; type: 'goal'; value: GoalStepValue }

export type FlowDoc = {
  version: 1
  category: string
  audience: AudienceConfig
  goal: { event: string; window: '7' | '14' | '30' | 'forever' }
  send: {
    window: 'anytime' | 'daily' | 'weekdays' | 'custom'
    start: string
    end: string
    respectTimezone: boolean
    pauseOnUnsub: boolean
    skipIfInOther: boolean
    frequencyCap: boolean
  }
  steps: StepNode[]
}

export type AudienceConfig = {
  mode: 'all' | 'filtered'
  // Filter row id is opaque; new rows mint a UUID so two clicks within the
  // same millisecond don't collide (audit issue #12 — `Date.now()` keys
  // could produce duplicates and break React reconciliation).
  filters: { id: string; field: string; op: string; value: string }[]
  excludeTags: string[]
}

export const newId = (): StepId =>
  `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const DEFAULT_STEP_VALUES = {
  email: (): EmailStepValue => ({
    subject: 'Welcome — you’re in',
    preview: 'A quick note about what to expect over the next few days.',
    fromName: 'Spaire',
    fromEmail: 'hello@yoursite.com',
    template: 'plain',
    abTest: false,
    trackClicks: true,
  }),
  wait: (): WaitStepValue => ({
    mode: 'duration',
    amount: 1,
    unit: 'day',
    dayOffset: 'next',
    time: '09:00',
    event: 'module-1-started',
  }),
  branch: (): BranchStepValue => ({ field: 'opened-prev' }),
  action: (): ActionStepValue => ({
    action: 'add-tag',
    tag: 'sequence-completed',
  }),
  goal: (): GoalStepValue => ({ event: 'module-1-started' }),
}

/**
 * Construct a fresh StepNode of the given type, including the empty
 * `yes`/`no` children for branches.
 */
export const blankStepNode = (
  type: 'email' | 'wait' | 'branch' | 'action' | 'goal',
): StepNode => {
  if (type === 'branch') {
    return {
      id: newId(),
      type: 'branch',
      value: DEFAULT_STEP_VALUES.branch(),
      yes: [],
      no: [],
    }
  }
  if (type === 'email') {
    return { id: newId(), type: 'email', value: DEFAULT_STEP_VALUES.email() }
  }
  if (type === 'wait') {
    return { id: newId(), type: 'wait', value: DEFAULT_STEP_VALUES.wait() }
  }
  if (type === 'action') {
    return { id: newId(), type: 'action', value: DEFAULT_STEP_VALUES.action() }
  }
  return { id: newId(), type: 'goal', value: DEFAULT_STEP_VALUES.goal() }
}

export const DEFAULT_FLOW_DOC = (): FlowDoc => ({
  version: 1,
  category: 'onboarding',
  audience: {
    mode: 'all',
    filters: [],
    excludeTags: [],
  },
  goal: { event: 'none', window: '14' },
  send: {
    window: 'weekdays',
    start: '09:00',
    end: '17:00',
    respectTimezone: true,
    pauseOnUnsub: true,
    skipIfInOther: true,
    frequencyCap: true,
  },
  steps: [],
})

export const stepTitle = (step: StepNode): string => {
  if (step.type === 'email') return step.value.subject || 'Untitled email'
  if (step.type === 'wait') {
    const v = step.value
    if (v.mode === 'duration')
      return `Wait ${v.amount} ${v.unit}${v.amount > 1 ? 's' : ''}`
    if (v.mode === 'until-time') return `Wait until ${v.time ?? '09:00'}`
    return 'Wait until event'
  }
  if (step.type === 'branch') {
    return `If ${BRANCH_FIELD_LABEL[step.value.field] ?? step.value.field}`
  }
  if (step.type === 'action') {
    return ACTION_LABEL[step.value.action] ?? 'Action'
  }
  return `Goal: ${step.value.event}`
}

export const stepSummary = (step: StepNode): string => {
  if (step.type === 'email') return step.value.template
  if (step.type === 'wait' && step.value.mode === 'duration')
    return `${step.value.amount} ${step.value.unit}`
  return ''
}

export const BRANCH_FIELD_LABEL: Record<string, string> = {
  'opened-prev': 'opened previous email',
  'clicked-prev': 'clicked previous email',
  'has-tag': 'has tag',
  'product-bought': 'bought product',
  engagement: 'engagement score',
  'lesson-completed': 'completed lesson',
  'module-completed': 'completed module',
  'course-progress': 'course progress',
  'course-completed-within': 'course completion time',
}

export const ACTION_LABEL: Record<string, string> = {
  'add-tag': 'Add tag',
  'remove-tag': 'Remove tag',
  'update-field': 'Update custom field',
  enroll: 'Enrol in another sequence',
  webhook: 'Send webhook',
  notify: 'Notify team via Slack',
}

// Convert wait amount/unit to hours for materialized EmailSequenceStep rows.
export const waitToHours = (v: WaitStepValue): number => {
  if (v.mode !== 'duration') return 0
  const amount = Number.isFinite(v.amount) ? Math.max(0, Number(v.amount)) : 0
  switch (v.unit) {
    case 'min':
      return Math.round((amount / 60) * 100) / 100
    case 'hour':
      return amount
    case 'day':
      return amount * 24
    case 'week':
      return amount * 24 * 7
  }
}

/**
 * Walk every node in the tree (root + both branch arms recursively).
 * Yields nodes in pre-order, including branch nodes themselves.
 */
export function* walkTree(steps: StepNode[]): Generator<StepNode> {
  for (const node of steps) {
    yield node
    if (node.type === 'branch') {
      yield* walkTree(node.yes)
      yield* walkTree(node.no)
    }
  }
}

/**
 * Find a step in the tree by id. Returns the step (or undefined if absent).
 * Searches both branch arms recursively.
 */
export const findStepById = (
  steps: StepNode[],
  id: StepId,
): StepNode | undefined => {
  for (const node of walkTree(steps)) {
    if (node.id === id) return node
  }
  return undefined
}

/**
 * Patch the step with the given id (replace it with `next`) anywhere in the
 * tree, including inside branch arms. Returns a new top-level array — does
 * not mutate the input.
 */
export const replaceStepById = (
  steps: StepNode[],
  id: StepId,
  next: StepNode,
): StepNode[] =>
  steps.map((node) => {
    if (node.id === id) return next
    if (node.type === 'branch') {
      return {
        ...node,
        yes: replaceStepById(node.yes, id, next),
        no: replaceStepById(node.no, id, next),
      }
    }
    return node
  })

/**
 * Remove a step from anywhere in the tree.
 */
export const removeStepById = (steps: StepNode[], id: StepId): StepNode[] => {
  const out: StepNode[] = []
  for (const node of steps) {
    if (node.id === id) continue
    if (node.type === 'branch') {
      out.push({
        ...node,
        yes: removeStepById(node.yes, id),
        no: removeStepById(node.no, id),
      })
    } else {
      out.push(node)
    }
  }
  return out
}

/**
 * In-place tree edit: replaces the step at `id` with the result of
 * `transform(existing)`. Throws if the id isn't found anywhere in the tree.
 */
export const replaceStepInTree = (
  steps: StepNode[],
  id: StepId,
  transform: (existing: StepNode) => StepNode,
): StepNode[] =>
  steps.map((node) => {
    if (node.id === id) return transform(node)
    if (node.type === 'branch') {
      return {
        ...node,
        yes: replaceStepInTree(node.yes, id, transform),
        no: replaceStepInTree(node.no, id, transform),
      }
    }
    return node
  })

/**
 * Insert `fresh` immediately after the step with id `afterId`, walking
 * into branch arms as needed.
 */
export const insertAfterInTree = (
  steps: StepNode[],
  afterId: StepId,
  fresh: StepNode,
): StepNode[] => {
  const out: StepNode[] = []
  for (const node of steps) {
    if (node.type === 'branch') {
      out.push({
        ...node,
        yes: insertAfterInTree(node.yes, afterId, fresh),
        no: insertAfterInTree(node.no, afterId, fresh),
      })
    } else {
      out.push(node)
    }
    if (node.id === afterId) out.push(fresh)
  }
  return out
}

/**
 * Move a step up or down within its sibling list (whatever array it
 * currently belongs to — root or a branch arm). Out-of-range moves are
 * no-ops.
 */
export const moveSiblingInTree = (
  steps: StepNode[],
  id: StepId,
  dir: -1 | 1,
): StepNode[] => {
  const idx = steps.findIndex((s) => s.id === id)
  if (idx >= 0) {
    const j = idx + dir
    if (j < 0 || j >= steps.length) return steps
    const next = [...steps]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  }
  return steps.map((node) => {
    if (node.type !== 'branch') return node
    return {
      ...node,
      yes: moveSiblingInTree(node.yes, id, dir),
      no: moveSiblingInTree(node.no, id, dir),
    }
  })
}

/**
 * Drag-and-drop reorder restricted to siblings of the same parent.
 * Cross-arm or cross-parent drops are no-ops here — handled at a higher
 * level if/when we need them.
 */
export const reorderSiblingTree = (
  steps: StepNode[],
  draggingId: StepId,
  overId: StepId,
): StepNode[] => {
  const fromIdx = steps.findIndex((s) => s.id === draggingId)
  const toIdx = steps.findIndex((s) => s.id === overId)
  if (fromIdx >= 0 && toIdx >= 0) {
    const next = [...steps]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    return next
  }
  return steps.map((node) => {
    if (node.type !== 'branch') return node
    return {
      ...node,
      yes: reorderSiblingTree(node.yes, draggingId, overId),
      no: reorderSiblingTree(node.no, draggingId, overId),
    }
  })
}

/**
 * Deep-clone a step (and re-id every nested branch arm child) so the
 * duplicate has fully independent identities — matches the BlockEditor's
 * structuredClone-based duplicate semantics.
 */
export const deepCloneStep = (step: StepNode): StepNode => {
  if (step.type === 'branch') {
    return {
      ...step,
      id: newId(),
      yes: step.yes.map((s) => deepCloneStep(s)),
      no: step.no.map((s) => deepCloneStep(s)),
    }
  }
  return { ...step, id: newId() }
}

/**
 * Build a fresh StepNode of the given type, taking an explicit id +
 * value. Used by updateStep when the user changes a step's type.
 */
export const blankStepNodeWithValue = <T extends StepNode['type']>(
  id: StepId,
  type: T,
  value: Extract<StepNode, { type: T }>['value'],
): StepNode => {
  if (type === 'branch') {
    return {
      id,
      type: 'branch',
      value: value as BranchStepValue,
      yes: [],
      no: [],
    }
  }
  return { id, type, value } as StepNode
}

/**
 * Recursive count of emails across the whole tree (both arms of every
 * branch). Used for the editor's "X emails" header pill.
 */
export const countEmailsInTree = (steps: StepNode[]): number => {
  let n = 0
  for (const node of walkTree(steps)) {
    if (node.type === 'email') n += 1
  }
  return n
}

/**
 * Append a fresh step to a specific branch arm (or to the root if
 * `parentBranchId` is null). Returns a new top-level array.
 */
export const appendStep = (
  steps: StepNode[],
  fresh: StepNode,
  parentBranchId: StepId | null,
  arm: 'yes' | 'no' | null,
): StepNode[] => {
  if (parentBranchId == null || arm == null) {
    return [...steps, fresh]
  }
  return steps.map((node) => {
    if (node.type !== 'branch') return node
    if (node.id === parentBranchId) {
      const armSteps = arm === 'yes' ? node.yes : node.no
      const updatedArm = [...armSteps, fresh]
      return arm === 'yes'
        ? { ...node, yes: updatedArm }
        : { ...node, no: updatedArm }
    }
    return {
      ...node,
      yes: appendStep(node.yes, fresh, parentBranchId, arm),
      no: appendStep(node.no, fresh, parentBranchId, arm),
    }
  })
}

// Roll up wait steps preceding each email into the email's delay_hours.
// Recurses into branch arms so authored flows with branch/wait/email
// patterns inside an arm produce the correct materialized email rows.
export type MaterializedEmail = {
  index: number // 0-based across the whole tree (pre-order)
  step: Extract<StepNode, { type: 'email' }>
  delayHours: number
  // For analytics: which arm of which branch this email lives under, if any.
  // Top-level emails get `branchPath: []`. Nested emails get a list of
  // (branchId, arm) pairs leading to them.
  branchPath: Array<{ branchId: StepId; arm: 'yes' | 'no' }>
}

export const materializeEmailsFromFlow = (
  steps: StepNode[],
): MaterializedEmail[] => {
  const out: MaterializedEmail[] = []
  const counter = { i: 0 }

  const visit = (
    nodes: StepNode[],
    branchPath: MaterializedEmail['branchPath'],
  ): void => {
    let pending = 0
    for (const node of nodes) {
      if (node.type === 'wait') {
        pending += waitToHours(node.value)
        continue
      }
      if (node.type === 'email') {
        out.push({
          index: counter.i++,
          step: node,
          delayHours: pending,
          branchPath,
        })
        pending = 0
        continue
      }
      if (node.type === 'branch') {
        // The wait that's currently pending applies to the first email in
        // *each* arm (whichever path the subscriber takes). Pass it through
        // and let the recursive visit consume it. Reset our local pending
        // since we've handed it off.
        // To avoid double-counting we leak a `lead` wait into the arm via
        // a synthetic prefix.
        const lead = pending
        pending = 0

        const visitArm = (arm: 'yes' | 'no'): void => {
          const armSteps = arm === 'yes' ? node.yes : node.no
          // Synthesize a lead wait so the arm's first email captures it.
          if (lead > 0 && armSteps.some((s) => s.type === 'email')) {
            const synthetic: StepNode = {
              id: `${node.id}_lead_${arm}`,
              type: 'wait',
              value: { mode: 'duration', amount: lead, unit: 'hour' },
            }
            visit(
              [synthetic, ...armSteps],
              [...branchPath, { branchId: node.id, arm }],
            )
          } else {
            visit(armSteps, [...branchPath, { branchId: node.id, arm }])
          }
        }
        visitArm('yes')
        visitArm('no')
        continue
      }
      // action / goal: no contribution to delay or email materialization.
    }
  }

  visit(steps, [])
  return out
}

/**
 * Estimate total elapsed days across the longest path in the tree (the
 * branch arm that takes the longest). Authors expect "this sequence runs
 * for ~N days" to track the worst-case time-to-completion.
 */
export const estimateDays = (steps: StepNode[]): number => {
  const longestHours = (nodes: StepNode[]): number => {
    let total = 0
    for (const node of nodes) {
      if (node.type === 'wait') {
        total += waitToHours(node.value)
        continue
      }
      if (node.type === 'branch') {
        total += Math.max(longestHours(node.yes), longestHours(node.no))
      }
    }
    return total
  }
  return Math.max(1, Math.round(longestHours(steps) / 24))
}

export const isFlowDoc = (raw: unknown): raw is FlowDoc => {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as Record<string, unknown>
  return r.version === 1 && Array.isArray(r.steps)
}

/**
 * Migrate a legacy flat-array flow.steps to the new tree shape.
 *
 * Pre-3b authoring stored a branch followed by exactly two adjacent
 * siblings — `i+1` was Yes, `i+2` was No, and the engine resumed at `i+3`.
 * That representation forbade multi-step arms and nested branches; the
 * new shape carries `yes`/`no` arrays inside each branch node.
 *
 * This adoption is best-effort: branches with at least one of the two
 * legacy siblings get them promoted into `yes` / `no`. Any node missing
 * the `yes`/`no` arrays is given empty arrays so the runtime invariants
 * (always-present arrays, never undefined) hold.
 */
const adoptStepsTree = (raw: unknown[]): StepNode[] => {
  // First, recursively recover any *already-tree* shape: each branch may
  // already carry `yes`/`no`. Otherwise we apply the i+1/i+2 promotion.
  const liftAlreadyTree = (n: unknown): n is StepNode => {
    if (!n || typeof n !== 'object') return false
    const node = n as { type?: unknown; yes?: unknown; no?: unknown }
    if (node.type !== 'branch') return true
    return Array.isArray(node.yes) && Array.isArray(node.no)
  }

  const out: StepNode[] = []
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i] as Partial<StepNode> & {
      type?: string
      yes?: unknown
      no?: unknown
    }
    if (!cur || typeof cur !== 'object' || typeof cur.type !== 'string') {
      continue
    }
    if (cur.type === 'branch') {
      let yesNodes: StepNode[] = []
      let noNodes: StepNode[] = []
      if (Array.isArray(cur.yes) || Array.isArray(cur.no)) {
        // Already tree-shaped — recurse and adopt children verbatim.
        yesNodes = Array.isArray(cur.yes)
          ? adoptStepsTree(cur.yes as unknown[])
          : []
        noNodes = Array.isArray(cur.no)
          ? adoptStepsTree(cur.no as unknown[])
          : []
      } else {
        // Legacy flat shape: promote the next two siblings.
        const yes = raw[i + 1]
        const no = raw[i + 2]
        if (yes && (yes as { type?: unknown }).type) {
          yesNodes = liftAlreadyTree(yes) ? [yes as StepNode] : []
        }
        if (no && (no as { type?: unknown }).type) {
          noNodes = liftAlreadyTree(no) ? [no as StepNode] : []
        }
        // Skip the two consumed siblings.
        i += 2
      }
      out.push({
        id: typeof cur.id === 'string' && cur.id ? cur.id : newId(),
        type: 'branch',
        value: (cur.value as BranchStepValue) ?? DEFAULT_STEP_VALUES.branch(),
        yes: yesNodes,
        no: noNodes,
      })
      continue
    }
    if (liftAlreadyTree(cur as StepNode)) {
      out.push(cur as StepNode)
    }
  }
  return out
}

export const adoptFlowDoc = (raw: unknown): FlowDoc | null => {
  if (!isFlowDoc(raw)) return null
  // Trust shape; defensively backfill missing keys so older docs don't crash.
  const fallback = DEFAULT_FLOW_DOC()
  const steps = adoptStepsTree(raw.steps as unknown[])
  return {
    version: 1,
    category:
      typeof raw.category === 'string' ? raw.category : fallback.category,
    audience: {
      mode: raw.audience?.mode === 'filtered' ? 'filtered' : 'all',
      filters: Array.isArray(raw.audience?.filters)
        ? (raw.audience.filters as AudienceConfig['filters'])
        : [],
      excludeTags: Array.isArray(raw.audience?.excludeTags)
        ? (raw.audience.excludeTags as string[])
        : [],
    },
    goal: {
      event: raw.goal?.event ?? 'none',
      window: (raw.goal?.window as FlowDoc['goal']['window']) ?? '14',
    },
    send: { ...fallback.send, ...(raw.send ?? {}) },
    steps,
  }
}
