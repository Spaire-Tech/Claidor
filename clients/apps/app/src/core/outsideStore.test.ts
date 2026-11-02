// The store's part of the Windows app's links and pages outside (step 7d),
// against a stand-in computer and server: LoopbackSignInStoreTests (the
// answer handed to the computer that started the sign-in), the store's
// part of AppReturnSignInTests (the sign-in named to the server first), and
// the Mac's billing page's end (StoreSettings.swift's `billingPortal` with
// `back` and `settleAfterCardPage`), 1Password's key to the computer
// (Store.swift's `connectOnePassword`).

import { describe, expect, it } from 'vitest'
import { GatewayError } from './gatewayConnection'
import type { JSONValue } from './json'
import { AppStore } from './store'
import { FakeBackend } from './testing'

async function attached(backend = new FakeBackend()) {
  const store = new AppStore()
  await store.attach(backend)
  return { store, backend }
}

const finished = (backend: FakeBackend) =>
  backend.commands
    .filter((one) => one.method === 'completeMcpOAuth')
    .map((one) => one.args)

describe('a sign-in’s answer to the computer (LoopbackSignInStoreTests)', () => {
  it('hands the code to the computer that started the sign-in', async () => {
    const { store, backend } = await attached()
    await store.finishLoopbackSignIn(
      { state: 'vendor-canva-1', code: 'abc' },
      'Canva',
    )
    expect(finished(backend)).toEqual([
      { stateId: 'vendor-canva-1', code: 'abc' },
    ])
    expect(store.problem).toBeUndefined()
    store.detach()
  })

  it('says a refusal and sends nothing', async () => {
    const { store, backend } = await attached()
    await store.finishLoopbackSignIn(
      {
        state: 's',
        error: 'access_denied',
        errorDescription: 'You declined.',
      },
      'Canva',
    )
    expect(store.problem).toBe('You declined.')
    await store.finishLoopbackSignIn(
      { state: 's', error: 'access_denied' },
      'Canva',
    )
    expect(store.problem).toBe('Canva refused the sign-in (access_denied).')
    expect(finished(backend)).toEqual([])
    store.detach()
  })

  it('says a computer that cannot finish', async () => {
    const backend = new FakeBackend()
    backend.commandAnswers.completeMcpOAuth = () => {
      throw new GatewayError(
        'No pending vendor sign-in matches this callback.',
        true,
      )
    }
    const { store } = await attached(backend)
    await store.finishLoopbackSignIn({ state: 's', code: 'abc' }, 'Canva')
    expect(store.problem).toBe(
      "Couldn't finish connecting Canva: No pending vendor sign-in matches this callback.",
    )
    store.detach()
  })

  it('does nothing without a computer, or without a code', async () => {
    const store = new AppStore()
    await store.finishLoopbackSignIn({ state: 's', code: 'abc' }, 'Canva')
    expect(store.problem).toBeUndefined()
    const { store: signedIn, backend } = await attached()
    await signedIn.finishLoopbackSignIn({ state: 's' }, 'Canva')
    expect(finished(backend)).toEqual([])
    signedIn.detach()
  })
})

describe('a sign-in named to the server first (AppReturnSignInTests)', () => {
  it('names the sign-in, once, with the app’s own scheme', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['mcp-oauth/return'] = {}
    const { store } = await attached(backend)
    const sent = await store.sendSignInBack('vendor-stripe-Ab_9', 'simeon')
    expect(sent).toBe(true)
    const returns = backend.serverCalls.filter(
      (call) => call.path === 'mcp-oauth/return',
    )
    expect(returns).toEqual([
      {
        path: 'mcp-oauth/return',
        method: 'POST',
        body: { state: 'vendor-stripe-Ab_9', back: 'simeon' },
      },
    ])
    store.detach()
  })

  it('names nothing without a computer, and says when the server refused', async () => {
    expect(await new AppStore().sendSignInBack('s', 'simeon')).toBe(false)
    const backend = new FakeBackend()
    backend.serverFails = true
    const { store } = await attached(backend)
    expect(await store.sendSignInBack('s', 'simeon')).toBe(false)
    store.detach()
  })
})

