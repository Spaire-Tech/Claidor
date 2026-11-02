// The asking cards' buttons, as the Mac's cards send them (SimeonCore's
// Store.swift and StoreComputer.swift): a secret saved, the computer handed
// back (I'm done, Skip), the in-chat form filled in or dismissed, and
// 1Password's fill card answered and its connect card dismissed, with what
// each says when the computer refuses.

import { describe, expect, it } from 'vitest'
import type { JSONObject } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend } from './testing'

async function attached() {
  const backend = new FakeBackend()
  backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const sent = (backend: FakeBackend, method: string) =>
  backend.commands.filter((one) => one.method === method).map((one) => one.args)

describe('the asking cards’ buttons', () => {
  it('saves a secret, and says so when the computer refuses it', async () => {
    const { backend, store } = await attached()
    await store.submitSecret('sk_test_stand_in', 's1', 'iris')
    expect(sent(backend, 'submitSecret')).toEqual([
      { entryId: 's1', value: 'sk_test_stand_in', agentId: 'iris' },
    ])
    expect(store.problem).toBeUndefined()
    backend.refusedCommands.add('submitSecret')
    await store.submitSecret('sk_test_stand_in', 's2', 'iris')
    expect(store.problem).toBe(
      "The secret wasn't saved: The computer didn't answer.",
    )
  })

  it('declines a secret with the question’s X', async () => {
    const { backend, store } = await attached()
    await store.dismissQuestion('s1', 'iris')
    expect(sent(backend, 'dismissWidget')).toEqual([
      { entryId: 's1', agentId: 'iris' },
    ])
  })

  it('hands the computer back: I’m done, Skip, and says nothing when it fails', async () => {
    const { backend, store } = await attached()
    await store.handBackComputer('iris')
    await store.handBackComputer('iris', true)
    expect(sent(backend, 'handBackForeverBox')).toEqual([
      { id: 'iris', trigger: 'button' },
      { id: 'iris', trigger: 'dismissed' },
    ])
    backend.refusedCommands.add('handBackForeverBox')
    await store.handBackComputer('iris')
    expect(store.problem).toBeUndefined()
  })

  it('sends a form’s values, and reads the computer’s answer', async () => {
    const { backend, store } = await attached()
    const values: JSONObject = { email: 'ada@example.com', password: 'pw' }
    expect(await store.submitUserForm(values, 'f1', 'iris')).toBeUndefined()
    expect(sent(backend, 'submitUserForm')).toEqual([
      { agentId: 'iris', entryId: 'f1', values },
    ])
    backend.commandAnswers.submitUserForm = () => ({ ok: true })
    expect(await store.submitUserForm(values, 'f1', 'iris')).toBeUndefined()
    backend.commandAnswers.submitUserForm = () => ({
      ok: false,
      message: 'Fill in Email first.',
      field: 'email',
    })
    expect(await store.submitUserForm(values, 'f1', 'iris')).toBe(
      'Fill in Email first.',
    )
    backend.commandAnswers.submitUserForm = () => ({ ok: false })
    expect(await store.submitUserForm(values, 'f1', 'iris')).toBe(
      "The form wasn't sent",
    )
    expect(store.problem).toBeUndefined()
    backend.refusedCommands.add('submitUserForm')
    expect(await store.submitUserForm(values, 'f1', 'iris')).toBe(
      "The form wasn't sent",
    )
    expect(store.problem).toBe(
      "The form wasn't sent: The computer didn't answer.",
    )
  })

  it('dismisses a form', async () => {
    const { backend, store } = await attached()
    await store.dismissUserForm('f1', 'iris')
    expect(sent(backend, 'dismissUserForm')).toEqual([
      { agentId: 'iris', entryId: 'f1' },
    ])
    backend.refusedCommands.add('dismissUserForm')
    await store.dismissUserForm('f1', 'iris')
    expect(store.problem).toBe(
      "Couldn't dismiss the form: The computer didn't answer.",
    )
  })

  it('answers 1Password’s fill card: Fill, Not now, and why not', async () => {
    const { backend, store } = await attached()
    expect(await store.answerCredentialRequest('c1', true, 'iris')).toBe(
      undefined,
    )
    expect(await store.answerCredentialRequest('c2', false, 'iris')).toBe(
      undefined,
    )
    expect(sent(backend, 'answerCredentialRequest')).toEqual([
      { agentId: 'iris', entryId: 'c1', allow: true },
      { agentId: 'iris', entryId: 'c2', allow: false },
    ])
    backend.commandAnswers.answerCredentialRequest = () => ({
      ok: false,
      message: 'This card was already answered.',
    })
    expect(await store.answerCredentialRequest('c1', true, 'iris')).toBe(
      'This card was already answered.',
    )
    backend.refusedCommands.add('answerCredentialRequest')
    expect(await store.answerCredentialRequest('c1', true, 'iris')).toBe(
      "1Password didn't get your answer",
    )
    expect(store.problem).toBe(
      "1Password didn't get your answer: The computer didn't answer.",
    )
  })

  it('dismisses 1Password’s connect card', async () => {
    const { backend, store } = await attached()
    await store.dismissOnePasswordConnect('p1', 'iris')
    expect(sent(backend, 'dismissOnePasswordConnect')).toEqual([
      { agentId: 'iris', entryId: 'p1' },
    ])
    backend.refusedCommands.add('dismissOnePasswordConnect')
    await store.dismissOnePasswordConnect('p1', 'iris')
    expect(store.problem).toBe(
      "Couldn't dismiss the card: The computer didn't answer.",
    )
  })

  it('sends nothing before it is attached', async () => {
    const store = new AppStore()
    expect(await store.submitUserForm({}, 'f1', 'iris')).toBe(
      "The form wasn't sent",
    )
    expect(await store.answerCredentialRequest('c1', true, 'iris')).toBe(
      "1Password didn't get your answer",
    )
    await store.handBackComputer('iris')
    await store.submitSecret('x', 's1', 'iris')
    expect(store.problem).toBeUndefined()
  })
})
