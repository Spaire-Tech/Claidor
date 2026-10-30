'use client'

import LogoType from '@/components/Brand/LogoType'
import { toast } from '@/components/Toast/use-toast'
import {
  CurrentSubscription,
  formatCredits,
  formatDollarAmount,
  hasPlan,
  PAID_TIERS,
  PaidTierKey,
  Plan,
  PlanChange,
  tierDisplayName,
  useBuyCredits,
  useChangePlan,
  useCredits,
  useMySubscription,
  useOpenPortal,
  usePlans,
  usePreviewChange,
  useStartCheckout,
  useSyncCheckout,
  useSyncCredits,
} from '@/hooks/queries/plans'
import { CONFIG } from '@/utils/config'
import {
  getTranslationLocale,
  useTranslations,
  type AcceptedLocale,
  type TranslateFn,
} from '@simeon/i18n'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { withParts } from '../../Auth/AuthShell'
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
  /** `?credits=1`: a checkout for extra credits just came back here. */
  credits: boolean
  /** `?checkout_session_id=`: the checkout that just came back, to copy in. */
  checkoutSessionId: string | null
  /** The page's language (`pageLocale`, 20 October 2026). */
  locale: AcceptedLocale
}

/** A month's price: "$30" in English as always; "30 $" in another language, in its own format. */
const monthlyPrice = (cents: number, locale: AcceptedLocale): string =>
  getTranslationLocale(locale) === 'en'
    ? `$${formatDollarAmount(cents)}`
    : new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(cents / 100)

/** "November 3": the day a change starts, in the page's language. */
const dayOf = (iso: string, locale: AcceptedLocale): string =>
  new Date(iso).toLocaleDateString(locale, { month: 'long', day: 'numeric' })

/**
 * app.simeonlabs.com/billing, the one page the web app is for, in the
 * site's own clothes. Three screens: "Adjust your plan" (the three cards;
 * Choose plan opens Stripe Checkout, or, once there is a plan, the
 * confirm screen), the confirm screen (what a change does and costs, as
 * the server previews it: an upgrade starts today less the old plan's
 * unused time, a downgrade at the renewal, 27 October 2026), and "You're
 * all set" (the Download button, for a person who has a plan, with "Start
 * my plan now" in a trial, a waiting downgrade and extra credits). The Mac app's
 * upgrade button, the window's access cover, the site's "Try it free"
 * buttons and the Mac sign-in gate all land here
 * (docs/services-billing.md, section 3). A plan bought in the iPhone app
 * is shown as billed through Apple, with nothing to change here (section 9).
 */
/** This browser is on a Mac (an iPad asking for the desktop site says Macintosh too, with touch). */
const onAMac = () =>
  /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints < 2
const unchanging = () => () => {}

