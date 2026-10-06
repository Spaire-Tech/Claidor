'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  CurrentSubscription,
  formatCredits,
  formatDollarAmount,
  hasPlan,
  PAID_TIERS,
  PaidTierKey,
  Plan,
  tierDisplayName,
  useMySubscription,
  useOpenPortal,
  usePlans,
  useStartCheckout,
  useSyncCheckout,
} from '@/hooks/queries/plans'
import { CONFIG } from '@/utils/config'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './BillingPage.module.css'

/** The latest Mac build, served by the API (`server/simeon/desktop/releases.py`). */
const DOWNLOAD_URL = 'https://api.simeonlabs.com/desktop/download/mac'

interface BillingPageProps {
  /** The signed-in person's e-mail, for the "Signed in as" line. */
  email: string | null
  /** `?plan=` from the site's buttons and the Mac sign-in. */
  plan: PaidTierKey | null
  /**
   * `?return_to=`: where the checkout sends the person once the card is
   * saved. The Mac sign-in passes its own confirm page, so a new person
   * goes card, then app.
   */
  returnTo: string | null
  /** `?upgraded=1`: the checkout just came back here. */
  upgraded: boolean
  /** `?checkout_session_id=`: the checkout that just came back, to copy in. */
  checkoutSessionId: string | null
}

/**
 * app.simeonlabs.com/billing, the one page the web app is for, in the
 * site's own clothes. Two screens, the way the upstream app does it:
 * "Adjust your plan" (the three cards; Choose plan opens Stripe
 * Checkout, or the Customer Portal once there is a plan) and "You're all
 * set" (the Download button, for a person who has a plan). The Mac app's
 * upgrade button, the window's access cover, the site's "Try it free"
 * buttons and the Mac sign-in gate all land here
 * (docs/services-billing.md, section 3).
 */
const BillingPage = ({
  email,
  plan,
  returnTo,
  upgraded,
  checkoutSessionId,
}: BillingPageProps) => {
  const subscription = useMySubscription()
  const sync = useSyncCheckout()
  const synced = useRef<string | null>(null)
  // A link that names a plan (the Mac app's upgrade button, the site's
  // buttons) is a wish to change plan: open on the cards.
  const [adjusting, setAdjusting] = useState(plan !== null)

  // The checkout came back: copy its subscription in before Stripe's
  // webhook does, so the page says so at once. Once per id.
  useEffect(() => {
    if (!checkoutSessionId || synced.current === checkoutSessionId) return
    synced.current = checkoutSessionId
    sync.mutate(checkoutSessionId)
  }, [checkoutSessionId, sync])

  const sub = subscription.data
  const subscribed = hasPlan(sub)
  const waiting =
    subscription.isLoading || (checkoutSessionId !== null && sync.isPending)

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        <a href="https://simeonlabs.com" aria-label="Simeon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.wordmark}
            src="/assets/logotype-simeon.png"
            alt="Simeon"
          />
        </a>
        {email && (
          <span className={styles.who}>
            <span className={styles.whoEmail}>Signed in as {email} · </span>
            <a href={`${CONFIG.BASE_URL}/v1/auth/logout`}>Log out</a>
          </span>
        )}
      </header>

      {waiting ? null : subscribed && !adjusting ? (
        <AllSet
          sub={sub}
          returnTo={returnTo}
          justPaid={upgraded || checkoutSessionId !== null}
          onAdjust={() => setAdjusting(true)}
        />
      ) : (
        <AdjustPlan
          sub={sub}
          subscribed={subscribed}
          highlight={plan}
          returnTo={returnTo}
          onBack={subscribed ? () => setAdjusting(false) : null}
        />
      )}
    </div>
  )
}

// --- "You're all set" -------------------------------------------------------

const AllSet = ({
  sub,
  returnTo,
  justPaid,
  onAdjust,
}: {
  sub: CurrentSubscription | undefined
  returnTo: string | null
  justPaid: boolean
  onAdjust: () => void
}) => {
  const trialing = sub?.status === 'trialing'
  return (
    <>
      <section className={styles.set}>
        <div className={styles.setBrand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.setIcon}
            src="/assets/brand/app-icon.png"
            alt=""
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.setWordmark}
            src="/assets/logotype-simeon.png"
            alt="Simeon"
          />
        </div>
        <h1 className={styles.setTitle}>You&apos;re all set!</h1>
        <p className={styles.setLede}>
          {returnTo
            ? 'Go back to Simeon to finish signing in'
            : justPaid && trialing
              ? 'Your 7 days have started. Download Simeon to get started'
              : 'Download Simeon to get started'}
        </p>
        <div className={styles.setActions}>
          {returnTo ? (
            <>
              <a className={styles.btn} href={returnTo}>
                Continue signing in to Simeon
              </a>
              <a className={styles.setLink} href={DOWNLOAD_URL}>
                Download Simeon for macOS
              </a>
            </>
          ) : (
            <a className={styles.btn} href={DOWNLOAD_URL}>
              Download Simeon for macOS
            </a>
          )}
        </div>
      </section>
      <footer className={styles.setFoot}>
        <span>
          {sub && (
            <>
              Simeon {tierDisplayName(sub.tier)}
              {trialing ? ', on trial' : ''} ·{' '}
            </>
          )}
          <button type="button" onClick={onAdjust}>
            Adjust your plan
          </button>
        </span>
      </footer>
    </>
  )
}

// --- "Choose your plan" / "Adjust your plan" -------------------------------

/** The site's pricing cards, word for word (sites/simeonlabs.com, #pricing). */
const CARD_COPY: Record<
  PaidTierKey,
  { tag: string; includes: string; lines: string[] }
