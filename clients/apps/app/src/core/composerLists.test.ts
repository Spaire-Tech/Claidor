// "@", "/" and "#", and the document that carries the picks, as the
// window's editor writes it (SimeonCore's `ComposerMenuTests` and
// `testTheComposerOffersNamesAfterAnAt`).

import { afterEach, describe, expect, it } from 'vitest'
import {
  carry,
  chipText,
  draftFrom,
  picking,
  pickingBetween,
  richText,
  textStart,
} from './composerDocument'
import {
  appActions,
  filterMentions,
  filterPulls,
  mentionEmptyText,
  mentionMembers,
  mentionRows,
  pullCandidates,
  rememberingMention,
  score,
  slashEmptyText,
  slashId,
  slashItems,
  slashLabel,
  slashTag,
  tokens,
  triggerIn,
} from './composerLists'
import { skillsFrom } from './composerMenus'
import { makeApp } from './connectedApps'
import { Entry } from './entry'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'
import { loadWords, setWords } from './words'

afterEach(() => setWords('en', {}))

describe('what "/" and "@" are made of', () => {
  it('offers the skills the agent can be asked to use, and the routines', () => {
    const answer: JSONValue = {
      workflows: [
        {
          id: 'w1',
          name: 'Weekly report',
          trigger: null,
          isEnabledForAgent: true,
          description: 'Sums up the week',
        },
        {
          id: 'w2',
          name: 'Morning brief',
          trigger: { schedule: '0 9 * * *', isEnabled: true },
          isEnabledForAgent: true,
        },
        { id: 'w3', name: 'Off for this agent', isEnabledForAgent: false },
        {
          id: 'w4',
          name: "A routine's own",
          isEnabledForAgent: false,
          source: 'automation',
        },
        { id: 'w5', name: 'Not said', trigger: null },
        { id: 'w1', name: 'Weekly report again', isEnabledForAgent: true },
        { id: '', name: 'No id' },
      ],
    }
    const skills = skillsFrom(answer)
    expect(skills.map((skill) => skill.id)).toEqual(['w1', 'w4'])
    expect(skills[0]?.summary).toBe('Sums up the week')
    const routines = skillsFrom(answer, true)
    expect(routines.map((routine) => routine.id)).toEqual(['w2'])
    expect(routines[0]?.subtitle).toBe('0 9 * * *')
  })
})

describe('the window’s matching', () => {
  it('scores as the window does (its own numbers)', () => {
    expect(score('Nora', [], 'no')).toBeCloseTo(17.84, 4)
    expect(score('Nora', [], 'nr')).toBeCloseTo(11.84, 4)
    expect(score('Nora', [], 'ra')).toBeCloseTo(9.44, 4)
    expect(score('Nora', [], 'x')).toBeUndefined()
    expect(score('Data Analyst', [], 'an')).toBeCloseTo(3.32, 4)
    expect(score('abcdefgh', [], 'ah')).toBeUndefined()
    expect(score('everyone', ['all'], 'all')).toBeCloseTo(12.94, 4)
    expect(tokens('Héllo, World!')).toEqual(['hello', 'world'])
    expect(tokens('foo-bar_baz')).toEqual(['foo', 'bar', 'baz'])
    expect(tokens("it's")).toEqual(['it', 's'])
    expect(tokens('!!!')).toEqual([])
  })

  it('opens a list after a space, "(" or the start; names one space at a time; 50 at most; not inside a pick', () => {
    expect(triggerIn('@', 'hi @al')).toEqual({ at: 3, query: 'al' })
    expect(triggerIn('@', 'hi@al')).toBeUndefined()
    expect(triggerIn('@', '(@a')?.at).toBe(1)
    expect(triggerIn('@', '@al ice')?.query).toBe('al ice')
    expect(triggerIn('@', '@al  ice')).toBeUndefined()
    expect(triggerIn('@', '@')?.query).toBe('')
    expect(triggerIn('@', '@' + 'a'.repeat(51))).toBeUndefined()
    expect(triggerIn('@', '@Nora hi', 5)).toBeUndefined()
    expect(triggerIn('/', 'run /wee')?.query).toBe('wee')
    expect(triggerIn('/', 'and/or')).toBeUndefined()
    expect(triggerIn('#', 'Review #4')?.query).toBe('4')
    expect(triggerIn('@', 'Ask @')?.query).toBe('')
    expect(triggerIn('@', 'Ask @Th')?.query).toBe('Th')
    expect(triggerIn('@', '@Iris')?.query).toBe('Iris')
    expect(triggerIn('@', 'mail me at bass@simeonlabs')).toBeUndefined()
    expect(triggerIn('@', 'Ask @Theo now')?.query).toBe('Theo now')
    expect(
      picking({ kind: 'mention', id: 't', label: 'Theo' }, 4, 'Ask @Th', [])
        .draft,
    ).toBe('Ask @Theo ')
  })
})

