// The cards that ask the person for something, as the core reads them: the
// in-chat form (SimeonCore's `UserFormTests`), 1Password's fill and connect
// cards (`OnePasswordCardsTests`), the hand-off's state (`ComputerStoreTests`'s
// `testHandoffCard`), and the secret and the hand-off as the Mac draws them
// (`CoreTests`' `testEveryCardTheMacDraws`, the demo's `x10` and `x11`).

import { beforeAll, describe, expect, it } from 'vitest'
import { cardText, rowFor } from './chat'
import { Entry } from './entry'
import type { JSONObject, JSONValue } from './json'
import {
  canFill,
  computerCard,
  connectStatusLine,
  credentialCard,
  credentialConfirmReason,
  credentialOutcomeLine,
  credentialStatusLine,
  formOutcomeLine,
  formStatusLine,
  formValues,
  handoffCardState,
  handoffOutcome,
  onePasswordConnectCard,
  pendingHandoff,
  secretCard,
  userFormCard,
} from './requestCards'
import { loadWords } from './words'

beforeAll(() => loadWords('en'))

function entry(json: JSONObject): Entry {
  const made = Entry.from(json)
  if (!made) throw new Error('no entry')
  return made
}

/** A `send-message` line with this message, and the entry's own fields. */
function line(id: string, message: JSONObject, fields: JSONObject = {}): Entry {
  return entry({
    id,
    kind: 'send-message',
    timestampMs: 1,
    message,
    ...fields,
  })
}

/** The card kind the chat gives a line, as `Chat.row(for:)` makes it a `.request`. */
function kindOf(made: Entry): string | undefined {
  const row = rowFor(made)
  return row?.kind === 'card' ? row.card : row?.kind
}

