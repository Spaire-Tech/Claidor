// Whether this account may use Simeon (SimeonCore's Access.swift,
// `GetSandAccessStatus`), and what the window says for each answer: the
// cover over the whole window when the computer refuses the account before
// it was ever reached, with the Mac's words for an account without a plan
// (`MacUpgrade`, Upgrade.swift) and where its button goes. Checked against
// the core's own table of every state and reason (fixtures/access.json).

import { type JSONValue, bool, field, num, str, text } from './json'
import { t } from './l10n'

export type AccessState =
  | 'checking'
  | 'unknown'
  | 'granted'
  | 'unavailable'
  | 'paymentRequired'

export type AccessReason =
  | 'unspecified'
  | 'none'
  | 'teamPrivacyMode'
  | 'teamSetupRequired'
  | 'teamAccessRequired'
  | 'notOffered'
  | 'freeTrialAvailable'
  | 'paywallIndividual'
  | 'paywallTeamMember'
  | 'paywallTeamAdmin'

export interface SandAccess {
  state: AccessState
  reason: AccessReason
}

export interface AccessWords {
  title: string
  body: string
  /** The button's word; none for an account nothing can be done for. */
  action?: string
}

export const checkingAccess: SandAccess = {
  state: 'checking',
  reason: 'unspecified',
}
export const unknownAccess: SandAccess = {
  state: 'unknown',
  reason: 'unspecified',
}

/** Where the cover's button goes for an account no plan can help: Simeon Labs' page. */
export const accessPage = 'https://simeonlabs.com'
/** The web's plans page, from the app: it sends the person back to the app afterwards. */
export const plansPage = 'https://app.simeonlabs.com/billing?from=app'
export const appleBilling = 'https://apps.apple.com/account/billing'
/** Stripe's page for the card, when a payment failed. */
export const paymentMethodFlow = 'payment_method'

export function tagline(): string {
  return t('Your team of always-on agents that finish the work.')
}

const reasons: Record<number, AccessReason> = {
  1: 'none',
  2: 'teamPrivacyMode',
  3: 'teamSetupRequired',
  4: 'teamAccessRequired',
  5: 'notOffered',
  6: 'freeTrialAvailable',
  7: 'paywallIndividual',
  8: 'paywallTeamMember',
  9: 'paywallTeamAdmin',
}

/** The server's numbers (`sandAccessStateFromWire`, `sandAccessBlockReasonFromWire`). */
export function accessFrom(json: JSONValue): SandAccess {
  const states: Record<number, AccessState> = {
    1: 'granted',
    2: 'unavailable',
    3: 'paymentRequired',
  }
  const state = states[num(field(json, 'state')) ?? 0] ?? 'unknown'
  return {
    state,
    reason: reasons[num(field(json, 'blockReason')) ?? 0] ?? 'unspecified',
  }
}

function byReason(reason: AccessReason): AccessWords | undefined {
  switch (reason) {
    case 'teamPrivacyMode':
    case 'teamAccessRequired':
      return {
        title: t('Simeon isn’t available on this account'),
        body: t('Ask your team’s admin to turn it on.'),
        action: t('Check Access'),
      }
    case 'teamSetupRequired':
      return {
        title: t('Simeon isn’t set up for your team yet'),
        body: t('Ask your team’s admin to finish setting it up.'),
        action: t('Check Access'),
      }
    case 'notOffered':
      return {
        title: t('Simeon isn’t available on this account'),
        body: t("There's nothing to set up or purchase here."),
      }
    case 'freeTrialAvailable':
      return {
        title: t('Start your free trial to send messages'),
        body: t('This account can try Simeon now.'),
        action: t('Start Trial'),
      }
    case 'paywallIndividual':
      return {
        title: t('Simeon needs a plan'),
        body: t('Choose a plan to send messages.'),
        action: t('See plans'),
      }
    case 'paywallTeamMember':
      return {
        title: t('Simeon needs a plan'),
        body: t('Ask your team’s admin to add this account.'),
        action: t('Check Access'),
      }
    case 'paywallTeamAdmin':
      return {
        title: t('Simeon needs a plan'),
        body: t('Choose a plan for this account to send messages.'),
        action: t('See plans'),
      }
    default:
      return undefined
  }
}

