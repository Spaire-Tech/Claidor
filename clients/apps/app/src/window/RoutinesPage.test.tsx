// The Routines tab's list (RoutinesPage.tsx's `RoutinesBody`, the Mac's
// RoutinesPage.swift): a list that couldn't be read shows nothing, not even
// New Routine, and is drawn once it is read again, which the tab now does
// when the connection comes back as well as each time it shows (3 November
// 2026; the window's routines store reads its watched lists again at
// `noteReconnect`). The read itself is the tab's effect, which a page drawn
// here as text doesn't run: the test reads it as the effect does.

import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeAgent } from '../core/models'
import { automationHost } from '../core/routineTesting'
import { AppStore } from '../core/store'
import { FakeBackend } from '../core/testing'
import { type Table, setWords } from '../core/words'
import { RoutinesBody } from './RoutinesPage'
import { WindowContext, WindowModel } from './windowModel'

// The keyed sentences ("schedule.daysAt") read their English from the core's table.
beforeEach(() =>
  setWords(
    'en',
    {},
    {
      core: JSON.parse(
        readFileSync(new URL('../words/core/en.json', import.meta.url), 'utf8'),
      ) as Table,
    },
  ),
)
afterEach(() => setWords('en', {}))

describe('the Routines tab’s list (RoutinesBody)', () => {
  it('draws a list that couldn’t be read once it is read again', async () => {
    const backend = new FakeBackend()
    const theo = makeAgent({ id: 'theo', name: 'Theo' })
    backend.agents = [theo]
    automationHost(backend, [
      {
        name: 'Monday launch check',
        prompt: 'Check the launch.',
        trigger: { type: 'cron', schedule: '0 9 * * 1' },
      },
    ])
    const store = new AppStore()
    await store.attach(backend)
    const draw = () =>
      renderToStaticMarkup(
        <WindowContext.Provider value={new WindowModel(undefined)}>
          <RoutinesBody store={store} agent={theo} />
        </WindowContext.Provider>,
      )

    backend.refusedCommands.add('getAgentAutomations')
    expect(await store.loadRoutines('theo')).toBe(false)
    expect(draw()).toBe('<div class="routines-none"></div>')

    // The connection back: read again.
    backend.refusedCommands.delete('getAgentAutomations')
    expect(await store.loadRoutines('theo')).toBe(true)
    const drawn = draw()
    expect(drawn).toContain('New Routine')
    expect(drawn).toContain('Monday launch check')
  })
})
