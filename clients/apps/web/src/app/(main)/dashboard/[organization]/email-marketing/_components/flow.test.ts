import { describe, expect, it } from 'vitest'
import {
  adoptFlowDoc,
  appendStep,
  blankStepNode,
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
  StepNode,
  walkTree,
} from './flow'

const mkEmail = (id: string, subject = 'Hi'): StepNode => ({
  id,
  type: 'email',
  value: {
    subject,
    preview: '',
    fromName: 'me',
    fromEmail: 'me@example.com',
    template: 'plain',
    abTest: false,
    trackClicks: true,
  },
})

const mkWait = (id: string, days = 1): StepNode => ({
  id,
  type: 'wait',
  value: { mode: 'duration', amount: days, unit: 'day' },
})

const mkBranch = (
  id: string,
  yes: StepNode[] = [],
  no: StepNode[] = [],
): StepNode => ({
  id,
  type: 'branch',
  value: { field: 'opened-prev' },
  yes,
  no,
})

describe('flow tree helpers', () => {
  it('walks the entire tree including both branch arms', () => {
    const tree: StepNode[] = [
      mkEmail('e1'),
      mkBranch(
        'b1',
        [mkEmail('y1'), mkBranch('b2', [mkEmail('y2y')], [mkEmail('y2n')])],
        [mkEmail('n1')],
      ),
      mkEmail('e2'),
    ]
    const ids = [...walkTree(tree)].map((s) => s.id)
    expect(ids).toEqual(['e1', 'b1', 'y1', 'b2', 'y2y', 'y2n', 'n1', 'e2'])
  })

  it('finds a step nested inside a branch arm', () => {
    const tree: StepNode[] = [
      mkBranch('b1', [mkEmail('y1')], [mkBranch('b2', [mkEmail('inner')])]),
    ]
    expect(findStepById(tree, 'inner')?.id).toBe('inner')
    expect(findStepById(tree, 'missing')).toBeUndefined()
  })

  it('counts emails across both arms', () => {
    const tree: StepNode[] = [
      mkEmail('e1'),
      mkBranch('b', [mkEmail('y1'), mkEmail('y2')], [mkEmail('n1')]),
    ]
    expect(countEmailsInTree(tree)).toBe(4)
  })

  it('replaces a nested step without mutating siblings', () => {
    const tree: StepNode[] = [
      mkBranch('b', [mkEmail('y1', 'before')], [mkEmail('n1')]),
    ]
    const next = replaceStepInTree(tree, 'y1', () => mkEmail('y1', 'after'))
    expect(findStepById(next, 'y1')).toEqual(
      expect.objectContaining({ value: expect.objectContaining({ subject: 'after' }) }),
    )
    expect(findStepById(next, 'n1')?.id).toBe('n1')
  })

  it('removes a step nested in an arm', () => {
    const tree: StepNode[] = [
      mkBranch('b', [mkEmail('y1'), mkEmail('y2')], [mkEmail('n1')]),
    ]
    const next = removeStepById(tree, 'y1')
    const branch = findStepById(next, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(branch.yes.map((s) => s.id)).toEqual(['y2'])
    expect(branch.no.map((s) => s.id)).toEqual(['n1'])
  })

  it('appends a fresh step into a branch arm', () => {
    const tree: StepNode[] = [mkBranch('b')]
    const fresh = blankStepNode('email')
    const next = appendStep(tree, fresh, 'b', 'no')
    const branch = findStepById(next, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(branch.no.map((s) => s.id)).toEqual([fresh.id])
    expect(branch.yes).toEqual([])
  })

  it('inserts after a nested step', () => {
    const tree: StepNode[] = [mkBranch('b', [mkEmail('y1')], [])]
    const fresh = mkEmail('y1b')
    const next = insertAfterInTree(tree, 'y1', fresh)
    const branch = findStepById(next, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(branch.yes.map((s) => s.id)).toEqual(['y1', 'y1b'])
  })

  it('moves siblings within their parent arm', () => {
    const tree: StepNode[] = [
      mkBranch('b', [mkEmail('y1'), mkEmail('y2')], []),
    ]
    const next = moveSiblingInTree(tree, 'y2', -1)
    const branch = findStepById(next, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(branch.yes.map((s) => s.id)).toEqual(['y2', 'y1'])
  })

  it('reorders only same-arm siblings (cross-arm drop is a no-op)', () => {
    const tree: StepNode[] = [
      mkBranch(
        'b',
        [mkEmail('y1'), mkEmail('y2')],
        [mkEmail('n1'), mkEmail('n2')],
      ),
    ]
    // Same arm: ok.
    const same = reorderSiblingTree(tree, 'y2', 'y1')
    const sameBranch = findStepById(same, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(sameBranch.yes.map((s) => s.id)).toEqual(['y2', 'y1'])

    // Cross-arm: no change (the helper bails out cleanly).
    const cross = reorderSiblingTree(tree, 'y1', 'n1')
    const crossBranch = findStepById(cross, 'b') as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(crossBranch.yes.map((s) => s.id)).toEqual(['y1', 'y2'])
    expect(crossBranch.no.map((s) => s.id)).toEqual(['n1', 'n2'])
  })

  it('deep-clones a branch with fresh ids on every arm child', () => {
    const original = mkBranch(
      'b',
      [mkEmail('y1'), mkEmail('y2')],
      [mkEmail('n1')],
    ) as Extract<StepNode, { type: 'branch' }>
    const cloned = deepCloneStep(original) as Extract<
      StepNode,
      { type: 'branch' }
    >
    expect(cloned.id).not.toBe('b')
    expect(cloned.yes[0].id).not.toBe('y1')
    expect(cloned.yes[1].id).not.toBe('y2')
    expect(cloned.no[0].id).not.toBe('n1')
    // Original untouched.
    expect(original.yes.map((s: StepNode) => s.id)).toEqual(['y1', 'y2'])
  })
})

describe('materializeEmailsFromFlow', () => {
  it('emits emails from both branch arms with branchPath set', () => {
    const tree: StepNode[] = [
      mkEmail('top'),
      mkBranch('b', [mkEmail('yes-1')], [mkEmail('no-1')]),
    ]
    const out = materializeEmailsFromFlow(tree)
    expect(out.map((m) => m.step.id)).toEqual(['top', 'yes-1', 'no-1'])
    expect(out[0].branchPath).toEqual([])
    expect(out[1].branchPath).toEqual([{ branchId: 'b', arm: 'yes' }])
    expect(out[2].branchPath).toEqual([{ branchId: 'b', arm: 'no' }])
  })

  it('rolls a wait preceding a branch into the first email of each arm', () => {
    const tree: StepNode[] = [
      mkWait('w', 2), // 48 hours
      mkBranch('b', [mkEmail('yes')], [mkEmail('no')]),
    ]
    const out = materializeEmailsFromFlow(tree)
    expect(out).toHaveLength(2)
    expect(out[0].delayHours).toBe(48)
    expect(out[1].delayHours).toBe(48)
  })
})

describe('estimateDays', () => {
  it('uses the longest arm of the tree, not the sum', () => {
    const tree: StepNode[] = [
      mkWait('w0', 1),
      mkBranch(
        'b',
        [mkWait('y_w', 5), mkEmail('y_e')],
        [mkWait('n_w', 1), mkEmail('n_e')],
      ),
    ]
    // 1 day before the branch + max(5, 1) inside = 6 days.
    expect(estimateDays(tree)).toBe(6)
  })
})

describe('adoptFlowDoc', () => {
  it('promotes the legacy flat i+1/i+2 shape to nested arrays', () => {
    const legacy = {
      version: 1,
      steps: [
        { id: 'a', type: 'email', value: {} },
        {
          id: 'b',
          type: 'branch',
          value: { field: 'opened-prev' },
        },
        { id: 'c', type: 'email', value: {} },
        { id: 'd', type: 'email', value: {} },
        { id: 'e', type: 'email', value: {} },
      ],
    }
    const adopted = adoptFlowDoc(legacy)!
    expect(adopted.steps.map((s) => s.id)).toEqual(['a', 'b', 'e'])
    const branch = adopted.steps[1] as Extract<StepNode, { type: 'branch' }>
    expect(branch.yes.map((s) => s.id)).toEqual(['c'])
    expect(branch.no.map((s) => s.id)).toEqual(['d'])
  })

  it('preserves an already-tree-shaped flow_doc', () => {
    const tree = {
      version: 1,
      steps: [
        {
          id: 'b',
          type: 'branch',
          value: { field: 'opened-prev' },
          yes: [{ id: 'y', type: 'email', value: {} }],
          no: [],
        },
      ],
    }
    const adopted = adoptFlowDoc(tree)!
    const branch = adopted.steps[0] as Extract<StepNode, { type: 'branch' }>
    expect(branch.yes).toHaveLength(1)
    expect(branch.no).toHaveLength(0)
  })
})

describe('newId', () => {
  it('produces unique ids on rapid back-to-back calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) ids.add(newId())
    expect(ids.size).toBe(100)
  })
})