describe('the in-chat form', () => {
  const message: JSONObject = {
    type: 'user-form',
    form: {
      title: 'Sign in to Acme',
      instruction: 'Acme asks for your email and password.',
      reason: 'auth',
      domain: 'acme.example',
      submitAfterFill: false,
      fields: [
        {
          id: 'email',
          label: 'Email',
          type: 'email',
          secret: false,
          required: true,
          target: { ref: 'e12' },
        },
        {
          id: 'password',
          label: 'Password',
          type: 'password',
          secret: true,
          required: true,
          target: { label: 'Password' },
        },
        {
          id: 'remember',
          label: 'Keep me signed in',
          type: 'checkbox',
          secret: false,
          required: false,
          target: { selector: '#remember' },
        },
        {
          id: 'country',
          label: 'Country',
          type: 'select',
          secret: false,
          required: false,
          options: [
            { label: 'France', value: 'fr' },
            { label: 'Spain', value: 'es' },
          ],
          target: { selector: '#c' },
        },
      ],
    },
  }

  const card = (fields: JSONObject = {}) => {
    const made = line('t3s2', message, fields)
    expect(kindOf(made)).toBe('form')
    const read = userFormCard(made)
    if (!read) throw new Error('not a form')
    return read
  }

  it('reads its fields and waits', () => {
    const open = card()
    expect(open.title).toBe('Sign in to Acme')
    expect(open.domain).toBe('acme.example')
    expect(open.fields.map((one) => one.id)).toEqual([
      'email',
      'password',
      'remember',
      'country',
    ])
    expect(open.fields.map((one) => one.kind)).toEqual([
      'email',
      'password',
      'checkbox',
      'select',
    ])
    expect(open.fields.map((one) => one.secret)).toEqual([
      false,
      true,
      false,
      false,
    ])
    expect(open.fields[3]!.options.map((option) => option.value)).toEqual([
      'fr',
      'es',
    ])
    expect(open.state).toBe('open')
    expect(formStatusLine(open)).toBeUndefined()
    expect(cardText(message)).toBe('Sign in to Acme')
  })

  it('waits for every field it needs, and sends only the form’s own', () => {
    const open = card()
    expect(canFill(open, { email: 'ada@example.com' })).toBe(false)
    expect(canFill(open, { email: 'ada@example.com', password: '  ' })).toBe(
      false,
    )
    // A checkbox and an optional menu wait on nothing.
    expect(canFill(open, { email: 'ada@example.com', password: 'pw' })).toBe(
      true,
    )
    expect(
      formValues(open, {
        email: 'ada@example.com',
        password: 'pw',
        remember: 'true',
        other: 'dropped',
      }),
    ).toEqual({
      email: 'ada@example.com',
      password: 'pw',
      remember: 'true',
      country: '',
    })
  })

  it('says what went in once answered', () => {
    const filled = card({
      formState: 'filled',
      formOutcomes: {
        email: 'filled',
        password: 'fillFailed',
        remember: 'notFilled',
        country: 'notFilled',
      },
    })
    expect(formStatusLine(filled)).toBe('Partly filled')
    expect(formOutcomeLine(filled, filled.fields[0]!)).toBe('Typed in')
    expect(formOutcomeLine(filled, filled.fields[1]!)).toBe(
      "Couldn't type it in",
    )
    expect(formOutcomeLine(filled, filled.fields[2]!)).toBe('Left empty')
    expect(
      formStatusLine(
        card({
          formState: 'filled',
          formOutcomes: { email: 'filled', password: 'filled' },
        }),
      ),
    ).toBe('Filled')
    expect(formStatusLine(card({ formState: 'filling' }))).toBe('Filling in…')
    const failed = card({
      formState: 'failed',
      formNote: "Couldn't type it into the page.",
    })
    expect(formStatusLine(failed)).toBe('Not filled')
    expect(failed.note).toBe("Couldn't type it into the page.")
    expect(formStatusLine(card({ formState: 'dismissed' }))).toBe('Dismissed')
  })

  // Beyond the core's tests: its reading, line by line (`UserFormCard.init`).
  it('reads as the core does: trimmed, a field it can’t read left out, a checkbox never required', () => {
    const read = userFormCard(
      line('f', {
        type: 'user-form',
        form: {
          title: '  Verify  ',
          domain: ' bank.example\n',
          submitAfterFill: true,
          fields: [
            { id: 'code', label: 'Code', type: ' otp ', placeholder: ' ' },
            { id: '', label: 'No id', type: 'text' },
            { id: 'x', label: '', type: 'text' },
            { id: 'y', label: 'Unknown', type: 'colour' },
            { id: 'ok', label: 'Agree', type: 'checkbox', required: true },
            {
              id: 'when',
              label: 'When',
              type: 'select',
              placeholder: 'Pick a day',
              options: [{ label: ' Monday ', value: ' ' }, { label: '' }],
            },
          ],
        },
      }),
    )!
    expect(read.title).toBe('Verify')
    expect(read.domain).toBe('bank.example')
    expect(read.instruction).toBe('')
    expect(read.submitsAfterFill).toBe(true)
    expect(read.fields.map((one) => one.id)).toEqual(['code', 'ok', 'when'])
    expect(read.fields[0]).toMatchObject({
      kind: 'otp',
      secret: true,
      required: true,
      placeholder: undefined,
    })
    expect(read.fields[1]!.required).toBe(false)
    expect(read.fields[2]!.placeholder).toBe('Pick a day')
    expect(read.fields[2]!.options).toEqual([
      { label: 'Monday', value: 'Monday' },
    ])
    // A checkbox is sent as "true" or "false", whatever else was kept for it.
    expect(formValues(read, { code: '1234', ok: 'yes' })).toEqual({
      code: '1234',
      ok: 'false',
      when: '',
    })
    // An unknown state reads open; an unknown outcome is left out.
    const unknown = userFormCard(
      line(
        'g',
        {
          type: 'user-form',
          form: {
            title: 'T',
            domain: 'd',
            fields: [{ id: 'a', label: 'A', type: 'text' }],
          },
        },
        { formState: 'typing', formOutcomes: { a: 'maybe' } },
      ),
    )!
    expect(unknown.state).toBe('open')
    expect(formOutcomeLine(unknown, unknown.fields[0]!)).toBeUndefined()
  })

  it('reads a field named as every object’s own as any other', () => {
    const read = userFormCard(
      line('h', {
        type: 'user-form',
        form: {
          title: 'T',
          domain: 'd',
          fields: [{ id: 'constructor', label: 'Name', type: 'text' }],
        },
      }),
    )!
    expect(canFill(read, {})).toBe(false)
    expect(formValues(read, {})).toEqual({ constructor: '' })
    expect(canFill(read, { constructor: 'Ada' })).toBe(true)
  })

  it('waits on a field with only spaces, as the core’s `.whitespaces` does, but not on a line break', () => {
    const read = userFormCard(
      line('n', {
        type: 'user-form',
        form: {
          title: 'T',
          domain: 'd',
          fields: [{ id: 'note', label: 'Note', type: 'textarea' }],
        },
      }),
    )!
    expect(canFill(read, { note: ' \t ' })).toBe(false)
    expect(canFill(read, { note: '\n' })).toBe(true)
  })

  it('is not a form without a title, a site or a field it can read', () => {
    const without = (form: JSONValue) =>
      line('w', { type: 'user-form', form } as JSONObject)
    const fields = [{ id: 'a', label: 'A', type: 'text' }]
    for (const made of [
      without({ domain: 'd', fields }),
      without({ title: 'T', fields }),
      without({ title: 'T', domain: 'd', fields: [] }),
      without('a form'),
      line('w', { type: 'user-form' }),
    ]) {
      // The chat keeps its place as a card, which says it can't be shown.
      expect(kindOf(made)).toBe('form')
      expect(userFormCard(made)).toBeUndefined()
    }
  })
})