/** The composer's notice (`T1t`): only while sending is off. */
export function accessNotice(access: SandAccess): AccessWords | undefined {
  switch (access.state) {
    case 'unavailable':
      return (
        byReason(access.reason) ?? {
          title: t('Simeon is not available for this account'),
          body: t(
            'Sending is off until this account is given access. Check what it needs on the web.',
          ),
          action: t('Check Access'),
        }
      )
    case 'paymentRequired':
      return (
        byReason(access.reason) ?? {
          title: t('Simeon is not included in this plan'),
          body: t(
            'Sending is off until this account has Simeon. Check the options on the web.',
          ),
          action: t('Check Access'),
        }
      )
    default:
      return undefined
  }
}

/** The cover's words (`dzn`): the notice's, else that this account isn't set up for Simeon yet. */
export function accessCover(access: SandAccess): AccessWords {
  return (
    accessNotice(access) ?? {
      title: t('Simeon isn’t available on this account yet'),
      body: t('Check what this account needs on the web.'),
      action: t('Check Access'),
    }
  )
}

/** Send waits while this account has no Simeon (`gft`). */
export function pausesSending(access: SandAccess): boolean {
  return access.state === 'unavailable' || access.state === 'paymentRequired'
}

// MARK: The plan, as far as the cover needs it (`UsageSummary`)

export interface PlanFacts {
  /** No plan because the first charge after the trial failed. */
  paymentFailed: boolean
  /** Apple bills it, so the person updates it with Apple. */
  billedByApple: boolean
  hasEndedTrial: boolean
  /** The quota's own plans page (`upgradeUrl`), http or https only. */
  upgradeURL?: string
}

function milliseconds(value: JSONValue | undefined): number | undefined {
  const words = text(value)
  if (!words) return undefined
  const at = Date.parse(words)
  return Number.isFinite(at) && at > 0 ? at : undefined
}

/** The account's quota (`GET user/quota`), as far as the cover reads it. */
export function planFacts(quota: JSONValue, now = Date.now()): PlanFacts {
  const status = str(field(quota, 'subscriptionStatus'))
  const trialEnd = milliseconds(field(quota, 'trialEndsAt'))
  let upgradeURL: string | undefined
  const link = text(field(quota, 'upgradeUrl'))
  if (link) {
    try {
      const url = new URL(link)
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.host)
        upgradeURL = link
    } catch {
      // Not an address: none.
    }
  }
  return {
    paymentFailed: bool(field(quota, 'paymentFailed')) === true,
    billedByApple: str(field(quota, 'billedBy')) === 'apple',
    hasEndedTrial: status !== 'trialing' && trialEnd != null && trialEnd <= now,
    upgradeURL,
  }
}

/** The cover's words for the Mac and the web (`MacUpgrade.cover`): with no plan, the web's trial and plans, or the card that failed. */
export function macCover(access: SandAccess, plan?: PlanFacts): AccessWords {
  if (access.state !== 'paymentRequired') return accessCover(access)
  if (plan?.paymentFailed)
    return plan.billedByApple
      ? {
          title: t('Your payment didn’t go through'),
          body: t(
            'You can’t send messages until your Apple payment method is updated.',
          ),
          action: t('Update payment'),
        }
      : {
          title: t('Your payment didn’t go through'),
          body: t('You can’t send messages until your card is updated.'),
          action: t('Update card'),
        }
  if (access.reason === 'freeTrialAvailable')
    return {
      title: t('Start your free trial to send messages'),
      body: t(
        '7 days free, then your plan. Add a card on the web; cancel anytime.',
      ),
      action: t('Start Free Trial'),
    }
  if (plan?.hasEndedTrial)
    return {
      title: t('Your free trial has ended'),
      body: t('Choose a plan to send messages again.'),
      action: t('See plans'),
    }
  return {
    title: t('Simeon needs a plan'),
    body: t('Choose a plan on the web to send messages.'),
    action: t('See plans'),
  }
}

/** Where the cover's button goes (`MacUpgrade.route`): Stripe's card page for a card that failed, Apple's for a charge Apple bills, else the plans page; Simeon Labs' page for an account no plan can help. */
export type CoverRoute =
  | { kind: 'web'; url: string }
  | { kind: 'portal'; flow: string }

export function macRoute(access: SandAccess, plan?: PlanFacts): CoverRoute {
  if (access.state !== 'paymentRequired')
    return { kind: 'web', url: accessPage }
  if (plan?.paymentFailed)
    return plan.billedByApple
      ? { kind: 'web', url: appleBilling }
      : { kind: 'portal', flow: paymentMethodFlow }
  return { kind: 'web', url: plan?.upgradeURL ?? plansPage }
}
