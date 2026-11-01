// The access words against the window's own functions run over every state
// and reason (SimeonCore's `AccessTests`, fixtures/access.json copied from
// the core), and the Mac's words and routes for an account without a plan
// (`UpgradeTests.testTheMacSendsANewAccountToTheWebsTrial`).

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  type AccessReason,
  type AccessState,
  type SandAccess,
  accessCover,
  accessFrom,
  accessNotice,
  accessPage,
  appleBilling,
  macCover,
  macRoute,
  pausesSending,
  planFacts,
  plansPage,
  unknownAccess,
} from './access'

interface Row {
  state: AccessState
  reason: AccessReason
  notice: { title: string; body: string; action: string | null } | null
  cover: { title: string; body: string; action: string | null }
  pauses: boolean
}

const rows = JSON.parse(
  readFileSync(new URL('./fixtures/access.json', import.meta.url), 'utf8'),
) as Row[]

describe('the account’s access', () => {
  it('says what the window says for every state and reason', () => {
    expect(rows).toHaveLength(50)
    for (const row of rows) {
      const access: SandAccess = { state: row.state, reason: row.reason }
      const notice = accessNotice(access)
      if (row.notice) {
        expect(notice?.title).toBe(row.notice.title)
        expect(notice?.body).toBe(row.notice.body)
        expect(notice?.action ?? null).toBe(row.notice.action)
      } else {
        expect(notice).toBeUndefined()
      }
      const cover = accessCover(access)
      expect(cover.title).toBe(row.cover.title)
      expect(cover.body).toBe(row.cover.body)
      expect(cover.action ?? null).toBe(row.cover.action)
      expect(pausesSending(access)).toBe(row.pauses)
    }
  })

  it('reads the server’s numbers', () => {
    expect(accessFrom({ state: 3, blockReason: 6 })).toEqual({
      state: 'paymentRequired',
      reason: 'freeTrialAvailable',
    })
    expect(accessFrom({ state: 1, blockReason: 0 })).toEqual({
      state: 'granted',
      reason: 'unspecified',
    })
    expect(accessFrom({})).toEqual(unknownAccess)
    expect(accessNotice(accessFrom({ state: 3, blockReason: 1 }))?.action).toBe(
      'Check Access',
    )
  })

  it('sends a new account to the web’s trial, and a failed card to its page', () => {
    const fresh: SandAccess = {
      state: 'paymentRequired',
      reason: 'freeTrialAvailable',
    }
    const none = planFacts({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      upgradeUrl: plansPage,
    })
    const words = macCover(fresh, none)
    expect(words.title).toBe('Start your free trial to send messages')
    expect(words.action).toBe('Start Free Trial')
    expect(macRoute(fresh, none)).toEqual({ kind: 'web', url: plansPage })
    // Before the quota is read.
    expect(macRoute(fresh)).toEqual({ kind: 'web', url: plansPage })

    const hadOne: SandAccess = { state: 'paymentRequired', reason: 'none' }
    expect(macCover(hadOne, none).title).toBe('Simeon needs a plan')
    const over = planFacts({
      subscriptionStatus: 'none',
      creditsLimit: 0,
      trialEndsAt: '2026-10-01T00:00:00+00:00',
    })
    expect(macCover(hadOne, over).title).toBe('Your free trial has ended')

    const failed = planFacts({
      subscriptionStatus: 'none',
      paymentFailed: true,
      billedBy: 'stripe',
      upgradeUrl: plansPage,
    })
    expect(macCover(hadOne, failed).action).toBe('Update card')
    expect(macRoute(hadOne, failed)).toEqual({
      kind: 'portal',
      flow: 'payment_method',
    })
    const appleFailed = planFacts({ paymentFailed: true, billedBy: 'apple' })
    expect(macRoute(hadOne, appleFailed)).toEqual({
      kind: 'web',
      url: appleBilling,
    })
    expect(macCover(hadOne, appleFailed).action).toBe('Update payment')

    // An account no plan can help keeps the window's words and Simeon Labs' page.
    const unavailable: SandAccess = {
      state: 'unavailable',
      reason: 'notOffered',
    }
    expect(macCover(unavailable)).toEqual(accessCover(unavailable))
    expect(macRoute(unavailable)).toEqual({ kind: 'web', url: accessPage })
  })
})