describe('"@"', () => {
  const agent = (id: string, name: string, group?: string[]) =>
    makeAgent({ id, name, isGroup: group != null, memberIds: group ?? [] })
  const roster = [
    agent('a1', 'Nora'),
    agent('a2', 'Nova'),
    agent('g1', 'Launch', ['a1', 'a2']),
    agent('g2', 'Ops', ['a2', 'a3']),
  ]

  it('offers the others and the groups, or a group’s members', () => {
    expect(mentionMembers(roster[0], roster).map((one) => one.id)).toEqual([
      'a2',
      'g1',
    ])
    expect(mentionMembers(roster[2], roster).map((one) => one.id)).toEqual([
      'a1',
      'a2',
    ])
  })

  it('lists everyone, the members, routines and connectors, and filters them', async () => {
    // A connector's line is a keyed sentence: its English is the catalogue's.
    await loadWords('en')
    const rows = mentionRows(
      [roster[0]!, roster[1]!],
      true,
      [{ id: 'w2', name: 'Morning brief', subtitle: 'Every day at 9' }],
      [
        makeApp({
          serverId: 's1',
          name: 'Gmail',
          pluginId: 'gmail',
          accountKey: 'work@x.com',
          status: 'needsAuth',
          toolCount: 3,
          serverIdentifier: 'gmail-work',
        }),
      ],
    )
    expect(rows.map((row) => row.label)).toEqual([
      'everyone',
      'Nora',
      'Nova',
      'Morning brief',
      'Gmail (work@x.com)',
    ])
    expect(rows.map((row) => row.tag)).toEqual([
      'Agent',
      'Agent',
      'Agent',
      'Routine',
      'Plugin',
    ])
    expect(rows[4]?.subtitle).toBe('needs auth')
    expect(rows[4]?.key).toBe('tools:mcp:gmail-work')
    expect(rows[4]?.insert).toEqual({
      kind: 'workflow',
      id: 'mcp:s1',
      label: 'Gmail (work@x.com)',
    })
    const labels = (query: string, recents: string[]) =>
      filterMentions(rows, query, recents).map((row) => row.label)
    expect(labels('', ['assistants:a2'])).toEqual(rows.map((row) => row.label))
    expect(labels('no', ['assistants:a2'])).toEqual(['Nova', 'Nora'])
    expect(labels('all', [])).toEqual(['everyone'])
    expect(mentionEmptyText('zz ')).toBe('No matches for “zz”')
    expect(
      rememberingMention('assistants:a1', ['assistants:a2', 'assistants:a1']),
    ).toEqual(['assistants:a1', 'assistants:a2'])
  })

  it('in French, from the core’s catalogue', () => {
    setWords('fr', {
      core: {
        Group: 'Groupe',
        '%lld agents': { one: '%lld agent', other: '%lld agents' },
        'mention.needsAuth': 'connexion requise',
      },
    })
    const rows = mentionRows(
      [roster[2]!],
      false,
      [],
      [makeApp({ serverId: 's', name: 'Gmail', status: 'needsAuth' })],
    )
    expect(rows.map((row) => [row.tag, row.subtitle])).toEqual([
      ['Groupe', '2 agents'],
      ['Plugin', 'connexion requise'],
    ])
  })
})

