// Step 6f's store against a stand-in computer and server (StoreSettings.swift's
// `loadUsage`, `refreshUsage`, `cancelTrial`, `billingPortal`; Store.swift's
// `loadTrays` and its `tray` events; UpgradeTests'
// `testTheCardPageIsAskedForWithTheWayBack`, without the way back, which the
// web doesn't send).

import { describe, expect, it } from 'vitest'
import { SimeonAPIError } from './api'
import type { JSONValue } from './json'
import { makeAgent } from './models'
import { AppStore } from './store'
import { FakeBackend, eventually } from './testing'

/** The stand-in, whose Connect service can refuse with the server's own sentence. */
class Backend extends FakeBackend {
  dashboardRefusal?: SimeonAPIError
  dashboardCalls: string[] = []
  override async dashboard(method: string): Promise<JSONValue> {
    this.dashboardCalls.push(method)
    if (method === 'CancelSandTrial' && this.dashboardRefusal)
      throw this.dashboardRefusal
    return super.dashboard(method)
  }
}

const week = (used: number): JSONValue => ({
  subscriptionStatus: 'active',
  tier: 'standard',
  planName: 'Standard',
  creditsLimit: 100,
  creditsUsed: used,
  creditsRemaining: 100 - used,
  periodEnd: new Date(Date.now() + 3 * 86_400_000).toISOString(),
})

async function signedIn(quota: JSONValue = week(38)) {
  const backend = new Backend()
  backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
  backend.serverAnswers['user/quota'] = quota
  const store = new AppStore()
  await store.attach(backend)
  return { backend, store }
}

const quotaReads = (backend: FakeBackend) =>
  backend.serverPaths.filter((path) => path === 'user/quota').length

describe('the usage in the store', () => {
  it('is read, then not again within 30 s; one read at a time', async () => {
    const { backend, store } = await signedIn()
    // Before it is read: Usage & Billing is listed (it may yet be shown), not offered.
    expect(store.usageListed).toBe(true)
    expect(store.usageOffered).toBe(false)
    await Promise.all([store.loadUsage(), store.loadUsage()])
    expect(quotaReads(backend)).toBe(1)
    expect(store.usage.kind).toBe('ready')
    expect(store.usageReadAt).toBeDefined()
    expect(store.usageListed).toBe(true)
    expect(store.usageOffered).toBe(true)
    await store.loadUsage()
    expect(quotaReads(backend)).toBe(1)
    // 30 s on: read again.
    await store.loadUsage(Date.now() + 30_001)
    expect(quotaReads(backend)).toBe(2)
    // Retry reads whatever its age.
    await store.refreshUsage()
    expect(quotaReads(backend)).toBe(3)
  })

  it('keeps the last summary when a read fails, and says the failure', async () => {
    const { backend, store } = await signedIn()
    await store.loadUsage()
    backend.serverFails = true
    await store.refreshUsage()
    expect(store.usage.kind).toBe('failed')
    expect(
      store.usage.kind === 'failed' && store.usage.previous?.usagePercent,
    ).toBe(38)
    expect(store.usageOffered).toBe(true)
    // A failure is read again at once, not waited 30 s for.
    backend.serverFails = false
    await store.loadUsage()
    expect(store.usage.kind).toBe('ready')
  })

  it('lists Usage & Billing when nothing could be read, so its page can say so', async () => {
    const { backend, store } = await signedIn()
    backend.serverFails = true
    await store.loadUsage()
    expect(store.usage).toEqual({ kind: 'failed', previous: undefined })
    expect(store.usageListed).toBe(true)
    expect(store.usageOffered).toBe(false)
  })

  it('is forgotten on sign-out, and a late answer is dropped', async () => {
    const { backend, store } = await signedIn()
    backend.serverDelayMs = 30
    const late = store.loadUsage()
    store.detach()
    await late
    expect(store.usage).toEqual({ kind: 'empty' })
    expect(store.usageReadAt).toBeUndefined()
  })
})