describe('1Password’s cards', () => {
  const fill: JSONObject = {
    type: 'credential-request',
    credential: {
      kind: 'browser-login',
      credentialId: 'aaaaaaaaaaaaaaaaaaaaaaaaaa',
      vaultId: 'vvvvvvvvvvvvvvvvvvvvvvvvvv',
      revision: 3,
      title: 'Acme',
      site: 'acme.example',
      purpose: 'To sign in and get the invoice.',
    },
  }

  const credential = (fields: JSONObject = {}) => {
    const made = line('t4s1', fill, fields)
    expect(kindOf(made)).toBe('credential')
    const read = credentialCard(made)
    if (!read) throw new Error('not a fill card')
    return read
  }

  it('reads the login’s name and site, and what went in', () => {
    const open = credential()
    expect(open.title).toBe('Acme')
    expect(open.site).toBe('acme.example')
    expect(open.purpose).toBe('To sign in and get the invoice.')
    expect(open.state).toBe('open')
    expect(credentialStatusLine(open)).toBeUndefined()
    expect(credentialConfirmReason(open)).toBe(
      'Fill your Acme login on acme.example',
    )
    const filled = credential({
      credentialState: 'filled',
      credentialOutcomes: { username: 'notFound', password: 'filled' },
    })
    expect(credentialStatusLine(filled)).toBe('Filled')
    expect(credentialOutcomeLine(filled)).toBe('Password filled')
    const both = credential({
      credentialState: 'filled',
      credentialOutcomes: { username: 'filled', password: 'filled' },
    })
    expect(credentialOutcomeLine(both)).toBe('Username and password filled')
    const declined = credential({ credentialState: 'declined' })
    expect(credentialStatusLine(declined)).toBe('Declined')
    expect(cardText(fill)).toBe('Acme')
  })

  // Beyond the core's tests: every line `outcomeLine` can say, and the other pills.
  it('says each mix of what went in, as the core’s table', () => {
    const cases: [JSONObject, string | undefined][] = [
      [
        { username: 'filled', password: 'filled', otp: 'filled' },
        'Username, password and code filled',
      ],
      [
        { username: 'filled', password: 'filled', otp: 'fillFailed' },
        'Username and password filled',
      ],
      [{ password: 'filled', otp: 'filled' }, 'Password and code filled'],
      [{ username: 'fillFailed', password: 'filled' }, 'Password filled'],
      [{ username: 'filled', otp: 'filled' }, 'Username filled'],
      [{ username: 'filled' }, 'Username filled'],
      [{ otp: 'filled' }, 'Code filled'],
      [{ username: 'notFound', password: 'fillFailed' }, undefined],
      [{}, undefined],
    ]
    for (const [outcomes, said] of cases)
      expect(
        credentialOutcomeLine(
          credential({
            credentialState: 'filled',
            credentialOutcomes: outcomes,
          }),
        ),
        JSON.stringify(outcomes),
      ).toBe(said)
    // Only a filled card says what went in.
    expect(
      credentialOutcomeLine(
        credential({
          credentialState: 'failed',
          credentialOutcomes: { password: 'filled' },
        }),
      ),
    ).toBeUndefined()
    expect(
      credentialStatusLine(credential({ credentialState: 'filling' })),
    ).toBe('Filling in…')
    const failed = credential({
      credentialState: 'failed',
      credentialNote: ' No sign-in field. ',
    })
    expect(credentialStatusLine(failed)).toBe('Not filled')
    expect(failed.note).toBe('No sign-in field.')
    expect(credential({ credentialState: 'later' }).state).toBe('open')
  })

  it('is not a fill card without the login’s name or its site', () => {
    for (const credentialJSON of [
      { site: 'acme.example' },
      { title: 'Acme', site: '  ' },
      'Acme',
    ]) {
      const made = line('c', {
        type: 'credential-request',
        credential: credentialJSON,
      } as JSONObject)
      expect(kindOf(made)).toBe('credential')
      expect(credentialCard(made)).toBeUndefined()
    }
  })

  it('waits to connect, then says Connected', () => {
    const message: JSONObject = {
      type: 'onepassword-connect',
      reason: 'To sign in to Acme.',
    }
    const open = onePasswordConnectCard(line('t4s1', message))
    expect(kindOf(line('t4s1', message))).toBe('onePasswordConnect')
    expect(open.reason).toBe('To sign in to Acme.')
    expect(open.state).toBe('open')
    expect(connectStatusLine(open)).toBeUndefined()
    const done = onePasswordConnectCard(
      line('t4s1', message, {
        connectState: 'connected',
        connectAccount: 'ada@example.com',
      }),
    )
    expect(connectStatusLine(done)).toBe('Connected')
    expect(done.account).toBe('ada@example.com')
    const dismissed = onePasswordConnectCard(
      line(
        't4s1',
        { type: 'onepassword-connect', reason: ' ' },
        {
          connectState: 'dismissed',
        },
      ),
    )
    expect(dismissed.reason).toBeUndefined()
    expect(connectStatusLine(dismissed)).toBe('Dismissed')
    expect(cardText(message)).toBe('Connect 1Password')
  })
})