describe('Stripe’s page in the Windows app (MacBillingPage)', () => {
  it('names the app to the server, as the Mac', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['billing/portal'] = {
      portalUrl: 'https://billing.stripe.com/p/session/x',
    }
    const { store } = await attached(backend)
    const answer = await store.billingPortal(
      'payment_method',
      undefined,
      'simeon',
    )
    expect(answer.url).toBe('https://billing.stripe.com/p/session/x')
    const asked = backend.serverCalls.filter(
      (call) => call.path === 'billing/portal',
    )
    expect(asked.at(-1)?.body).toEqual({
      flow: 'payment_method',
      back: 'simeon',
    })
    // The web names nothing.
    await store.billingPortal('payment_method')
    expect(asked.length).toBe(1)
    expect(
      backend.serverCalls
        .filter((call) => call.path === 'billing/portal')
        .at(-1)?.body,
    ).toEqual({ flow: 'payment_method' })
    store.detach()
  })

  it('charges the plan only after a failed payment, then reads the access and the usage again', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['billing/settle'] = { paid: true }
    backend.serverAnswers['user/quota'] = { plan: 'pro' }
    const { store } = await attached(backend)
    const before = backend.serverCalls.length
    await store.settleAfterCardPage(false)
    const quiet = backend.serverCalls.slice(before).map((call) => call.path)
    expect(quiet).not.toContain('billing/settle')
    expect(quiet).toContain('user/quota')
    const after = backend.serverCalls.length
    await store.settleAfterCardPage(true)
    const settled = backend.serverCalls.slice(after)
    expect(settled[0]).toEqual({
      path: 'billing/settle',
      method: 'POST',
      body: {},
    })
    expect(settled.map((call) => call.path)).toContain('user/quota')
    store.detach()
  })

  it('reads the access again though the charge failed', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['user/quota'] = { plan: 'pro' }
    const { store } = await attached(backend)
    const before = backend.serverCalls.length
    // No answer for billing/settle: the server refuses it.
    await store.settleAfterCardPage(true)
    const paths = backend.serverCalls.slice(before).map((call) => call.path)
    expect(paths[0]).toBe('billing/settle')
    expect(paths).toContain('user/quota')
    store.detach()
  })

  it('knows a payment failed from the usage or the plan', async () => {
    const backend = new FakeBackend()
    backend.serverAnswers['user/quota'] = { paymentFailed: true }
    const { store } = await attached(backend)
    expect(store.paymentFailed).toBe(false)
    await store.refreshUsage()
    expect(store.paymentFailed).toBe(true)
    store.detach()
  })
})

describe('1Password’s key to the computer (connectOnePassword)', () => {
  it('sends the key with the card that asked, and keeps nothing', async () => {
    const backend = new FakeBackend()
    let reply: JSONValue = { ok: true }
    backend.commandAnswers.connectOnePassword = () => reply
    const { store } = await attached(backend)
    const made = {
      token: 'ops_fake_key_for_the_test_only',
      vaultId: 'v1',
      vaultName: 'Shared with Simeon',
      accountEmail: 'sam@example.com',
      entryId: 'e1',
      agentId: 'iris',
    }
    expect(await store.connectOnePassword(made)).toBeUndefined()
    expect(
      backend.commands.find((one) => one.method === 'connectOnePassword')?.args,
    ).toEqual(made)
    reply = { ok: false, message: 'That key can’t read the vault.' }
    expect(await store.connectOnePassword(made)).toBe(
      'That key can’t read the vault.',
    )
    backend.refusedCommands.add('connectOnePassword')
    expect(await store.connectOnePassword(made)).toBe(
      "1Password wasn't connected",
    )
    store.detach()
  })
})