describe('Cancel Trial', () => {
  const trial: JSONValue = {
    subscriptionStatus: 'trialing',
    tier: 'standard',
    creditsLimit: 100,
    creditsUsed: 10,
    creditsRemaining: 90,
    trialCancelable: true,
  }

  it('cancels, then reads the access and the usage again', async () => {
    const { backend, store } = await signedIn(trial)
    backend.dashboardAnswers.CancelSandTrial = {}
    backend.dashboardAnswers.GetSandAccessStatus = { state: 3, blockReason: 1 }
    await store.loadUsage()
    const reads = quotaReads(backend)
    backend.serverAnswers['user/quota'] = {
      subscriptionStatus: 'none',
      creditsLimit: 0,
      paymentFailed: true,
      billedBy: 'stripe',
    }
    expect(await store.cancelTrial()).toBeUndefined()
    expect(backend.dashboardCalls).toContain('CancelSandTrial')
    expect(store.access.state).toBe('paymentRequired')
    // The usage, and the plan the access notice words itself from (5c's), each read once.
    expect(quotaReads(backend)).toBe(reads + 2)
    expect(store.usage.kind === 'ready' && store.usage.summary.isTrial).toBe(
      false,
    )
    expect(store.plan?.paymentFailed).toBe(true)
  })

  it('says the server’s sentence for a refusal, or its own', async () => {
    const { backend, store } = await signedIn(trial)
    backend.dashboardRefusal = new SimeonAPIError(
      'This trial can’t be cancelled now.',
      400,
    )
    expect(await store.cancelTrial()).toBe('This trial can’t be cancelled now.')
    backend.dashboardRefusal = new SimeonAPIError('Down.', 503)
    expect(await store.cancelTrial()).toBe(
      'Couldn’t cancel the trial. Try again.',
    )
    expect(backend.dashboardCalls).not.toContain('GetSandAccessStatus')
  })

  it('asks to sign in first without an account', async () => {
    const store = new AppStore()
    expect(await store.cancelTrial()).toBe('Sign in to Simeon to continue')
  })
})

describe('Stripe’s page (billing/portal)', () => {
  it('asks for each flow, with the plan above for an upgrade, and no way back', async () => {
    const { backend, store } = await signedIn()
    backend.serverAnswers['billing/portal'] = {
      portalUrl: 'https://billing.stripe.com/p/1',
    }
    const sent = () =>
      backend.serverCalls.filter((one) => one.path === 'billing/portal').at(-1)
        ?.body
    expect(await store.billingPortal('payment_method')).toEqual({
      url: 'https://billing.stripe.com/p/1',
    })
    expect(sent()).toEqual({ flow: 'payment_method' })
    await store.billingPortal('update_confirm', 'max')
    expect(sent()).toEqual({ flow: 'update_confirm', tier: 'max' })
    await store.billingPortal('start_now')
    expect(sent()).toEqual({ flow: 'start_now' })
    await store.billingPortal('credits')
    expect(sent()).toEqual({ flow: 'credits' })
    // Manage Billing: its front page; an upgrade without a tier, or a flow it doesn't know, asks for the same.
    await store.billingPortal()
    expect(sent()).toEqual({})
    await store.billingPortal('update_confirm')
    expect(sent()).toEqual({})
    await store.billingPortal('anything')
    expect(sent()).toEqual({})
    // Not Stripe's https page: the words to show.
    backend.serverAnswers['billing/portal'] = { portalUrl: 'http://evil' }
    expect(await store.billingPortal()).toEqual({
      message: 'Couldn’t open billing. Try again.',
    })
  })
})

describe('the computer’s notices in the store', () => {
  const spent = {
    id: 't1',
    kind: 'error',
    agentId: 'iris',
    title: 'Agent failed to respond',
    detail: 'Your trial credits are used up (code 40200).',
  }

  it('reads them without waking the computer, and applies the events over the read', async () => {
    const { backend, store } = await signedIn()
    backend.commandAnswers.getTrays = () => [spent]
    expect(store.outOfCredits('iris')).toBe(false)
    // Before a read, a pushed notice has nothing to apply to (the window's way).
    backend.push({
      kind: 'tray',
      tray: { type: 'pushed', tray: { ...spent, id: 't0' } },
    })
    expect(store.trayList.trays).toEqual([])
    await store.loadTrays()
    const read = backend.commands.find((one) => one.method === 'getTrays')!
    expect(read.wakes).toBe(false)
    expect(store.outOfCredits('iris')).toBe(true)
    expect(store.outOfCredits('theo')).toBe(false)
    backend.push({ kind: 'tray', tray: { type: 'dismissed', id: 't1' } })
    await eventually(() => !store.outOfCredits('iris'))
    expect(store.outOfCredits('iris')).toBe(false)
    backend.push({ kind: 'tray', tray: { type: 'pushed', tray: spent } })
    expect(store.outOfCredits('iris')).toBe(true)
    store.detach()
    expect(store.trayList.trays).toEqual([])
  })

  it('keep what was shown when the computer doesn’t answer', async () => {
    const { backend, store } = await signedIn()
    backend.commandAnswers.getTrays = () => [spent]
    await store.loadTrays()
    backend.refusedCommands.add('getTrays')
    await store.loadTrays()
    expect(store.outOfCredits('iris')).toBe(true)
  })
})

