'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  BillingInterval,
  CurrentSubscription,
  formatCredits,
  formatDollarAmount,
  hasPlan,
  PAID_TIERS,
  PaidTierKey,
  Plan,
  tasksPerWeek,
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

// --- "Adjust your plan" -----------------------------------------------------

const AdjustPlan = ({
  sub,
  subscribed,
  highlight,
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
  const [intervalOverride, setIntervalOverride] =
    useState<BillingInterval | null>(null)
  const [pending, setPending] = useState<PaidTierKey | 'portal' | null>(null)

  const interval: BillingInterval =
    intervalOverride ?? sub?.billing_interval ?? 'month'
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
          billing_interval: interval,
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
    [interval, openPortal, returnTo, startCheckout, subscribed],
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

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>Adjust your plan</h1>
      {!subscribed && (
        <p className={styles.lede}>
          {returnTo
            ? 'Pick a plan to use Simeon on your Mac. The first 7 days are free.'
            : 'The first 7 days are free. Your card is charged on day 8 unless you cancel.'}
        </p>
      )}
      <div className={styles.toggleRow}>
        <div className={styles.toggle} role="group" aria-label="Billing period">
          {(['month', 'year'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={interval === option}
              onClick={() => setIntervalOverride(option)}
            >
              {option === 'month' ? 'Monthly' : 'Annual'}
            </button>
          ))}
        </div>
        <span className={styles.save}>Save 20% when billed annually</span>
      </div>

      <div className={styles.plans}>
        {ordered.map((item, index) => (
          <PlanCard
            key={item.tier}
            plan={item}
            previous={index === 0 ? null : ordered[index - 1]}
            interval={interval}
            current={subscribed && sub?.tier === item.tier}
            highlighted={!subscribed && highlight === item.tier}
            busy={pending !== null}
            pending={pending === item.tier}
            onChoose={() => choose(item.tier)}
          />
        ))}
      </div>

      <p className={styles.foot}>
        {subscribed ? (
          <>
            <button type="button" onClick={() => portal(undefined)}>
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
                <button type="button" onClick={onBack}>
                  Back
                </button>
              </>
            )}
          </>
        ) : (
          <>
            One trial per card. Questions?{' '}
            <a href="mailto:hello@simeonlabs.com">hello@simeonlabs.com</a>
          </>
        )}
      </p>
    </main>
  )
}

const PlanCard = ({
  plan,
  previous,
  interval,
  current,
  highlighted,
  busy,
  pending,
  onChoose,
}: {
  plan: Plan
  previous: Plan | null
  interval: BillingInterval
  current: boolean
  highlighted: boolean
  busy: boolean
  pending: boolean
  onChoose: () => void
}) => {
  const monthly =
    interval === 'year'
      ? Math.round(plan.annual_price_cents / 12)
      : plan.monthly_price_cents
  return (
    <div
      className={`${styles.plan} ${current ? styles.planCurrent : ''}`}
      style={highlighted ? { boxShadow: '0 0 0 1.5px #1d1d1f' } : undefined}
    >
      <div className={styles.planHead}>
        <h3>{tierDisplayName(plan.tier)}</h3>
        {current && <span className={styles.badge}>Current plan</span>}
      </div>
      <div className={styles.price}>
        ${formatDollarAmount(monthly)}
        <small>/mo.</small>
      </div>
      <p className={styles.per}>
        {interval === 'year'
          ? `$${formatDollarAmount(plan.annual_price_cents)} billed yearly.`
          : `${formatCredits(plan.weekly_credits)} credits a week.`}
      </p>
      <p className={styles.inc}>
        {previous
          ? `Everything in ${tierDisplayName(previous.tier)}, plus:`
          : 'Includes:'}
      </p>
      <ul>
        <li>
          {formatCredits(plan.weekly_credits)} credits a week, about{' '}
          {tasksPerWeek(plan.weekly_credits)} tasks
        </li>
        {previous ? (
          <li>
            {Math.round(plan.weekly_credits / previous.weekly_credits)}× the
            weekly work of {tierDisplayName(previous.tier)}
          </li>
        ) : (
          <>
            <li>Every agent and every feature</li>
            <li>A cloud computer for each agent</li>
            <li>Routines that run while your Mac is closed</li>
          </>
        )}
        {plan.tier === 'max' && <li>Our highest allowance</li>}
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
          {pending ? 'One moment…' : 'Choose plan'}
        </button>
      )}
    </div>
  )
}

export default BillingPage
