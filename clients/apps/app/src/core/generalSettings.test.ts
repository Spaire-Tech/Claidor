// Step 6e's General, account and Permissions rules against the shared
// core's answers: SettingsTests' account card lines, rules editor and time
// zones on `Fixtures/settings.json`, read in place (the usage parts are
// 6f's); LanguageTests' picker; the page's model (`GeneralSettingsModel`)
// and the store's commands (StoreSettings.swift) against the stand-in
// computer and server.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import { autoReviewFrom } from './cards'
import {
  type AutoReviewInstructions,
  GeneralSettingsModel,
  type GeneralSettingsStore,
  type ReviewRule,
  type RuleBehavior,
  accountDisplay,
  automaticZoneLabel,
  availableLanguages,
  clipRule,
  isFullList,
  isHiddenZone,
  languageChoices,
  normalizedRules,
  relocatedRule,
  removingRule,
  reviewRules,
  ruleListLabel,
  savingRule,
  zoneOverrideOf,
  zoneTimesNow,
  zoneValues,
} from './generalSettings'
import { type JSONValue, field } from './json'
import { chooseLanguage, chosenLanguage, languageKey } from './language'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, eventually } from './testing'

const fixture = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../ios/SimeonCore/Tests/SimeonCoreTests/Fixtures/settings.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  accounts: {
    displayName: string | null
    email: string | null
    name: string | null
    secondary: string | null
  }[]
  rules: { instructions: JSONValue; op: JSONValue; result: JSONValue }[]
}

/** The lists as the fixture writes them (`AutoReviewInstructions(json:)`, step 3a's reader). */
const instructions = (json: JSONValue | undefined): AutoReviewInstructions =>
  autoReviewFrom(json)

const rule = (json: JSONValue | undefined): ReviewRule => ({
  behavior: ((field(json, 'behavior') as string | undefined) ??
    'allow') as RuleBehavior,
  text: (field(json, 'text') as string | undefined) ?? '',
  listIndex: (field(json, 'listIndex') as number | undefined) ?? -1,
})

describe('the account card (SettingsTests.testAccountCardLines)', () => {
  it('gives the core’s lines for every account in its fixture', () => {
    expect(fixture.accounts.length).toBeGreaterThan(3)
    for (const row of fixture.accounts) {
      const display = accountDisplay(row.displayName, row.email)
      expect(display.name ?? null).toBe(row.name)
      expect(display.secondary ?? null).toBe(row.secondary)
    }
    expect(accountDisplay(undefined, undefined).title).toBe('Simeon')
  })
})