const BillingPage = ({
  email,
  plan,
  returnTo,
  fromApp,
  upgraded,
  credits,
  checkoutSessionId,
  locale,
}: BillingPageProps) => {
  const t = useTranslations(locale)
  const subscription = useMySubscription()
  const sync = useSyncCheckout()
  const syncCredits = useSyncCredits()
  const synced = useRef<string | null>(null)
  // A link that names a plan (the Mac app's upgrade button, the site's
  // buttons) is a wish to change plan: open on the cards.
  const [adjusting, setAdjusting] = useState(plan !== null)
  // A change the person is looking at before making it.
  const [confirming, setConfirming] = useState<PlanChange | null>(null)

  // The checkout came back: copy its subscription in (or grant the extra
  // credits it bought) before Stripe's webhook does, so the page says so
  // at once. Once per id.
  useEffect(() => {
    if (!checkoutSessionId || synced.current === checkoutSessionId) return
    synced.current = checkoutSessionId
    if (credits) syncCredits.mutate(checkoutSessionId)
    else sync.mutate(checkoutSessionId)
  }, [checkoutSessionId, credits, sync, syncCredits])

  const sub = subscription.data
  const subscribed = hasPlan(sub)
  // Someone who uses the Mac app, on a Mac, goes back to it, as if the app
  // had opened this page, whatever link did (the founder, 29 October 2026:
  // "it said you're all set, download the app … the app is clearly
  // downloaded here"). The server's render knows no browser: not yet.
  const mac = useSyncExternalStore(unchanging, onAMac, () => false)
  const toApp = fromApp || (mac && sub?.has_mac_app === true)
  // Bought in the iPhone app: Apple changes and cancels it, so this page
  // only says so (the checkout and the portal would refuse).
  const billedByApple = subscribed && sub?.provider === 'app_store'
  const waiting =
    subscription.isLoading ||
    (checkoutSessionId !== null && (sync.isPending || syncCredits.isPending))

  return (
    <div className={styles.page}>
      <header className={styles.bar}>
        {/* The company's wordmark, as on the website's bar and the sign-in. */}
        <a href="https://simeonlabs.com" aria-label="SimeonLabs">
          <LogoType labs height={34} className={styles.wordmark} />
        </a>
        {email && (
          <span className={styles.who}>
            <span className={styles.whoEmail}>
              {t('simeon.billing.signedInAs', { email })}
            </span>
            <a href={`${CONFIG.BASE_URL}/v1/auth/logout`}>
              {t('simeon.billing.logOut')}
            </a>
          </span>
        )}
      </header>

      {waiting ? null : confirming ? (
        <ConfirmChange
          change={confirming}
          fromApp={toApp}
          onClose={(changed) => {
            setConfirming(null)
            if (changed) setAdjusting(false)
          }}
          t={t}
          locale={locale}
        />
      ) : subscribed && (!adjusting || billedByApple) ? (
        <AllSet
          sub={sub}
          returnTo={returnTo}
          fromApp={toApp}
          justPaid={upgraded || (checkoutSessionId !== null && !credits)}
          billedByApple={billedByApple}
          onAdjust={() => setAdjusting(true)}
          onPreview={setConfirming}
          t={t}
          locale={locale}
        />
      ) : (
        <AdjustPlan
          sub={sub}
          subscribed={subscribed}
          highlight={plan}
          returnTo={returnTo}
          fromApp={toApp}
          onPreview={setConfirming}
          t={t}
          locale={locale}
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
  onPreview,
  t,
  locale,
}: {
  sub: CurrentSubscription | undefined
  returnTo: string | null
  fromApp: boolean
  justPaid: boolean
  billedByApple: boolean
  onAdjust: () => void
  onPreview: (change: PlanChange) => void
  t: TranslateFn
  locale: AcceptedLocale
}) => {
  const trialing = sub?.status === 'trialing'
  const preview = usePreviewChange()
  const buyCredits = useBuyCredits()
  const credits = useCredits(Boolean(sub) && hasPlan(sub))
  const [busy, setBusy] = useState(false)

  const ask = useCallback(
    async (input: { tier: PaidTierKey } | { startNow: true }) => {
      setBusy(true)
      try {
        onPreview(await preview.mutateAsync(input))
      } catch (error) {
        toast({
          title: t('simeon.billing.changeFailed'),
          description: errorText(error) ?? t('simeon.billing.tryAgain'),
        })
      } finally {
        setBusy(false)
      }
    },
    [onPreview, preview, t],
  )

  const addCredits = useCallback(async () => {
    setBusy(true)
    try {
      const { checkout_url } = await buyCredits.mutateAsync({
        packs: 1,
        success_url: `${BILLING_PATH}?credits=1${fromApp ? '&from=app' : ''}`,
        cancel_url: `${BILLING_PATH}${fromApp ? '?from=app' : ''}`,
      })
      window.location.assign(checkout_url)
    } catch (error) {
      toast({
        title: t('simeon.billing.checkoutFailed'),
        description: errorText(error) ?? t('simeon.billing.tryAgain'),
      })
      setBusy(false)
    }
  }, [buyCredits, fromApp, t])

  // Came from the app: go back to it, do not stand here. The Mac
  // sign-in's way back finishes the sign-in (the API confirms it from
  // the checkout's own id); the app's own links just bring it forward.
  useEffect(() => {
    if (returnTo) window.location.replace(returnTo)
    else if (fromApp && justPaid) window.location.replace(OPEN_APP_URL)
  }, [returnTo, fromApp, justPaid])

  const started = justPaid && trialing
  return (
    <>
      <section className={styles.set}>
        <h1 className={styles.setTitle}>{t('simeon.billing.allSet')}</h1>
        <p className={styles.setLede}>
          {returnTo
            ? t('simeon.billing.takingYouBack')
            : fromApp
              ? started
                ? t('simeon.billing.goBackStarted')
                : t('simeon.billing.goBack')
              : started
                ? t('simeon.billing.downloadStarted')
                : t('simeon.billing.download')}
        </p>
        <div className={styles.setActions}>
          {returnTo ? (
            <a className={styles.btn} href={returnTo}>
              {t('simeon.billing.continueSigningIn')}
            </a>
          ) : fromApp ? (
            <a className={styles.btn} href={OPEN_APP_URL}>
              {t('simeon.billing.openSimeon')}
            </a>
          ) : (
            <a className={styles.btn} href={DOWNLOAD_URL}>
              <Apple />
              {t('simeon.billing.downloadMac')}
            </a>
          )}
        </div>
      </section>
      <footer className={styles.setFoot}>
        <span>
          {sub &&
            (trialing
              ? t('simeon.billing.planLineTrial', {
                  plan: tierDisplayName(sub.tier),
                })
              : t('simeon.billing.planLine', {
                  plan: tierDisplayName(sub.tier),
                }))}
          {billedByApple ? (
            t('simeon.billing.billedByApple')
          ) : (
            <button type="button" onClick={onAdjust}>
              {t('simeon.billing.adjustPlan')}
            </button>
          )}
          {trialing && !billedByApple && !sub?.cancel_at_period_end && (
            <>
              {' · '}
              <button
                type="button"
                disabled={busy}
                onClick={() => ask({ startNow: true })}
              >
                {t('simeon.billing.startNow')}
              </button>
            </>
          )}
        </span>
        {sub?.scheduled_tier && sub.scheduled_at && !billedByApple && (
          <span>
            {t('simeon.billing.switchesOn', {
              plan: tierDisplayName(sub.scheduled_tier),
              date: dayOf(sub.scheduled_at, locale),
            })}
            <button
              type="button"
              disabled={busy}
              onClick={() => ask({ tier: sub.tier as PaidTierKey })}
            >
              {t('simeon.billing.keepPlan', {
                plan: tierDisplayName(sub.tier),
              })}
            </button>
          </span>
        )}
        {credits.data && (credits.data.can_buy || credits.data.balance > 0) && (
          <span>
            {t('simeon.billing.extraCredits', {
              credits: formatCredits(credits.data.balance),
            })}
            {credits.data.can_buy && (
              <button type="button" disabled={busy} onClick={addCredits}>
                {t('simeon.billing.addCredits')}
              </button>
            )}
            <br />
            <span className={styles.muted}>
              {t('simeon.billing.creditsNote', {
                price: monthlyPrice(credits.data.pack_price_cents, locale),
                credits: formatCredits(credits.data.pack_credits),
              })}
            </span>
          </span>
        )}
      </footer>
    </>
  )
}

// --- "Choose your plan" / "Adjust your plan" -------------------------------

/**
 * The site's pricing cards (sites/simeonlabs.com, #pricing). The site's
 * Trial card is not here, every plan starts with its free trial, so
 * Standard lists the trial's lines and its own together.
 */
const CARD_COPY: Record<PaidTierKey, { includes: CardKey; lines: CardKey[] }> =
  {
    standard: {
      includes: 'simeon.billing.standardIncludes',
      lines: [
        'simeon.billing.standardComputer',
        'simeon.billing.standardTools',
        'simeon.billing.standardRoutines',
        'simeon.billing.standardChannels',
        'simeon.billing.standardAnywhere',
        'simeon.billing.standardUsage',
      ],
    },
    pro: {
      includes: 'simeon.billing.proIncludes',
      lines: ['simeon.billing.proUsage', 'simeon.billing.proBusy'],
    },
    max: {
      includes: 'simeon.billing.maxIncludes',
      lines: ['simeon.billing.maxUsage', 'simeon.billing.maxAccess'],
    },
  }

type CardKey =
  | 'simeon.billing.standardIncludes'
  | 'simeon.billing.standardComputer'
  | 'simeon.billing.standardTools'
  | 'simeon.billing.standardRoutines'
  | 'simeon.billing.standardChannels'
  | 'simeon.billing.standardAnywhere'
  | 'simeon.billing.standardUsage'
  | 'simeon.billing.proIncludes'
  | 'simeon.billing.proUsage'
  | 'simeon.billing.proBusy'
  | 'simeon.billing.maxIncludes'
  | 'simeon.billing.maxUsage'
  | 'simeon.billing.maxAccess'

const AdjustPlan = ({
  sub,
  subscribed,
  returnTo,
  fromApp,
  onPreview,
  t,
  locale,
}: {
  sub: CurrentSubscription | undefined
  subscribed: boolean
  highlight: PaidTierKey | null
  returnTo: string | null
  fromApp: boolean
  onPreview: (change: PlanChange) => void
  t: TranslateFn
  locale: AcceptedLocale
}) => {
  const plans = usePlans()
  const startCheckout = useStartCheckout()
  const openPortal = useOpenPortal()
  const preview = usePreviewChange()
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
          // What the change does and costs, then the person confirms it.
          onPreview(await preview.mutateAsync({ tier }))
          setPending(null)
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
      } catch (error) {
        toast({
          title: subscribed
            ? t('simeon.billing.changeFailed')
            : t('simeon.billing.checkoutFailed'),
          description: errorText(error) ?? t('simeon.billing.tryAgain'),
        })
        setPending(null)
      }
    },
    [fromApp, onPreview, preview, returnTo, startCheckout, subscribed, t],
  )

  const portal = useCallback(async () => {
    setPending('portal')
    try {
      const { portal_url } = await openPortal.mutateAsync({ return_url: back })
      window.location.assign(portal_url)
    } catch {
      toast({
        title: t('simeon.billing.portalFailed'),
        description: t('simeon.billing.tryAgain'),
      })
      setPending(null)
    }
  }, [back, openPortal, t])

  const currentIndex = sub ? PAID_TIERS.indexOf(sub.tier as PaidTierKey) : -1

  return (
    <main className={styles.main}>
      <h1 className={styles.title}>
        {subscribed
          ? t('simeon.billing.adjustPlan')
          : t('simeon.billing.choosePlan')}
      </h1>

      <div className={styles.plans}>
        {ordered.map((item, index) => {
          const current = subscribed && sub?.tier === item.tier
          const plan = tierDisplayName(item.tier)
          const label = !subscribed
            ? t('simeon.billing.startTrial', { plan })
            : index > currentIndex
              ? t('simeon.billing.upgradeTo', { plan })
              : t('simeon.billing.switchTo', { plan })
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
              t={t}
              locale={locale}
            />
          )
        })}
      </div>

      {subscribed && (
        <p className={styles.foot}>
          <button type="button" onClick={() => portal()}>
            {withParts(
              t('simeon.billing.manageOnStripe', { stripe: '{stripe}' }),
              { stripe: <span className={styles.stripe}>Stripe</span> },
            )}
          </button>
        </p>
      )}
    </main>
  )
}

