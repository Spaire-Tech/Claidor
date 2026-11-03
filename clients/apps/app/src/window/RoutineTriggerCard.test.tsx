// A trigger's popover in the app's language (RoutineTriggerCard.swift's
// `Word` and Advanced's units): each connecting word from the Mac app's
// catalogue, "at" a minute past the hour and "on" a day of the week each
// with its own key, and Advanced's Every in minutes or hours as Interval
// says them (`unitLabel`), not as they are saved.

import { renderToStaticMarkup } from 'react-dom/server'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { TriggerRow } from '../core/routineTriggers'
import { setWords } from '../core/words'
import { TriggerPopover } from './RoutineTriggerCard'

// A pill field measures its words on a canvas; with none, it counts them.
beforeAll(() =>
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => null }),
  }),
)
afterAll(() => vi.unstubAllGlobals())
afterEach(() => setWords('en', {}))

/** The keyed entries' English, as the catalogue's `en` (`src/words/mac/en.json`). */
const english = { 'hourly.at': 'at', 'weekly.on': 'on' }

/** The Mac app's catalogue's Spanish for the popover's words (mac/Simeon/Localizable.xcstrings). */
const spanish = {
  at: 'a las',
  'hourly.at': 'en el minuto',
  'weekly.on': 'el',
  'on the': 'el',
  every: 'cada',
  between: 'entre',
  and: 'y',
  in: 'en',
  on: 'en',
  containing: 'que contienen',
  'with emoji': 'con el emoji',
  from: 'de:',
  'on branch': 'en la rama',
  tenant: 'inquilino',
  channels: 'canales',
  'with status': 'con el estado',
  cycles: 'ciclos',
  for: 'para',
}

/** The core's catalogue's Spanish for the units (`unitLabel`). */
const spanishUnits = { 'unit.minutes': 'minutos', 'unit.hours': 'horas' }

const edit = {
  current: () => undefined,
  change: () => {},
  pick: () => {},
  commit: () => {},
}

function draw(row: TriggerRow): string {
  return renderToStaticMarkup(
    <TriggerPopover row={row} edit={edit} line={300} />,
  )
}

/** The connecting words, in order. */
function words(row: TriggerRow): string[] {
  return [...draw(row).matchAll(/class="flow-word">([^<]*)</g)].map(
    (found) => found[1]!,
  )
}

const schedule = (text: string): TriggerRow => ({ kind: 'schedule', text })

describe('a trigger’s connecting words', () => {
  it('in English, as written', () => {
    setWords('en', {}, { mac: english })
    expect(words(schedule('15 * * * *'))).toEqual(['at'])
    expect(words(schedule('0 9 * * 1'))).toEqual(['on', 'at'])
    expect(words(schedule('0 9 1 * *'))).toEqual(['on the', 'at'])
    expect(words(schedule('*/30 9-17 * * *'))).toEqual(['between', 'and'])
  })

  it('in the app’s language, from the catalogue', () => {
    setWords('es', { mac: spanish, core: spanishUnits }, { mac: english })
    expect(words(schedule('15 * * * *'))).toEqual(['en el minuto'])
    expect(words(schedule('0 9 * * *'))).toEqual(['a las'])
    expect(words(schedule('0 9 * * 1-5'))).toEqual(['a las'])
    expect(words(schedule('0 9 * * 1'))).toEqual(['el', 'a las'])
    expect(words(schedule('0 9 1 * *'))).toEqual(['el', 'a las'])
    expect(words(schedule('@every 30m'))).toEqual(['cada'])
    expect(words(schedule('*/30 9-17 * * *'))).toEqual(['entre', 'y'])
    const slack = {
      kind: 'slack',
      channel: '#general',
      keyword: '',
      emoji: '',
      bySelf: false,
    } as const
    expect(words({ ...slack, match: 'message' })).toEqual([
      'en',
      'que contienen',
    ])
    expect(words({ ...slack, match: 'reaction' })).toEqual([
      'en',
      'con el emoji',
      'de:',
    ])
    const git = {
      kind: 'github',
      repo: 'acme/app',
      userAllowlist: '',
      ciBranch: '',
    } as const
    expect(words({ ...git, events: ['ci-failed'] })).toEqual([
      'en',
      'en la rama',
    ])
    expect(words({ ...git, events: ['pr-opened'] })).toEqual(['en', 'de:'])
    expect(
      words({
        kind: 'teams',
        tenantId: '',
        teamIds: '',
        channelIds: '',
        messageContains: '',
        isRegex: false,
        linkedOnly: false,
      }),
    ).toEqual(['en', 'inquilino', 'canales', 'que contienen', 'de:'])
    const linear = {
      kind: 'linear',
      statusIds: '',
      cycleIds: '',
      projectIds: '',
      teamIds: '',
    } as const
    expect(words({ ...linear, event: 'statusChanged' })).toEqual([
      'con el estado',
      'en',
      'para',
    ])
    expect(words({ ...linear, event: 'endOfCycle' })).toEqual([
      'ciclos',
      'en',
      'para',
    ])
    expect(
      words({ kind: 'sentry', event: 'issueCreated', projectIds: '' }),
    ).toEqual(['en'])
    expect(
      words({
        kind: 'pagerduty',
        event: 'incidentTriggered',
        serviceIds: '',
      }),
    ).toEqual(['en'])
  })

  it('Advanced’s Every in minutes or hours as Interval says them', () => {
    setWords('es', { mac: spanish, core: spanishUnits }, { mac: english })
    const unit = (text: string) =>
      draw(schedule(text)).match(
        /aria-label="Interval unit"[^>]*><span class="pill-text">([^<]*)</,
      )?.[1]
    expect(unit('*/30 9-17 * * *')).toBe('minutos')
    expect(unit('@every 30m')).toBe('minutos')
  })
})
