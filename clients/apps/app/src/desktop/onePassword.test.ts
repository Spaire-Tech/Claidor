// Connecting 1Password from the Windows app (OnePasswordCards.swift's
// `OnePasswordConnectCardView.connect`, MacOnePassword.swift's `Failure`),
// against a stand-in app: the accounts first, a picker when there are
// several, then the vault and its key; what each failure says, and when
// How to set it up is offered.

import { afterEach, describe, expect, it } from 'vitest'
import { desktop } from './desktop'
import {
  type OnePasswordFailure,
  accountLabel,
  connectStep,
  failureMessage,
  needsSetup,
} from './onePassword'
import { FakeDesktop } from './testing'

let uninstall: (() => void) | undefined
afterEach(() => uninstall?.())

const work = {
  id: 'WORKUUID',
  email: 'sam@work.example',
  url: 'work.1password.com',
}
const home = { id: 'HOMEUUID', email: 'sam@home.example', url: '' }
const made = {
  token: 'ops_fake_key_for_the_test_only',
  vaultId: 'v1',
  vaultName: 'Shared with Simeon',
  accountEmail: 'sam@work.example',
}

function app(accounts: (typeof work)[]) {
  const fake = new FakeDesktop()
    .answer('onePasswordAccounts', () => ({ accounts }))
    .answer('onePasswordConnect', () => made)
  uninstall = fake.install()
  return { fake, host: desktop()! }
}

describe('Connect (OnePasswordConnectCardView.connect)', () => {
  it('with one account, makes the key at once', async () => {
    const { fake, host } = app([work])
    const step = await connectStep(host, [], undefined)
    expect(step).toEqual({ accounts: [work], kind: 'made', made })
    expect(fake.calls.map((call) => [call.name, ...call.args])).toEqual([
      ['onePasswordAccounts'],
      ['onePasswordConnect', 'WORKUUID'],
    ])
  })

  it('with several, asks which first, then makes the key in the one picked', async () => {
    const { fake, host } = app([work, home])
    const first = await connectStep(host, [], undefined)
    expect(first).toEqual({ accounts: [work, home], kind: 'pick' })
    const second = await connectStep(host, first.accounts, 'HOMEUUID')
    expect(second.kind).toBe('made')
    expect(fake.calls.map((call) => [call.name, ...call.args])).toEqual([
      ['onePasswordAccounts'],
      ['onePasswordConnect', 'HOMEUUID'],
    ])
  })

  it('reads the accounts again only when none were read', async () => {
    const { fake, host } = app([work])
    fake.answer('onePasswordConnect', () => ({ failure: 'noVault' }))
    const failed = await connectStep(host, [], undefined)
    expect(failed).toEqual({
      accounts: [work],
      kind: 'failed',
      failure: { kind: 'noVault' },
    })
    await connectStep(host, failed.accounts, undefined)
    expect(
      fake.calls.filter((call) => call.name === 'onePasswordAccounts'),
    ).toHaveLength(1)
  })

  it('says what went wrong: no tool, no accounts, 1Password’s own sentence, no answer', async () => {
    const { fake, host } = app([])
    expect(await connectStep(host, [], undefined)).toEqual({
      accounts: [],
      kind: 'failed',
      failure: { kind: 'noAccounts' },
    })
    fake.answer('onePasswordAccounts', () => ({ failure: 'noTool' }))
    expect((await connectStep(host, [], undefined)).kind).toBe('failed')
    fake.answer('onePasswordAccounts', () => ({
      refused: 'You are not currently signed in.',
    }))
    expect(await connectStep(host, [], undefined)).toEqual({
      accounts: [],
      kind: 'failed',
      failure: { kind: 'refused', said: 'You are not currently signed in.' },
    })
    fake.answer('onePasswordAccounts', () => {
      throw new Error('timed out')
    })
    expect(await connectStep(host, [], undefined)).toEqual({
      accounts: [],
      kind: 'failed',
      failure: { kind: 'noAnswer' },
    })
  })
})

describe('what the card says (MacOnePassword.Failure)', () => {
  it('names an account by its e-mail and its sign-in address', () => {
    expect(accountLabel(work)).toBe('sam@work.example · work.1password.com')
    expect(accountLabel(home)).toBe('sam@home.example')
  })

  it('says the Mac’s words, or 1Password’s own', () => {
    expect(failureMessage({ kind: 'noTool' })).toBe(
      "Install 1Password's command-line tool, then turn on Integrate with 1Password CLI in the 1Password app (Settings → Developer).",
    )
    expect(failureMessage({ kind: 'noKey' })).toBe(
      "1Password didn't give a key.",
    )
    expect(failureMessage({ kind: 'refused', said: 'Locked.' })).toBe('Locked.')
  })

  it('offers How to set it up when the app’s CLI integration is off, locked or signed out', () => {
    const yes: OnePasswordFailure[] = [
      { kind: 'noTool' },
      { kind: 'noAccounts' },
      {
        kind: 'refused',
        said: 'connecting to desktop app: cannot connect to 1Password app',
      },
      { kind: 'refused', said: 'App integration is turned off.' },
      { kind: 'refused', said: 'You are not signed in.' },
    ]
    const no: OnePasswordFailure[] = [
      { kind: 'noVault' },
      { kind: 'noKey' },
      { kind: 'noAnswer' },
      { kind: 'refused', said: 'Service accounts are disabled for this team.' },
    ]
    for (const failure of yes) expect(needsSetup(failure)).toBe(true)
    for (const failure of no) expect(needsSetup(failure)).toBe(false)
  })
})