// --- The confirm screen -------------------------------------------------------

/** The server's sentence for a refusal (`detail`), when it gave one. */
const errorText = (error: unknown): string | null => {
  const detail = (error as { detail?: unknown } | null)?.detail
  return typeof detail === 'string' ? detail : null
}

const ConfirmChange = ({
  change,
  fromApp,
  onClose,
  t,
  locale,
}: {
  change: PlanChange
  fromApp: boolean
  /** `changed`: the change was made, and the page goes back to "All set". */
  onClose: (changed: boolean) => void
  t: TranslateFn
  locale: AcceptedLocale
}) => {
  const changePlan = useChangePlan()
  const plan = tierDisplayName(change.tier)
  const current = tierDisplayName(change.current)
  const amount = monthlyPrice(change.amount_due, locale)
  const price = t(
    change.billing_interval === 'year'
      ? 'simeon.billing.priceYear'
      : 'simeon.billing.priceMonth',
    { amount: monthlyPrice(change.price, locale) },
  )
  const date = dayOf(change.starts_at, locale)
  const [title, sentence] =
    change.kind === 'upgrade'
      ? [
          t('simeon.billing.upgradeTo', { plan }),
          t('simeon.billing.upgradeBody', { plan, amount, current, price }),
        ]
      : change.kind === 'downgrade'
        ? [
            t('simeon.billing.switchTo', { plan }),
            t('simeon.billing.downgradeBody', { plan, current, date, price }),
          ]
        : change.kind === 'trial'
          ? [
              t('simeon.billing.switchTo', { plan }),
              t('simeon.billing.trialBody', { plan, date, price }),
            ]
          : change.kind === 'keep'
            ? [
                t('simeon.billing.keepTitle', { plan: current }),
                t('simeon.billing.keepBody', {
                  plan: current,
                  next: change.scheduled_tier
                    ? tierDisplayName(change.scheduled_tier)
                    : '',
                }),
              ]
            : [
                t('simeon.billing.startNowTitle', { plan }),
                t('simeon.billing.startNowBody', { plan, amount }),
              ]

  const confirm = async () => {
    try {
      await changePlan.mutateAsync(change)
      if (fromApp) window.location.replace(OPEN_APP_URL)
      onClose(true)
    } catch (error) {
      toast({
        title: t('simeon.billing.changeFailed'),
        description: errorText(error) ?? t('simeon.billing.tryAgain'),
      })
    }
  }

  return (
    <section className={styles.set}>
      <h1 className={styles.setTitle}>{title}</h1>
      <p className={`${styles.setLede} ${styles.confirmLede}`}>{sentence}</p>
      <div className={styles.setActions}>
        <button
          type="button"
          className={styles.btn}
          disabled={changePlan.isPending}
          onClick={confirm}
        >
          {changePlan.isPending
            ? t('simeon.billing.oneMoment')
            : t('simeon.billing.confirm')}
        </button>
        <button
          type="button"
          className={`${styles.btn} ${styles.ghost}`}
          disabled={changePlan.isPending}
          onClick={() => onClose(false)}
        >
          {t('simeon.billing.notNow')}
        </button>
      </div>
    </section>
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
  t,
  locale,
}: {
  plan: Plan
  current: boolean
  /** No plan yet: choosing one starts its free trial. */
  trial: boolean
  label: string
  busy: boolean
  pending: boolean
  onChoose: () => void
  t: TranslateFn
  locale: AcceptedLocale
}) => {
  const copy = CARD_COPY[plan.tier]
  return (
    <div className={`${styles.plan} ${current ? styles.planCurrent : ''}`}>
      <div className={styles.planHead}>
        <h3>{tierDisplayName(plan.tier)}</h3>
        {current && (
          <span className={styles.badge}>
            {t('simeon.billing.currentPlan')}
          </span>
        )}
      </div>
      <div className={styles.price}>
        {monthlyPrice(plan.monthly_price_cents, locale)}
        <small>{t('simeon.billing.perMonth')}</small>
      </div>
      <p className={styles.billed}>
        {trial
          ? t('simeon.billing.freeThenMonthly', { days: plan.trial_days })
          : t('simeon.billing.billedMonthly')}
      </p>
      {current ? (
        <button
          type="button"
          className={`${styles.btn} ${styles.ghost}`}
          disabled
        >
          {t('simeon.billing.yourCurrentPlan')}
        </button>
      ) : (
        <button
          type="button"
          className={styles.btn}
          disabled={busy}
          onClick={onChoose}
        >
          {pending ? t('simeon.billing.oneMoment') : label}
        </button>
      )}
      <p className={styles.inc}>{t(copy.includes)}</p>
      <ul>
        {copy.lines.map((line) => (
          <li key={line}>{t(line)}</li>
        ))}
      </ul>
    </div>
  )
}

export default BillingPage