describe('Auto-review’s rules (SettingsTests)', () => {
  it('answers as the window’s editor for every case in the fixture (testRulesEditorAnswersAsTheWindow)', () => {
    expect(fixture.rules.length).toBeGreaterThan(300)
    fixture.rules.forEach((row, index) => {
      const start = instructions(row.instructions)
      const op = row.op
      const kind = field(op, 'kind') as string
      const label = `case ${index}: ${kind}`
      switch (kind) {
        case 'add':
        case 'edit': {
          const behavior = (field(op, 'behavior') as RuleBehavior) ?? 'allow'
          const editing = kind === 'edit' ? rule(field(op, 'rule')) : undefined
          const saved = savingRule(
            start,
            (field(op, 'text') as string) ?? '',
            behavior,
            editing,
          )
          if (row.result == null) expect(saved, label).toBeUndefined()
          else expect(saved, label).toEqual(instructions(row.result))
          break
        }
        case 'remove':
          expect(removingRule(start, rule(field(op, 'rule'))), label).toEqual(
            instructions(row.result),
          )
          break
        case 'relocate': {
          const found = relocatedRule(start, rule(field(op, 'rule')))
          if (row.result == null) expect(found, label).toBeUndefined()
          else expect(found, label).toEqual(rule(row.result))
          break
        }
        default:
          throw new Error(label)
      }
    })
  })

  it('keeps their order and limits (testRulesKeepTheirOrderAndLimits)', () => {
    let rules: AutoReviewInstructions = { isEnabled: true, allow: [], ask: [] }
    rules = savingRule(rules, 'reply to emails', 'allow', undefined)!
    rules = savingRule(rules, 'pay invoices', 'ask', undefined)!
    expect(reviewRules(rules).map((one) => one.text)).toEqual([
      'reply to emails',
      'pay invoices',
    ])
    expect(
      savingRule(rules, 'reply to emails', 'allow', undefined),
    ).toBeUndefined()
    const full: AutoReviewInstructions = {
      isEnabled: true,
      allow: Array.from({ length: 20 }, (_, i) => `rule ${i}`),
      ask: [],
    }
    expect(isFullList(full.allow)).toBe(true)
    expect(savingRule(full, 'one more', 'allow', undefined)).toBeUndefined()
    expect(clipRule('a'.repeat(1_200))).toHaveLength(1_000)
    expect(ruleListLabel('ask')).toBe('Ask first')
  })

  it('cuts a rule at a thousand characters as Swift counts them, and keeps the host’s rules as the host does', () => {
    // An emoji is one character, as in Swift (`count`), not two of JavaScript's.
    expect([
      ...new Intl.Segmenter().segment(clipRule('👍'.repeat(1_001))),
    ]).toHaveLength(1_000)
    expect(
      normalizedRules({
        isEnabled: false,
        allowInstructions: [
          '  a ',
          'a',
          '',
          7,
          ...Array.from({ length: 25 }, (_, i) => `r${i}`),
        ],
        blockInstructions: ['b'],
      }),
    ).toEqual({
      isEnabled: false,
      allow: ['a', ...Array.from({ length: 19 }, (_, i) => `r${i}`)],
      ask: ['b'],
    })
    expect(normalizedRules(undefined)).toEqual({
      isEnabled: true,
      allow: [],
      ask: [],
    })
  })
})

describe('the time zone (SettingsTests.testTimeZoneChoices)', () => {
  it('names and orders the menu’s zones as the core', () => {
    expect(automaticZoneLabel('America/New_York')).toBe(
      'Auto-detect (America/New York)',
    )
    expect(automaticZoneLabel(undefined)).toBe('Auto-detect')
    expect(zoneValues('Mars/Olympus', ['Europe/Paris'])).toEqual([
      'auto',
      'Mars/Olympus',
      'Europe/Paris',
    ])
    expect(zoneValues('Europe/Paris', ['Europe/Paris'])).toEqual([
      'auto',
      'Europe/Paris',
    ])
  })

  it('writes each zone’s time now as the Mac’s menu: English’s own "h:mm a", another language’s own way, nothing for an unknown zone', () => {
    const at = new Date(Date.UTC(2026, 10, 2, 20, 16))
    expect(
      zoneTimesNow(['Europe/London', 'Asia/Tokyo', 'Mars/Olympus'], at, 'en'),
    ).toEqual(['8:16 PM', '5:16 AM', ''])
    expect(zoneTimesNow(['Europe/Paris'], at, 'fr')).toEqual(['21:16'])
  })

  it('reads the zone chosen as the host keeps it: an empty one is none', () => {
    expect(zoneOverrideOf({ userTimeZoneOverride: ' Europe/Paris\t' })).toBe(
      'Europe/Paris',
    )
    expect(zoneOverrideOf({ userTimeZoneOverride: '  ' })).toBeUndefined()
    expect(zoneOverrideOf({ userTimeZone: 'Europe/Paris' })).toBeUndefined()
    expect(zoneOverrideOf(undefined)).toBeUndefined()
  })
})

