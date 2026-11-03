// Control-Tab's walk (SidebarState.swift's `step`), written from the Swift:
// the Mac has no test of its own for it.

import { describe, expect, it } from 'vitest'
import { cycleStep } from './controlTab'

const order = ['pin', 'iris', 'theo', 'nora']

describe('Control-Tab’s walk (SidebarState.step)', () => {
  it('starts after the open row and wraps round, both ways', () => {
    expect(cycleStep(undefined, 1, order, 'theo')).toEqual({
      next: 'nora',
      order,
    })
    expect(cycleStep(undefined, 1, order, 'nora')?.next).toBe('pin')
    expect(cycleStep(undefined, -1, order, 'pin')?.next).toBe('nora')
    expect(cycleStep(undefined, -1, order, 'iris')?.next).toBe('pin')
  })

  it('walks on from the row it is on, in the order of its first press', () => {
    const first = cycleStep(undefined, 1, order, 'pin')
    expect(first?.next).toBe('iris')
    // The list moved meanwhile: the walk keeps its order.
    const second = cycleStep(first, 1, ['theo', 'iris', 'pin'], 'pin')
    expect(second).toEqual({ next: 'theo', order })
    expect(cycleStep(second, -1, [], 'pin')?.next).toBe('iris')
  })

  it('starts at the first (or the last) with nothing open, or an open row not in the walk', () => {
    expect(cycleStep(undefined, 1, order, undefined)?.next).toBe('pin')
    expect(cycleStep(undefined, -1, order, undefined)?.next).toBe('nora')
    expect(cycleStep(undefined, 1, order, 'hidden')?.next).toBe('pin')
  })

  it('does nothing with fewer than two rows', () => {
    expect(cycleStep(undefined, 1, ['iris'], 'iris')).toBeUndefined()
    expect(cycleStep(undefined, 1, [], undefined)).toBeUndefined()
  })
})
