'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  formatCredits,
  hasPlan,
  PaidTierKey,
  renewalSentence,
  tierDisplayName,
  useMySubscription,
  usePlans,
  useStartCheckout,
  useSyncCheckout,
} from '@/hooks/queries/plans'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import './billing-pricing.css'
import { pricingCards, PricingCardView } from './pricing-cards'
import SitePricing from './SitePricing'

interface BillingPageProps {
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
 * app.simeonlabs.com/billing: the site's pricing section, as checkout.
 * Someone who already has a plan is sent to manage it in the Simeon app.
 */
const BillingPage = ({
  plan,
  returnTo,
  upgraded,
  checkoutSessionId,
}: BillingPageProps) => {
  const plans = usePlans()
  const subscription = useMySubscription()
  const sync = useSyncCheckout()
  const start = useStartCheckout()
  const [pendingId, setPendingId] = useState<PricingCardView['id'] | null>(null)
  const synced = useRef<string | null>(null)

  useEffect(() => {
    if (!checkoutSessionId || synced.current === checkoutSessionId) return
    synced.current = checkoutSessionId
    sync.mutate(checkoutSessionId)
  }, [checkoutSessionId, sync])

  const sub = subscription.data
  const subscribed = hasPlan(sub)
  const view = pricingCards(plans.data?.items ?? [], plan)

  const choose = useCallback(
    async (card: PricingCardView) => {
      if (!card.ready || pendingId !== null) return
      setPendingId(card.id)
      try {
        const { checkout_url } = await start.mutateAsync({
          tier: card.tier,
          billing_interval: 'month',
          ...(returnTo ? { success_url: returnTo } : {}),
        })
        window.location.assign(checkout_url)
      } catch {
        toast({
          title: 'Could not open checkout',
          description: 'Please try again in a moment.',
        })
        setPendingId(null)
      }
    },
    [pendingId, returnTo, start],
  )

  const loading = subscription.isPending || (plans.isPending && !subscribed)
  const failed = subscription.isError || (plans.isError && !subscribed)

  return (
    <section className="simeon-billing" aria-label="Pricing">
      <div className="wrap">
        <h2>{subscribed ? 'Your plan' : 'Pricing'}</h2>

        {upgraded && (
          <p className="note">
            <strong>Your card is saved.</strong>{' '}
            {sub?.status === 'trialing'
              ? 'Your 7 days start now. Open Simeon on your Mac and sign in to begin.'
              : 'Your plan is active. Open Simeon on your Mac to keep going.'}
          </p>
        )}

        {returnTo && !subscribed && !loading && (
          <p className="note">
            <strong>One step before you sign in to Simeon on your Mac.</strong>{' '}
            Pick a plan and save a card. Your 7 days are free and you can cancel
            any time before they end. You are sent back to finish signing in
            once the card is saved.
          </p>
        )}

        {checkoutSessionId && !subscribed && !loading && (
          <p className="note">Saving your card…</p>
        )}

        {loading ? (
          <p className="manage">Loading plans…</p>
        ) : failed ? (
          <p className="manage">
            Could not load plans.{' '}
            <button
              className="btn"
              onClick={() => {
                void subscription.refetch()
                void plans.refetch()
              }}
              type="button"
            >
              Try again
            </button>
          </p>
        ) : subscribed && sub ? (
          <div className="manage">
            {sub.status === 'past_due' && (
              <p>
                <strong>Your last payment failed.</strong> Update the card in
                the Simeon app to keep the plan.
              </p>
            )}
            <p>
              <strong>
                Simeon {tierDisplayName(sub.tier)}
                {sub.status === 'trialing' ? ', on trial' : ''}.
              </strong>{' '}
              {sub.status === 'trialing'
                ? `${formatCredits(sub.entitlements.trial_credits)} credits for the trial, then ${formatCredits(sub.entitlements.weekly_credits)} a week.`
                : `${formatCredits(sub.entitlements.weekly_credits)} credits a week, resetting every Monday.`}
            </p>
            {renewalSentence(sub) && <p>{renewalSentence(sub)}</p>}
            <p>
              Manage the plan, the card and the invoices in the Simeon app,
              under Settings and Usage &amp; Billing.
            </p>
            {returnTo && (
              <p>
                <Link href={returnTo}>
                  Go back and finish signing in to Simeon.
                </Link>
              </p>
            )}
          </div>
        ) : (
          <SitePricing
            cards={view.cards}
            highlight={view.highlight}
            onChoose={(card) => void choose(card)}
            pendingId={pendingId}
          />
        )}
      </div>
    </section>
  )
}

export default BillingPage