describe('the Credentials Store’s calls', () => {
  it('go to the server as they are, and ask to sign in first without an account', async () => {
    const { backend, store } = await signedIn()
    backend.serverAnswers.credentials = { entries: [] }
    expect(await store.credentialsCall('credentials')).toEqual({ entries: [] })
    expect(backend.serverCalls.at(-1)).toEqual({
      path: 'credentials',
      method: undefined,
      body: undefined,
    })
    store.detach()
    await expect(store.credentialsCall('credentials')).rejects.toThrow(
      'Sign in to Simeon first.',
    )
  })
})

/** A server whose quota answers come when the test says, each read its own. */
class SlowQuota extends Backend {
  waiting: { quota: JSONValue; fail: boolean; done: () => void }[] = []
  override async server(
    path: string,
    method?: string,
    body?: JSONValue,
  ): Promise<JSONValue> {
    if (path !== 'user/quota') return super.server(path, method, body)
    this.serverPaths.push(path)
    const answer = { quota: null as JSONValue, fail: false, done: () => {} }
    await new Promise<void>((done) => {
      answer.done = done
      this.waiting.push(answer)
    })
    if (answer.fail) throw new SimeonAPIError('Down.', 500)
    return answer.quota
  }
  answer(index: number, quota: JSONValue | 'fail'): void {
    const one = this.waiting[index]!
    if (quota === 'fail') one.fail = true
    else one.quota = quota
    one.done()
  }
}

describe('the usage read twice at once (the review’s L1)', () => {
  const trial: JSONValue = {
    subscriptionStatus: 'trialing',
    tier: 'standard',
    creditsLimit: 100,
    creditsUsed: 10,
    creditsRemaining: 90,
    trialCancelable: true,
  }
  const cancelled: JSONValue = { subscriptionStatus: 'none', creditsLimit: 0 }

  async function twoReads() {
    const backend = new SlowQuota()
    backend.agents = [makeAgent({ id: 'iris', name: 'Iris' })]
    const store = new AppStore()
    await store.attach(backend)
    const older = store.refreshUsage()
    const newer = store.refreshUsage()
    await eventually(() => backend.waiting.length === 2)
    return { backend, store, older, newer }
  }

  it('drops an older answer that lands after a newer one: Cancel Trial’s row can’t come back', async () => {
    const { backend, store, older, newer } = await twoReads()
    backend.answer(1, cancelled)
    await newer
    backend.answer(0, trial)
    await older
    expect(store.usage.kind).toBe('ready')
    expect(store.usage.kind === 'ready' && store.usage.summary.isTrial).toBe(
      false,
    )
  })

  it('drops an older failure that lands after a newer success', async () => {
    const { backend, store, older, newer } = await twoReads()
    backend.answer(1, cancelled)
    await newer
    backend.answer(0, 'fail')
    await older
    expect(store.usage.kind).toBe('ready')
  })

  it('keeps a newer answer that lands last', async () => {
    const { backend, store, older, newer } = await twoReads()
    backend.answer(0, cancelled)
    await older
    // The older answer is not the latest read's: still reading.
    expect(store.usage.kind).toBe('loading')
    backend.answer(1, trial)
    await newer
    expect(store.usage.kind === 'ready' && store.usage.summary.isTrial).toBe(
      true,
    )
  })
})

describe('a billing tab coming back (the review’s L7 and the merge’s plan)', () => {
  it('reads the access, the plan and the usage again once, after a billing page only', async () => {
    const { backend, store } = await signedIn()
    backend.dashboardAnswers.GetSandAccessStatus = { state: 1 }
    await store.loadUsage()
    const reads = quotaReads(backend)
    // Not after a billing page: nothing.
    await store.billingTabBack()
    expect(quotaReads(backend)).toBe(reads)
    store.billingTabOpened()
    backend.serverAnswers['user/quota'] = {
      subscriptionStatus: 'none',
      creditsLimit: 0,
      paymentFailed: true,
      billedBy: 'stripe',
    }
    await store.billingTabBack()
    expect(backend.dashboardCalls).toContain('GetSandAccessStatus')
    // The usage (whatever its age) and 5c's plan.
    expect(quotaReads(backend)).toBe(reads + 2)
    expect(store.plan?.paymentFailed).toBe(true)
    expect(
      store.usage.kind === 'ready' && store.usage.summary.paymentFailed,
    ).toBe(true)
    // Once: the next time the tab comes forward reads nothing.
    await store.billingTabBack()
    expect(quotaReads(backend)).toBe(reads + 2)
  })

  it('forgets a billing page on sign-out', async () => {
    const { backend, store } = await signedIn()
    store.billingTabOpened()
    store.detach()
    const reads = quotaReads(backend)
    await store.billingTabBack()
    expect(quotaReads(backend)).toBe(reads)
  })
})