describe('the computer handed over', () => {
  const asking = pendingHandoff({
    agentId: 'a',
    state: 'running',
    handoff: {
      requestId: 'r1',
      instruction: 'Sign in to Gmail',
      snapshotDataUrl: 'data:image/webp;base64,AAAA',
    },
  })
  const other = pendingHandoff({
    agentId: 'a',
    state: 'running',
    handoff: { requestId: 'r2', instruction: 'Another' },
  })
  const plain = pendingHandoff({ agentId: 'a', state: 'running' })
  const card = (instruction: string, resolution?: string) => ({
    requestId: 'r1',
    instruction,
    resolution,
  })

  it('waits while the status carries its request or while it is unresolved; settled, what happened', () => {
    const matched = handoffCardState(card('from the message'), asking)
    expect(matched.waiting).toBe(true)
    expect(matched.instruction).toBe('Sign in to Gmail')
    expect(matched.snapshotDataUrl).toBe('data:image/webp;base64,AAAA')

    // Unresolved with an unreadable status: the window says Done here; this waits.
    const unread = handoffCardState(card('from the message'), undefined)
    expect(unread.waiting).toBe(true)
    expect(unread.instruction).toBe('from the message')
    expect(unread.snapshotDataUrl).toBeUndefined()

    // Another request on the computer: this one keeps its own words and no picture.
    expect(handoffCardState(card('x'), other).snapshotDataUrl).toBeUndefined()
    expect(handoffCardState(card('x'), other).instruction).toBe('x')

    // Every word the engine writes, older and newer: Stop task is Canceled, not Done.
    const cases: [string, string, string][] = [
      ['handed_back', 'Done', 'done'],
      ['completed', 'Done', 'done'],
      ['replied', 'Answered', 'answered'],
      ['dismissed', 'Skipped', 'skipped'],
      ['cancelled', 'Canceled', 'canceled'],
      ['anything', 'Done', 'done'],
    ]
    expect(plain).toBeUndefined()
    for (const [resolution, outcome, ending] of cases) {
      const settled = handoffCardState(card('x', resolution), plain)
      expect(settled.waiting, resolution).toBe(false)
      expect(settled.outcome, resolution).toBe(outcome)
      expect(settled.ending, resolution).toBe(ending)
    }
    expect(handoffOutcome('canceled')).toBe('canceled')
    // Resolved in the chat but still on the computer: waiting, as the window has it.
    expect(handoffCardState(card('x', 'completed'), asking).waiting).toBe(true)
  })

  it('reads the status’s hand-off as `BoxStatus` does', () => {
    expect(pendingHandoff(undefined)).toBeUndefined()
    expect(pendingHandoff('running')).toBeUndefined()
    expect(pendingHandoff({ handoff: { instruction: 'x' } })).toBeUndefined()
    expect(
      pendingHandoff({ handoff: { requestId: 'r', snapshotDataUrl: '' } }),
    ).toEqual({ requestId: 'r', instruction: '', snapshotDataUrl: undefined })
  })

  it('says what happened in the person’s language', async () => {
    await loadWords('fr')
    try {
      expect(handoffCardState(card('x', 'completed'), undefined).outcome).toBe(
        'Terminé',
      )
      expect(handoffCardState(card('x', 'dismissed'), undefined).outcome).toBe(
        'Passé',
      )
      expect(
        credentialConfirmReason({
          title: 'Acme',
          site: 'acme.example',
          purpose: '',
          state: 'open',
          outcomes: new Map(),
        }),
      ).toBe('Remplir ton identifiant Acme sur acme.example')
    } finally {
      await loadWords('en')
    }
  })
})

