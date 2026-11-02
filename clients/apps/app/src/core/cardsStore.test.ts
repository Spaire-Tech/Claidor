// The waiting cards' buttons, as the Mac's cards send them (SimeonCore's
// Store.swift card commands): a question's answer shown at once and taken
// back when it doesn't reach the agent, dismissed, a draft sent or
// discarded, and an approval answered: Allow once, Always allow writing the
// proposed rule into Auto-review, Deny, and a stale request read as Expired.

import { describe, expect, it } from 'vitest'
import { Entry } from './entry'
import type { JSONObject, JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

function computer() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
  const settings: JSONObject = {}
  backend.commandAnswers.getHostSettings = () => ({ ...settings })
  backend.commandAnswers.setHostSettings = (args) => {
    Object.assign(settings, args as JSONObject)
    return {}
  }
  return { backend, settings }
}

const sent = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('the waiting cards’ buttons', () => {
  it('shows an answer at once, and takes it back when it doesn’t reach the agent', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    const answering = store.answer('Inbox', 'q1', 'iris')
    expect(store.pendingAnswers.q1).toBe('Inbox')
    await answering
    expect(sent(backend, 'respondToWidget')).toEqual([
      { agentId: 'iris', entryId: 'q1', value: 'Inbox' },
    ])
    backend.refusedCommands.add('respondToWidget')
    await store.answer('Calendar', 'q2', 'iris')
    expect(store.pendingAnswers.q2).toBeUndefined()
    expect(store.problem).toBe(
      "Your answer didn't reach Iris: The computer didn't answer.",
    )
  })

  it('keeps the answer until the computer’s copy has it', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.answer('Inbox', 'q1', 'iris')
    await store.dismissQuestion('q2', 'iris')
    expect(store.pendingAnswers).toEqual({ q1: 'Inbox', q2: '' })
    expect(sent(backend, 'dismissWidget')).toEqual([
      { entryId: 'q2', agentId: 'iris' },
    ])
    const question = (id: string, more: JSONObject): Entry =>
      Entry.from({
        kind: 'send-message',
        id,
        message: { type: 'widget', widget: { prompt: 'What first?' } },
        ...more,
      })!
    // The store's own copy of the chat, as the computer sends it.
    ;(
      store as unknown as {
        setTranscript: (agentId: string, entries: Entry[]) => void
      }
    ).setTranscript('iris', [
      question('q1', { respondedValue: 'Inbox' }),
      question('q2', {}),
    ])
    expect(store.pendingAnswers).toEqual({ q2: '' })
  })

  it('takes a dismissal back when the computer refuses it', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    backend.refusedCommands.add('dismissWidget')
    await store.dismissQuestion('q1', 'iris')
    expect(store.pendingAnswers.q1).toBeUndefined()
    expect(store.problem).toBe(
      "Couldn't dismiss the question: The computer didn't answer.",
    )
  })

  it('sends a draft with what was changed, and discards one', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    const draft: JSONValue = {
      body: 'Hello',
      from: 'bass@simeonlabs.com',
      to: ['sam@example.com'],
      cc: [],
      subject: 'Friday',
    }
    await store.sendDraft('d1', 'iris', draft)
    await store.discardDraft('d2', 'iris')
    expect(sent(backend, 'sendDraft')).toEqual([
      { agentId: 'iris', entryId: 'd1', draft },
    ])
    expect(sent(backend, 'discardDraft')).toEqual([
      { agentId: 'iris', entryId: 'd2' },
    ])
  })

  it('answers an approval: Allow once, Deny, Always allow with its rule', async () => {
    const { backend, settings } = computer()
    settings.autoReviewInstructions = {
      isEnabled: true,
      allowInstructions: ['Allow reading files'],
      blockInstructions: [],
    }
    const store = new AppStore()
    await store.attach(backend)
    await store.resolveApproval('r1', 'approved', undefined, 'a1', 'iris')
    await store.resolveApproval('r2', 'denied', undefined, 'a2', 'iris')
    await store.resolveApproval(
      'r3',
      'always',
      'Allow running npm test',
      'a3',
      'iris',
    )
    expect(store.answeredApprovals).toEqual({
      a1: 'approved',
      a2: 'denied',
      a3: 'always',
    })
    expect(
      sent(backend, 'resolveAutoReviewApproval').map(
        (args) => (args as JSONObject).resolution,
      ),
    ).toEqual(['approved', 'denied', 'always'])
    expect(settings.autoReviewInstructions).toEqual({
      isEnabled: true,
      allowInstructions: ['Allow reading files', 'Allow running npm test'],
      blockInstructions: [],
    })
  })

  it('counts Always allow as Allow once when there is no rule or it can’t be saved', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    await store.resolveApproval('r1', 'always', undefined, 'a1', 'iris')
    backend.refusedCommands.add('setHostSettings')
    await store.resolveApproval('r2', 'always', 'Allow npm test', 'a2', 'iris')
    expect(store.answeredApprovals).toEqual({ a1: 'approved', a2: 'approved' })
  })

  it('reads a stale request as Expired, and says nothing on any other refusal', async () => {
    const { backend } = computer()
    const store = new AppStore()
    await store.attach(backend)
    backend.commandAnswers.resolveAutoReviewApproval = () => {
      throw new Error('auto-review/stale: the request is gone')
    }
    await store.resolveApproval('r1', 'approved', undefined, 'a1', 'iris')
    backend.commandAnswers.resolveAutoReviewApproval = () => {
      throw new Error('The computer is busy.')
    }
    await store.resolveApproval('r2', 'denied', undefined, 'a2', 'iris')
    expect(store.answeredApprovals).toEqual({ a1: 'expired' })
    expect(store.problem).toBeUndefined()
  })
})
