'use client'

import LogoType from '@/components/Brand/LogoType'
import { toast } from '@/components/Toast/use-toast'
import {
  CurrentSubscription,
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

const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701'

/** The Apple mark on the site's Download button (sites/simeonlabs.com, .apl). */
const Apple = () => (
  <svg className={styles.apl} viewBox="0 0 24 24" aria-hidden="true">
    <path fill="currentColor" d={APPLE_PATH} />
  </svg>
)

/** The latest Mac build, served by the API (`server/simeon/desktop/releases.py`). */
const DOWNLOAD_URL = 'https://api.simeonlabs.com/desktop/download/mac'

/**
 * Brings the installed app to the front: the one link on its own scheme
 * it accepts without a payload (`parseSandDeepLink`,
 * desktop/source/shared/deep-link.ts). The API's sign-in page ends on it
 * the same way.
 */
const OPEN_APP_URL = 'simeon://app/v1/open'

/** This page's own path, for the addresses Stripe is given to come back to. */
const BILLING_PATH = '/billing'

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
  /**
   * `?from=app`: the app itself opened this page (the window's cover,
   * Usage & Billing, a served error). Afterwards the person goes back
   * to the app, which unlocks on its own; nothing to download.
   */
  fromApp: boolean
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
 * (docs/services-billing.md, section 3). A plan bought in the iPhone app
 * is shown as billed through Apple, with nothing to change here (section 9).
 */
const BillingPage = ({
  email,
  plan,
  returnTo,
  fromApp,
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
  // Bought in the iPhone app: Apple changes and cancels it, so this page
  // only says so (the checkout and the portal would refuse).
  const billedByApple = subscribed && sub?.provider === 'app_store'
  const waiting =
    subscription.isLoading || (checkoutSessionId !== null && sync.isPending)

  return (
    <div className={styles.page}>
      {/* The site's heading face (sites/simeonlabs.com loads it the same way). */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400&display=swap"
      />
      <header className={styles.bar}>
        {/* The company's wordmark, as on the website's bar and the sign-in. */}
        <a href="https://simeonlabs.com" aria-label="SimeonLabs">
          <LogoType labs height={34} className={styles.wordmark} />
        </a>
        {email && (
          <span className={styles.who}>
            <span className={styles.whoEmail}>Signed in as {email} · </span>
            <a href={`${CONFIG.BASE_URL}/v1/auth/logout`}>Log out</a>
          </span>
        )}
      </header>

      {waiting ? null : subscribed && (!adjusting || billedByApple) ? (
        <AllSet
          sub={sub}
          returnTo={returnTo}
          fromApp={fromApp}
          justPaid={upgraded || checkoutSessionId !== null}
          billedByApple={billedByApple}
          onAdjust={() => setAdjusting(true)}
        />
      ) : (
        <AdjustPlan
          sub={sub}
          subscribed={subscribed}
          highlight={plan}
          returnTo={returnTo}
          fromApp={fromApp}
        />
      )}
    </div>
  )
}

// --- "You're all set" -------------------------------------------------------

const AllSet = ({
  sub,
  returnTo,
  fromApp,
  justPaid,
  billedByApple,
  onAdjust,
}: {
  sub: CurrentSubscription | undefined
  returnTo: string | null
  fromApp: boolean
  justPaid: boolean
  billedByApple: boolean
  onAdjust: () => void
}) => {
  const trialing = sub?.status === 'trialing'

  // Came from the app: go back to it, do not stand here. The Mac
  // sign-in's way back finishes the sign-in (the API confirms it from
  // the checkout's own id); the app's own links just bring it forward.
  useEffect(() => {
    if (returnTo) window.location.replace(returnTo)
    else if (fromApp && justPaid) window.location.replace(OPEN_APP_URL)
  }, [returnTo, fromApp, justPaid])

  const started = justPaid && trialing ? 'Your free month has started. ' : ''
  return (
    <>
      <section className={styles.set}>
        <h1 className={styles.setTitle}>You&apos;re all set!</h1>
        <p className={styles.setLede}>
          {returnTo
            ? 'Taking you back to Simeon to finish signing in'
            : fromApp
              ? `${started}Go back to Simeon`
              : `${started}Download Simeon to get started`}
        </p>
        <div className={styles.setActions}>
          {returnTo ? (
            <a className={styles.btn} href={returnTo}>
              Continue signing in to Simeon
            </a>
          ) : fromApp ? (
            <a className={styles.btn} href={OPEN_APP_URL}>
              Open Simeon
            </a>
          ) : (
            <a className={styles.btn} href={DOWNLOAD_URL}>
              <Apple />
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
          {billedByApple ? (
            <>
              Billed through Apple. Change or cancel it on your iPhone in
              Settings › your name › Subscriptions.
            </>
          ) : (
            <button type="button" onClick={onAdjust}>
              Adjust your plan
            </button>
          )}
        </span>
      </footer>
    </>
  )
}

// --- "Choose your plan" / "Adjust your plan" -------------------------------

/**
 * The site's pricing cards (sites/simeonlabs.com, #pricing). The site's
 * Trial card is not here, every plan starts with its free month, so
 * Standard lists the trial's lines and its own together.
 */
const CARD_COPY: Record<PaidTierKey, { includes: string; lines: string[] }> = {
  standard: {
    includes: 'Includes:',
    lines: [
      'Each agent’s own computer',
      'Signs into your tools',
      'Routines on a schedule',
      'Slack, Discord and voice calls',
      'Work anywhere: Mac and iPhone',
      'Weekly usage, more on demand',
    ],
  },
  pro: {
    includes: 'Everything in Standard, plus:',
    lines: ['3.5x Standard usage', 'For agents busy every day'],
  },
  max: {
    includes: 'Everything in Pro, plus:',
    lines: ['12x Standard usage', 'Earliest access to all products'],
  },
}

const AdjustPlan = ({
  sub,
  subscribed,
  returnTo,
  fromApp,
}: {
  sub: CurrentSubscription | undefined
  subscribed: boolean
  highlight: PaidTierKey | null
  returnTo: string | null
  fromApp: boolean
}) => {
  const plans = usePlans()
  const startCheckout = useStartCheckout()
  const openPortal = useOpenPortal()
  const [pending, setPending] = useState<PaidTierKey | 'portal' | null>(null)
  const ordered = useMemo<Plan[]>(() => {
    if (!plans.data?.items) return []
    const byTier = new Map(plans.data.items.map((p) => [p.tier, p]))
    return PAID_TIERS.map((t) => byTier.get(t)).filter((p): p is Plan =>
      Boolean(p),
    )
  }, [plans.data])

  // Where Stripe sends the person afterwards: the Mac sign-in's own
  // page, this page saying so, or this page saying so and that the app
  // is waiting (`from=app` survives the round trip).
  const back = fromApp ? `${BILLING_PATH}?from=app` : undefined
  const choose = useCallback(
    async (tier: PaidTierKey) => {
      setPending(tier)
      try {
        if (subscribed) {
          // Straight to Stripe's confirmation of the plan just chosen.
          const { portal_url } = await openPortal.mutateAsync({
            flow: 'update_confirm',
            tier,
            return_url: back,
          })
          window.location.assign(portal_url)
          return
        }
        const { checkout_url } = await startCheckout.mutateAsync({
          tier,
          billing_interval: 'month',
          success_url:
            returnTo ??
            (fromApp ? `${BILLING_PATH}?upgraded=1&from=app` : undefined),
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
    [back, fromApp, openPortal, returnTo, startCheckout, subscribed],
  )

  const portal = useCallback(async () => {
    setPending('portal')
    try {
      const { portal_url } = await openPortal.mutateAsync({ return_url: back })
      window.location.assign(portal_url)
    } catch {
      toast({
        title: 'Could not open your billing page',
        description: 'Please try again in a moment.',
      })
      setPending(null)
    }
  }, [back, openPortal])

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
            ? `Start your ${tierDisplayName(item.tier)} Trial`
            : index > currentIndex
              ? `Upgrade to ${tierDisplayName(item.tier)}`
              : `Switch to ${tierDisplayName(item.tier)}`
          return (
            <PlanCard
              key={item.tier}
              plan={item}
              current={current}
              trial={!subscribed}
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
          <button type="button" onClick={() => portal()}>
            Manage billing on <span className={styles.stripe}>Stripe</span>
          </button>
        </p>
      )}
    </main>
  )
}

const PlanCard = ({
  plan,
  current,
  trial,
  label,
  busy,
  pending,
  onChoose,
}: {
  plan: Plan
  current: boolean
  /** No plan yet: choosing one starts its free month. */
  trial: boolean
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
      <div className={styles.price}>
        ${formatDollarAmount(plan.monthly_price_cents)}
        <small>/ month</small>
      </div>
      <p className={styles.billed}>
        {trial
          ? `Free for ${plan.trial_days} days, then monthly`
          : 'Billed monthly'}
      </p>
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
      <p className={styles.inc}>{copy.includes}</p>
      <ul>
        {copy.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  )
}

export default BillingPage