describe('the secret and the hand-off, as the Mac draws them', () => {
  // The demo's gallery (DemoData `x10`, `x11`): "secret:Stripe API key", "computer:waiting".
  const secret = line('x10', {
    type: 'secret-request',
    secretRequest: {
      label: 'Stripe API key',
      description: "So I can read last month's payouts.",
    },
  })
  const handOff = line(
    'x11',
    {
      type: 'text',
      content:
        "Sign in to the bank's site on the computer, then press I'm done.",
    },
    { boxRequestId: 'box-1' },
  )

  it('reads the secret: its name, why, kept or dismissed', () => {
    expect(kindOf(secret)).toBe('secret')
    expect(secretCard(secret)).toEqual({
      label: 'Stripe API key',
      description: "So I can read last month's payouts.",
      provided: false,
      dismissed: false,
    })
    const kept = line(
      'k',
      { type: 'secret-request', secretRequest: {} },
      {
        secretProvided: true,
      },
    )
    expect(secretCard(kept)).toEqual({
      label: 'A secret',
      description: '',
      provided: true,
      dismissed: false,
    })
    const declined = line(
      'd',
      { type: 'secret-request', secretRequest: { label: 'GitHub token' } },
      { widgetDismissed: true },
    )
    expect(secretCard(declined)?.dismissed).toBe(true)
    expect(
      cardText({ type: 'secret-request', secretRequest: { label: 'Key' } }),
    ).toBe('Key')
  })

  it('reads the hand-off: its request, its words, and waits until it has an answer', () => {
    expect(kindOf(handOff)).toBe('computer')
    const read = computerCard(handOff)!
    expect(read).toEqual({
      requestId: 'box-1',
      instruction:
        "Sign in to the bank's site on the computer, then press I'm done.",
      resolution: undefined,
    })
    expect(handoffCardState(read, undefined).waiting).toBe(true)
    const done = computerCard(
      line(
        'x11',
        { type: 'text', content: 'x' },
        {
          boxRequestId: 'box-1',
          boxResolution: 'dismissed',
        },
      ),
    )!
    expect(handoffCardState(done, undefined)).toMatchObject({
      waiting: false,
      outcome: 'Skipped',
    })
    // Any message with `boxRequestId` is the hand-off, whatever its type; one without words reads empty.
    const bare = line('b', { type: 'widget' }, { boxRequestId: 'r' })
    expect(kindOf(bare)).toBe('computer')
    expect(computerCard(bare)?.instruction).toBe('')
  })
})