> = {
  standard: {
    tag: 'For a light week of work',
    includes: 'Everything in the trial, plus:',
    lines: [
      'Routines that run while your Mac is closed',
      'Discord and Slack channels, voice calls',
      'Memory shared across your agents',
      'Keep going past the week’s allowance on demand',
    ],
  },
  pro: {
    tag: 'For agents working every day',
    includes: 'Everything in Standard, plus:',
    lines: [
      'Three times the weekly work of Standard',
      'Room for routines that run every day',
    ],
  },
  max: {
    tag: 'For a team of agents that never stops',
    includes: 'Everything in Pro, plus:',
    lines: [
      'Eleven times the weekly work of Standard',
      'Agents on routines all week long',
      'Our highest allowance',
    ],
  },
}

const AdjustPlan = ({
  sub,
  subscribed,
  returnTo,
  onBack,
}: {
  sub: CurrentSubscription | undefined
  subscribed: boolean
  highlight: PaidTierKey | null
  returnTo: string | null
  onBack: (() => void) | null
}) => {
  const plans = usePlans()
  const startCheckout = useStartCheckout()
  const openPortal = useOpenPortal()
  const [pending, setPending] = useState<PaidTierKey | 'portal' | null>(null)
  const trialing = subscribed && sub?.status === 'trialing'

  const ordered = useMemo<Plan[]>(() => {
    if (!plans.data?.items) return []
    const byTier = new Map(plans.data.items.map((p) => [p.tier, p]))
    return PAID_TIERS.map((t) => byTier.get(t)).filter((p): p is Plan =>
      Boolean(p),
    )
  }, [plans.data])

  const choose = useCallback(
    async (tier: PaidTierKey) => {
      setPending(tier)
      try {
        if (subscribed) {
          const { portal_url } = await openPortal.mutateAsync({
            flow: 'update',
          })
          window.location.assign(portal_url)
          return
        }
        const { checkout_url } = await startCheckout.mutateAsync({
          tier,
          billing_interval: 'month',
          success_url: returnTo ?? undefined,
        })
        window.location.assign(checkout_url)
      } catch {
        toast({
          title: 'Could not open the checkout',
          description: 'Please try again in a moment.',
        })
        setPending(null)
      }
    },
    [openPortal, returnTo, startCheckout, subscribed],
  )

  const portal = useCallback(
    async (flow: 'cancel' | undefined) => {
      setPending('portal')
      try {
        const { portal_url } = await openPortal.mutateAsync({ flow })
        window.location.assign(portal_url)
      } catch {
        toast({
          title: 'Could not open your billing page',
          description: 'Please try again in a moment.',
        })
        setPending(null)
      }
    },
    [openPortal],
  )

  const currentIndex = sub ? PAID_TIERS.indexOf(sub.tier as PaidTierKey) : -1

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>
        {subscribed ? 'Adjust your plan' : 'Choose your plan'}
      </h1>

      <div className={styles.plans}>
        {ordered.map((item, index) => {
          const current = subscribed && sub?.tier === item.tier
          const label = !subscribed
            ? `Get ${tierDisplayName(item.tier)}`
            : index > currentIndex
              ? `Upgrade to ${tierDisplayName(item.tier)}`
              : `Switch to ${tierDisplayName(item.tier)}`
          return (
            <PlanCard
              key={item.tier}
              plan={item}
              current={current}
              label={label}
              busy={pending !== null}
              pending={pending === item.tier}
              onChoose={() => choose(item.tier)}
            />
          )
        })}
      </div>

      {subscribed && (
        <p className={styles.foot}>
          <button
            type="button"
            className={styles.stripe}
            onClick={() => portal(undefined)}
          >
            Manage billing on Stripe
          </button>
          {' · '}
          {sub?.cancel_at_period_end ? (
            <span className={styles.muted}>
              {trialing ? 'Trial cancelled' : 'Plan ends at period end'}
            </span>
          ) : (
            <button type="button" onClick={() => portal('cancel')}>
              {trialing ? 'Cancel trial' : 'Cancel plan'}
            </button>
          )}
          {onBack && (
            <>
              {' · '}
              <button type="button" className={styles.blue} onClick={onBack}>
                Back
              </button>
            </>
          )}
        </p>
      )}
    </main>
  )
}

const PlanCard = ({
  plan,
  current,
  label,
  busy,
  pending,
  onChoose,
}: {
  plan: Plan
  current: boolean
  label: string
  busy: boolean
  pending: boolean
  onChoose: () => void
}) => {
  const copy = CARD_COPY[plan.tier]
  return (
    <div className={`${styles.plan} ${current ? styles.planCurrent : ''}`}>
      <div className={styles.planHead}>
        <h3>{tierDisplayName(plan.tier)}</h3>
        {current && <span className={styles.badge}>Current plan</span>}
      </div>
      <p className={styles.tag}>{copy.tag}</p>
      <div className={styles.price}>
        ${formatDollarAmount(plan.monthly_price_cents)}
        <small>/ month</small>
      </div>
      <p className={styles.per}>
        {formatCredits(plan.weekly_credits)} credits a week.
      </p>
      <div className={styles.trial}>
        <div className={styles.trialPrice}>
          Free<small>/ {plan.trial_days} days</small>
        </div>
        <p className={styles.per}>
          {formatCredits(plan.trial_credits)} credits once.
        </p>
      </div>
      <p className={styles.inc}>{copy.includes}</p>
      <ul>
        {copy.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {current ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.ghost}`}
          disabled
        >
          Your current plan
        </button>
      ) : (
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          onClick={onChoose}
        >
          {pending ? 'One moment…' : label}
        </button>
      )}
    </div>
  )
}

export default BillingPage
