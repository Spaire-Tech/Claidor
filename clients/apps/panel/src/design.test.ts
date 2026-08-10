/**
 * The two halves of the product use the same shades, or this fails.
 *
 * `design.ts` here holds a copy of the workspace's token block. A copy is
 * a liability exactly as long as nothing checks it, so this reads both
 * files off disk — not through either bundler — and compares the marked
 * region byte for byte.
 *
 * If this fails, the fix is never to edit the assertion. Copy the
 * workspace's block over the panel's, or put the change in both.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))

const WEB = join(here, '../../web/src/components/Workspace/design.ts')
const PANEL = join(here, 'design.ts')

const START = '// --- shared with'
const END = '// --- end shared'

/** The marked region of a file, without its marker lines. */
function shared(path: string): string {
  const source = readFileSync(path, 'utf8')
  const from = source.indexOf(START)
  const to = source.indexOf(END)
  if (from === -1 || to === -1) {
    throw new Error(`${path} has lost its shared-block markers`)
  }
  return source
    .slice(source.indexOf('\n', from) + 1, to)
    .replace(/^\/\/.*$/gm, '') // the marker's own explanation, either side
    .trim()
}

describe('the design tokens', () => {
  it('are the same in the panel as in the workspace', () => {
    expect(shared(PANEL)).toBe(shared(WEB))
  })

  it('still carry the shades the panel actually paints with', () => {
    // A guard against a well-meaning tidy-up: these five are the only
    // colours a finding row can be, and losing one silently would make a
    // severity invisible rather than wrong.
    const block = shared(PANEL)
    for (const shade of [
      '#b04434',
      '#b3822f',
      '#8a8886',
      '#0b62c4',
      '#4f7a5c',
    ]) {
      expect(block).toContain(shade)
    }
  })
})