describe('the Language picker (LanguageTests.testThePickerKeepsTheAppsOwnLanguageApartFromTheDevices)', () => {
  it('keeps the app’s own language in this browser, apart from the browser’s', () => {
    const kept = new Map<string, string>()
    const storage = {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
      removeItem: (key: string) => void kept.delete(key),
    }
    expect(chosenLanguage(storage)).toBe('system')
    chooseLanguage('fr', storage)
    expect(chosenLanguage(storage)).toBe('fr')
    expect(kept.get(languageKey)).toBe('fr')
    expect(languageKey).toBe('simeon.language')
    chooseLanguage('system', storage)
    expect(chosenLanguage(storage)).toBe('system')
    expect(kept.has(languageKey)).toBe(false)
    // One Simeon isn't in reads as System.
    kept.set(languageKey, 'xx')
    expect(chosenLanguage(storage)).toBe('system')
    kept.set(languageKey, 'pt_BR')
    expect(chosenLanguage(storage)).toBe('pt-BR')
    // A storage that refuses: System.
    expect(
      chosenLanguage({
        getItem: () => {
          throw new Error('denied')
        },
      }),
    ).toBe('system')
  })

  it('lists System, then English, then the others by their own name', () => {
    expect(availableLanguages(['Base', 'fr', 'en', 'de'])).toEqual([
      'en',
      'de',
      'fr',
    ])
    expect(languageChoices(['Base', 'fr', 'en']).map((c) => c.value)).toEqual([
      'system',
      'en',
      'fr',
    ])
    expect(languageChoices(['en', 'fr']).map((c) => c.label)).toEqual([
      'System',
      'English',
      'Français',
    ])
    expect(languageChoices().map((c) => c.label)).toEqual([
      'System',
      'English',
      'Deutsch',
      'Español',
      'Français',
      'Italiano',
      'Nederlands',
      'Polski',
      'Português (Brasil)',
      'Svenska',
      'Türkçe',
    ])
  })
})

/** The store as the model sees it, answering as the test says. */
class StandIn implements GeneralSettingsStore {
  settings: JSONValue | undefined = {}
  refuses = false
  zones: { zone?: string; detected: string }[] = []
  written: AutoReviewInstructions[] = []
  private waiting: (() => void)[] = []
  holds = false
  holdsRead = false

  async readHostSettings() {
    const settings = this.settings
    if (this.holdsRead) await new Promise<void>((go) => this.waiting.push(go))
    return settings
  }
  async setTimeZone(zone: string | undefined, detected: string) {
    this.zones.push({ zone, detected })
    return !this.refuses
  }
  async setAutoReview(rules: AutoReviewInstructions) {
    this.written.push(rules)
    if (this.holds) await new Promise<void>((go) => this.waiting.push(go))
    return !this.refuses
  }
  release() {
    for (const go of this.waiting.splice(0)) go()
  }
}