describe('"/"', () => {
  it('offers skills, then actions, eight at most', () => {
    const skills = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i + 1}`,
      name: `Skill ${i + 1}`,
    }))
    const actions = [
      {
        id: 'settings:general',
        label: 'Settings: General',
        keywords: ['account', 'theme'],
        detail: 'Settings',
      },
      { id: 'overlay:plugins', label: 'Plugins', keywords: ['connectors'] },
      {
        id: 'theme:dark',
        label: 'Theme: Dark',
        keywords: ['appearance', 'night', 'mode'],
        detail: 'Settings · Appearance',
      },
      {
        id: 'theme:light',
        label: 'Theme: Light',
        keywords: ['appearance', 'day', 'bright'],
        detail: 'Settings · Appearance',
      },
    ]
    const all = slashItems(skills, actions, '')
    expect(all.length).toBe(8)
    expect(all.filter((item) => slashTag(item) === 'Skill').length).toBe(5)
    expect(slashItems(skills, actions, 'skill 3').map(slashId)).toEqual(['s3'])
    expect(slashItems(skills, actions, 'night').map(slashId)).toEqual([
      'action:theme:dark',
    ])
    expect(slashEmptyText('zz', true)).toBe('No matches for "zz"')
    expect(slashEmptyText('', false)).toBe('Nothing to reference yet')
  })

  it('lists the app’s actions as the window does', () => {
    const labels = (query: string, group = false) =>
      slashItems(
        [],
        appActions({ isGroup: group, hasHiddenAgents: false }),
        query,
      ).map(slashLabel)
    expect(labels('')).toEqual([
      'Org Chart',
      'Channels',
      'Chat Settings',
      'Settings: General',
      'Settings: Usage & Billing',
      'Connectors',
      'Theme: System',
      'Theme: Light',
    ])
    expect(labels('', true)).toEqual([
      'Org Chart',
      'Members',
      'Channels',
      'Chat Settings',
      'Settings: General',
      'Settings: Usage & Billing',
      'Connectors',
      'Theme: System',
    ])
    expect(labels('theme')).toEqual([
      'Theme: Dark',
      'Theme: Light',
      'Theme: System',
      'Settings: General',
    ])
    expect(labels('set')).toEqual([
      'Settings: General',
      'Settings: Usage & Billing',
      'Chat Settings',
      'Theme: System',
      'Theme: Light',
      'Theme: Dark',
    ])
    expect(labels('chan')).toEqual(['Channels', 'Chat Settings'])
    expect(labels('mem')).toEqual(['Theme: System'])
    expect(labels('mem', true)).toEqual(['Members', 'Theme: System'])
    expect(labels('hid')).toEqual([])
    expect(
      appActions({ isGroup: false, hasHiddenAgents: true })
        .map((action) => action.label)
        .slice(0, 2),
    ).toEqual(['Org Chart', 'Open Hidden Agents'])
    expect(
      appActions({
        isGroup: false,
        hasHiddenAgents: false,
        computerUpdate: true,
      }).at(-1)?.label,
    ).toBe("Update Simeon's Computer")
  })
})

describe('"#"', () => {
  it('offers the pull requests the chat named, newest first, each once', () => {
    const rich = richText('#12 again', [
      {
        start: 0,
        node: {
          kind: 'pullRequest',
          number: 12,
          title: 'Fix login',
          url: 'https://github.com/acme/app/pull/12',
        },
      },
    ])
    const entries = Entry.list([
      {
        kind: 'message',
        id: 'a',
        role: 'user',
        content: 'See https://github.com/acme/app/pull/12.',
      },
      {
        kind: 'send-message',
        id: 'b',
        message: {
          type: 'text',
          content:
            'Opened https://github.com/acme/app/pull/40/files and https://gitlab.com/x/y/pull/3 and https://review.simeonlabs.com/github/pr/acme/app/41',
        },
      },
      {
        kind: 'message',
        id: 'c',
        role: 'user',
        content: '#12 again',
        richText: rich ?? null,
      },
    ])
    const pulls = pullCandidates(entries)
    expect(pulls.map((pull) => pull.number)).toEqual([12, 40, 41])
    expect(pulls[0]?.title).toBe('Fix login')
    expect(filterPulls(pulls, 'log').map((pull) => pull.number)).toEqual([12])
    expect(filterPulls(pulls, '4').map((pull) => pull.number)).toEqual([40, 41])
  })
})

describe('the message’s document', () => {
  it('is written as the window’s editor writes it, and the picks are kept while the words change', () => {
    let picked = picking(
      { kind: 'mention', id: 'a1', label: 'Nora' },
      3,
      'Hi @no',
      [],
    )
    expect(picked.draft).toBe('Hi @Nora ')
    picked = picking(
      { kind: 'workflow', id: 'w1', label: 'Weekly report' },
      13,
      picked.draft + 'run /wee',
      picked.chips,
    )
    expect(picked.draft).toBe('Hi @Nora run @Weekly report ')
    expect(textStart(picked.chips, picked.draft)).toBe(27)
    const draft = picked.draft + 'now\nthanks'
    const written = richText(draft, picked.chips)!
    const doc = JSON.parse(written)
    expect(doc.type).toBe('doc')
    const pieces = doc.content[0].content
    expect(pieces[0]).toEqual({ type: 'text', text: 'Hi ' })
    expect(pieces[1]).toEqual({
      type: 'mention',
      attrs: { id: 'a1', label: 'Nora', mentionSuggestionChar: '@' },
    })
    expect(pieces[2]).toEqual({ type: 'text', text: ' run ' })
    expect(pieces[3].type).toBe('workflowReference')
    expect(pieces[3].attrs.iconUrl).toBeNull()
    expect(pieces[4]).toEqual({ type: 'text', text: ' now' })
    expect(pieces[5]).toEqual({ type: 'hardBreak' })
    expect(pieces[6]).toEqual({ type: 'text', text: 'thanks' })
    expect(richText('', [])).toBeUndefined()
    // Words typed before a pick move it; a pick edited is gone.
    expect(
      carry(picked.chips, picked.draft, 'Oh ' + picked.draft).map(
        (chip) => chip.start,
      ),
    ).toEqual([6, 16])
    expect(
      carry(picked.chips, picked.draft, 'Hi @Nra run @Weekly report ').map(
        (chip) => chipText(chip.node),
      ),
    ).toEqual(['@Weekly report'])
    // A canceled message comes back as it was.
    const back = draftFrom(written)!
    expect(back.draft).toBe(draft)
    expect(back.chips).toEqual(picked.chips)
  })

  it('keeps the words after the caret when a pick goes in the middle', () => {
    const first = picking({ kind: 'pullRequest', number: 7 }, 0, '#', [])
    const words = 'Ask @no about ' + first.draft
    const chips = carry(first.chips, first.draft, words)
    const middle = pickingBetween(
      { kind: 'mention', id: 'a1', label: 'Nora' },
      4,
      7,
      words,
      chips,
    )
    expect(middle.draft).toBe('Ask @Nora  about #7 ')
    expect(
      middle.chips.map((chip) => [chip.start, chipText(chip.node)]),
    ).toEqual([
      [4, '@Nora'],
      [17, '#7'],
    ])
  })
})

describe('what the store reads for the lists', () => {
  it('reads the skills without waking a resting computer, and the connected apps', async () => {
    const backend = new FakeBackend()
    backend.commandAnswers.getAgentWorkflows = () => ({
      workflows: [{ id: 'w1', name: 'Weekly report', isEnabledForAgent: true }],
    })
    backend.commandAnswers.desktopMcp = (): JSONValue => ({
      servers: [
        { id: 's1', name: 'Gmail', status: 'connected', accountKey: 'default' },
        { name: 'No id' },
      ],
    })
    const store = new AppStore()
    await store.attach(backend)
    const answer = await store.workflows('theo', false)
    expect(skillsFrom(answer).map((skill) => skill.name)).toEqual([
      'Weekly report',
    ])
    await store.loadApps(false)
    expect(store.apps.map((app) => app.name)).toEqual(['Gmail'])
    expect(
      backend.commands
        // The roster and the sidebar's pins and sections are read on attaching.
        .filter(
          (one) =>
            one.method !== 'listAgents' && one.method !== 'getHostSettings',
        )
        .map((one) => [one.method, one.wakes]),
    ).toEqual([
      ['getAgentWorkflows', false],
      ['desktopMcp', false],
    ])
    // Refused: nothing, quietly.
    backend.refusedCommands.add('getAgentWorkflows')
    expect(await store.workflows('theo')).toEqual([])
  })
})