describe('the pages’ values (GeneralSettingsModel)', () => {
  it('reads the zone chosen and the rules as the page shows, and keeps a zone once the computer has it', async () => {
    const store = new StandIn()
    store.settings = {
      userTimeZone: 'Europe/Paris',
      userTimeZoneOverride: 'Asia/Tokyo',
      autoReviewInstructions: {
        isEnabled: false,
        allowInstructions: ['read my calendar', 'read my calendar'],
        blockInstructions: [],
      },
    }
    const model = new GeneralSettingsModel(store, 'Africa/Dakar')
    await model.load()
    expect(model.zoneOverride).toBe('Asia/Tokyo')
    expect(model.rules).toEqual({
      isEnabled: false,
      allow: ['read my calendar'],
      ask: [],
    })
    await model.setZone(undefined)
    expect(store.zones).toEqual([{ zone: undefined, detected: 'Africa/Dakar' }])
    expect(model.zoneOverride).toBeUndefined()
    // Refused: the old value stays, and nothing is said.
    store.refuses = true
    await model.setZone('Europe/Paris')
    expect(model.zoneOverride).toBeUndefined()
    expect(model.zonePending).toBe(false)
    // Settings that can't be read change nothing.
    store.settings = undefined
    await model.load()
    expect(model.rules.allow).toEqual(['read my calendar'])
  })

  it('reads again when the computer comes back after a failed read, never as it goes to rest', async () => {
    const store = new StandIn()
    let reads = 0
    const read = store.readHostSettings.bind(store)
    store.readHostSettings = () => {
      reads += 1
      return read()
    }
    const listeners = new Set<() => void>()
    const stream = {
      isLive: true,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
    const tell = (live: boolean) => {
      stream.isLive = live
      for (const listener of [...listeners]) listener()
    }
    const model = new GeneralSettingsModel(store, 'UTC')
    store.settings = undefined
    await model.load()
    expect(model.loadFailed).toBe(true)
    const stop = model.readAgainWhenBack(stream)
    // The computer goes to rest: a read would wake it.
    tell(false)
    expect(reads).toBe(1)
    // Back: read again, as nothing was read.
    store.settings = { userTimeZoneOverride: 'Asia/Tokyo' }
    tell(true)
    await eventually(() => model.loaded)
    expect(reads).toBe(2)
    expect(model.zoneOverride).toBe('Asia/Tokyo')
    // Read: resting and coming back again ask nothing more.
    tell(false)
    tell(true)
    expect(reads).toBe(2)
    stop()
    expect(listeners.size).toBe(0)
  })

  it('adds, edits, moves and deletes rules, each shown once the computer has it', async () => {
    const store = new StandIn()
    const model = new GeneralSettingsModel(store, 'UTC')
    await model.load()
    model.setDraft('allow', '  read my calendar  ')
    expect(model.canAdd('allow')).toBe(true)
    await model.add('allow')
    expect(model.rules.allow).toEqual(['read my calendar'])
    expect(model.drafts.allow).toBeUndefined()
    // Twice in a list: Add can't be pressed.
    model.setDraft('allow', 'read my calendar')
    expect(model.canAdd('allow')).toBe(false)
    model.setDraft('allow', 'reply to emails')
    await model.add('allow')
    // An edit moving a rule to Ask first: it goes to that list's end.
    const first = reviewRules(model.rules)[0]!
    model.edit(first)
    expect(model.canAdd('ask')).toBe(false)
    model.setEditingBehavior('ask')
    model.setEditingText('pay invoices')
    expect(model.canSave).toBe(true)
    await model.save()
    expect(model.rules).toEqual({
      isEnabled: true,
      allow: ['reply to emails'],
      ask: ['pay invoices'],
    })
    expect(model.editing).toBeUndefined()
    // A refused write keeps the old lists.
    store.refuses = true
    await model.delete(reviewRules(model.rules)[0]!)
    expect(model.rules.allow).toEqual(['reply to emails'])
    store.refuses = false
    await model.delete(reviewRules(model.rules)[0]!)
    expect(model.rules.allow).toEqual([])
    await model.setReviewing(false)
    expect(model.rules.isEnabled).toBe(false)
    expect(store.written.at(-1)).toEqual({
      isEnabled: false,
      allow: [],
      ask: ['pay invoices'],
    })
  })

  it('finds the rule being edited again after another rule went, and waits while a change goes', async () => {
    const store = new StandIn()
    const model = new GeneralSettingsModel(store, 'UTC')
    store.settings = {
      autoReviewInstructions: {
        allowInstructions: ['a', 'b', 'c'],
        blockInstructions: [],
      },
    }
    await model.load()
    const [a, , c] = reviewRules(model.rules)
    model.edit(c!)
    model.setEditingText('c, changed')
    // Another edit can't start while one is under way.
    model.edit(a!)
    expect(model.editing?.rule).toEqual(c)
    store.holds = true
    const going = model.delete(a!)
    expect(model.rulesPending).toBe(true)
    expect(model.canSave).toBe(false)
    expect(model.canAdd('allow')).toBe(false)
    store.release()
    await going
    expect(model.editing).toEqual({
      rule: { behavior: 'allow', text: 'c', listIndex: 1 },
      text: 'c, changed',
      behavior: 'allow',
    })
    // The rule edited deleted: the edit is over.
    store.holds = false
    await model.delete(model.editing!.rule)
    expect(model.editing).toBeUndefined()
  })
})

describe('the pages wait for the computer’s values (after the review)', () => {
  it('writes nothing before the read, and a read that failed keeps the page waiting', async () => {
    const store = new StandIn()
    store.settings = undefined
    const model = new GeneralSettingsModel(store, 'Europe/Paris')
    // The page's defaults: Auto-review on, no rules, the zone automatic. None of it may be written.
    await model.setZone('Asia/Tokyo')
    await model.setReviewing(false)
    model.setDraft('allow', 'read my calendar')
    expect(model.canAdd('allow')).toBe(false)
    await model.add('allow')
    await model.delete({ behavior: 'allow', text: 'x', listIndex: 0 })
    model.edit({ behavior: 'allow', text: 'x', listIndex: 0 })
    expect(model.editing).toBeUndefined()
    expect(store.zones).toEqual([])
    expect(store.written).toEqual([])
    await model.load()
    expect(model.loadFailed).toBe(true)
    expect(model.loaded).toBe(false)
    await model.setReviewing(false)
    expect(store.written).toEqual([])
    // Read at last: the person's own rules, then a change on them.
    store.settings = {
      autoReviewInstructions: {
        isEnabled: false,
        allowInstructions: Array.from({ length: 15 }, (_, i) => `rule ${i}`),
        blockInstructions: [],
      },
    }
    await model.load()
    expect(model.loaded).toBe(true)
    expect(model.loadFailed).toBe(false)
    await model.add('allow')
    expect(store.written.at(-1)?.allow).toHaveLength(16)
    expect(store.written.at(-1)?.isEnabled).toBe(false)
  })

  it('drops a read that answers after a change began, so the change stays on screen', async () => {
    const store = new StandIn()
    store.settings = { userTimeZoneOverride: 'Asia/Tokyo' }
    const model = new GeneralSettingsModel(store, 'Europe/Paris')
    await model.load()
    store.holdsRead = true
    const reading = model.load()
    await model.setZone(undefined)
    expect(model.zoneOverride).toBeUndefined()
    store.release()
    await reading
    expect(model.zoneOverride).toBeUndefined()
  })

  it('follows the zone the computer keeps when the browser hides its own (UTC)', async () => {
    const store = new StandIn()
    store.settings = { userTimeZone: 'Europe/Paris' }
    const hidden = new GeneralSettingsModel(store, 'UTC')
    expect(hidden.followedZone).toBe('UTC')
    await hidden.load()
    expect(hidden.followedZone).toBe('Europe/Paris')
    const plain = new GeneralSettingsModel(store, 'America/New_York')
    await plain.load()
    expect(plain.followedZone).toBe('America/New_York')
    store.settings = {}
    const unknown = new GeneralSettingsModel(store, 'Etc/UTC')
    await unknown.load()
    expect(unknown.followedZone).toBe('Etc/UTC')
    expect(isHiddenZone('UTC') && isHiddenZone('Etc/UTC')).toBe(true)
    expect(isHiddenZone('Europe/London') || isHiddenZone('GMT')).toBe(false)
  })
})

describe('the store’s settings commands (StoreSettings.swift)', () => {
  async function started() {
    const backend = new FakeBackend()
    backend.agents = [makeAgent({ id: 'theo', name: 'Theo' })]
    const store = new AppStore()
    store.account = { name: 'Bass', email: 'bass@simeonlabs.com' }
    store.timeZoneNow = () => 'Europe/Paris'
    await store.attach(backend)
    return { store, backend }
  }

  it('changes the name: saved, the account showing it, the computer told without waking it', async () => {
    const { store, backend } = await started()
    backend.serverAnswers['user/name'] = { name: 'Bass Fall' }
    expect(await store.changeName('  Bass   Fall ')).toBeUndefined()
    expect(backend.serverCalls.at(-1)).toEqual({
      path: 'user/name',
      method: 'POST',
      body: { name: 'Bass Fall' },
    })
    expect(store.account?.name).toBe('Bass Fall')
    expect(
      backend.commands.find((c) => c.method === 'refreshUserName'),
    ).toEqual({ method: 'refreshUserName', args: {}, wakes: false })
    store.detach()
  })

  it('says why a name was refused: the server’s sentence, else the core’s', async () => {
    const { store, backend } = await started()
    backend.server = async () => {
      throw new SimeonAPIError('A name of 1 to 60 characters.', 400)
    }
    expect(await store.changeName('x')).toBe('A name of 1 to 60 characters.')
    expect(store.account?.name).toBe('Bass')
    backend.server = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await store.changeName('x')).toBe("Couldn't change it")
    store.detach()
    expect(await store.changeName('x')).toBe('Sign in to Simeon first.')
  })

  it('asks whether the account has a password, and sets one: the server’s refusal said', async () => {
    const { store, backend } = await started()
    backend.serverAnswers['account/password'] = { set: true }
    expect(await store.hasPassword()).toBe(true)
    expect(backend.serverCalls.at(-1)?.method).toBe('GET')
    expect(await store.setPassword('correct horse')).toBeUndefined()
    expect(backend.serverCalls.at(-1)).toEqual({
      path: 'account/password',
      method: 'PUT',
      body: { password: 'correct horse' },
    })
    backend.server = async () => {
      throw new SimeonAPIError('Use at least 8 characters.', 400)
    }
    expect(await store.setPassword('short')).toBe('Use at least 8 characters.')
    expect(await store.hasPassword()).toBeUndefined()
    backend.server = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await store.setPassword('long enough')).toBe(
      "The password wasn't saved. Try again.",
    )
    store.detach()
  })

  it('writes the zone, the switch and the rules as the host keeps them', async () => {
    const { store, backend } = await started()
    const written = () =>
      backend.commands.filter((c) => c.method === 'setHostSettings')
    expect(await store.setTimeZone('Asia/Tokyo', 'Europe/Paris')).toBe(true)
    expect(written().at(-1)?.args).toEqual({
      userTimeZone: 'Europe/Paris',
      userTimeZoneOverride: 'Asia/Tokyo',
    })
    expect(await store.setTimeZone(undefined, 'Europe/Paris')).toBe(true)
    expect(written().at(-1)?.args).toEqual({
      userTimeZone: 'Europe/Paris',
      userTimeZoneOverride: '',
    })
    expect(
      await store.setAutoReview({
        isEnabled: true,
        allow: [' a ', 'a', ''],
        ask: ['b'],
      }),
    ).toBe(true)
    expect(written().at(-1)?.args).toEqual({
      autoReviewInstructions: {
        isEnabled: true,
        allowInstructions: ['a'],
        blockInstructions: ['b'],
      },
    })
    backend.refusedCommands.add('setHostSettings')
    expect(await store.setTimeZone(undefined, 'UTC')).toBe(false)
    backend.refusedCommands.add('getHostSettings')
    expect(await store.readHostSettings()).toBeUndefined()
    store.detach()
  })

  it('tells the computer the zone this browser is in each time the stream comes back, beside the language', async () => {
    const { store, backend } = await started()
    const told = () =>
      backend.commands.filter(
        (c) =>
          c.method === 'setHostSettings' &&
          field(c.args, 'userTimeZone') !== undefined &&
          field(c.args, 'userTimeZoneOverride') === undefined,
      )
    store.apply({ kind: 'connection', live: true })
    await eventually(() => told().length === 1)
    expect(told()[0]).toEqual({
      method: 'setHostSettings',
      args: { userTimeZone: 'Europe/Paris' },
      wakes: false,
    })
    store.apply({ kind: 'connection', live: false })
    store.apply({ kind: 'connection', live: true })
    await eventually(() => told().length === 2)
    store.detach()
  })

  it('tells nothing, and writes no zone of its own, for a browser that hides its zone (UTC)', async () => {
    const { store, backend } = await started()
    store.timeZoneNow = () => 'UTC'
    store.apply({ kind: 'connection', live: true })
    await eventually(() =>
      backend.commands.some(
        (c) =>
          c.method === 'setHostSettings' &&
          field(c.args, 'userLanguage') !== undefined,
      ),
    )
    await new Promise((done) => setTimeout(done, 20))
    expect(
      backend.commands.filter(
        (c) =>
          c.method === 'setHostSettings' &&
          field(c.args, 'userTimeZone') !== undefined,
      ),
    ).toEqual([])
    expect(await store.setTimeZone(undefined)).toBe(true)
    expect(
      backend.commands.filter((c) => c.method === 'setHostSettings').at(-1)
        ?.args,
    ).toEqual({ userTimeZoneOverride: '' })
    expect(await store.setTimeZone('Asia/Tokyo', 'Etc/UTC')).toBe(true)
    expect(
      backend.commands.filter((c) => c.method === 'setHostSettings').at(-1)
        ?.args,
    ).toEqual({ userTimeZoneOverride: 'Asia/Tokyo' })
    store.detach()
  })
})
