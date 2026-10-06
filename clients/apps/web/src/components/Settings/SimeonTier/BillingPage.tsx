'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  formatCredits,
  hasPlan,
  PaidTierKey,
  renewalSentence,
  tierDisplayName,
  useMySubscription,
  useOpenPortal,
  useSyncCheckout,
} from '@/hooks/queries/plans'
import Button from '@simeon/ui/components/atoms/Button'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import PlanCards from './PlanCards'

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
 * app.simeonlabs.com/billing: the person's plan, the three cards, and
 * Stripe's Customer Portal for cards, invoices and changes. The Mac
 * app's upgrade button, the site's "Try it free" buttons and the Mac
 * sign-in gate all land here (docs/services-billing.md).
 */
const BillingPage = ({
  plan,
  returnTo,
  upgraded,
  checkoutSessionId,
}: BillingPageProps) => {
  const subscription = useMySubscription()
  const sync = useSyncCheckout()
  const openPortal = useOpenPortal()
  const [portalPending, setPortalPending] = useState(false)
  const synced = useRef<string | null>(null)

  // The checkout came back: copy its subscription in before Stripe's
  // webhook does, so the page says "trialing" at once. Once per id.
  useEffect(() => {
    if (!checkoutSessionId || synced.current === checkoutSessionId) return
    synced.current = checkoutSessionId
    sync.mutate(checkoutSessionId)
  }, [checkoutSessionId, sync])

  const sub = subscription.data
  const subscribed = hasPlan(sub)

  const portal = useCallback(
    async (flow?: 'payment_method') => {
      setPortalPending(true)
      try {
        const { portal_url } = await openPortal.mutateAsync({ flow })
        window.location.assign(portal_url)
      } catch {
        toast({
          title: 'Could not open your billing page',
          description: 'Please try again in a moment.',
        })
        setPortalPending(false)
      }
    },
    [openPortal],
  )

  return (
    <div className="flex flex-col gap-y-10">
      {sub?.status === 'past_due' && (
        <div className="flex flex-col gap-y-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-900 md:flex-row md:items-center md:justify-between">
          <span>
            <span className="font-medium">Your last payment failed.</span>{' '}
            Stripe retries the card for a few days; update it to keep your plan.
          </span>
          <Button
            variant="outline"
            loading={portalPending}
            onClick={() => portal('payment_method')}
          >
            Update card
          </Button>
        </div>
      )}

      {upgraded && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-900">
          <span className="font-medium">Your card is saved.</span>{' '}
          {sub?.status === 'trialing'
            ? 'Your 7 days start now. Open Simeon on your Mac and sign in to begin.'
            : 'Your plan is active. Open Simeon on your Mac to keep going.'}
        </div>
      )}

      {returnTo && !subscribed && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <span className="font-medium">
            One step before you sign in to Simeon on your Mac.
          </span>{' '}
          Pick a plan and save a card. Your 7 days are free and you can cancel
          any time before they end. You are sent back to finish signing in once
          the card is saved.
        </div>
      )}

      {returnTo && subscribed && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <span className="font-medium">You have a plan.</span>{' '}
          <Link href={returnTo} className="underline">
            Go back and finish signing in to Simeon.
          </Link>
        </div>
      )}

      {sub && subscribed && (
        <div className="flex flex-col gap-y-1 rounded-2xl border border-gray-200 bg-white px-6 py-5">
          <span className="text-xs tracking-wide text-gray-500 uppercase">
            Your plan
          </span>
          <span className="text-xl font-medium text-gray-900">
            Simeon {tierDisplayName(sub.tier)}
            {sub.status === 'trialing' ? ', on trial' : ''}
          </span>
          <span className="text-sm text-gray-500">
            {sub.status === 'trialing'
              ? `${formatCredits(sub.entitlements.trial_credits)} credits for the trial, then ${formatCredits(
                  sub.entitlements.weekly_credits,
                )} a week.`
              : `${formatCredits(sub.entitlements.weekly_credits)} credits a week, resetting every Monday.`}
          </span>
          {renewalSentence(sub) && (
            <span className="text-sm text-gray-500">
              {renewalSentence(sub)}
            </span>
          )}
          <span className="text-sm text-gray-500">
            How much you have used this week is in Simeon, under Settings and
            Usage.
          </span>
        </div>
      )}

      <PlanCards successUrl={returnTo ?? undefined} highlightTier={plan} />

      {(subscribed || sub?.stripe_customer_id) && (
        <div className="flex flex-col gap-y-3 rounded-2xl border border-gray-200 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-y-1">
            <span className="text-base font-medium text-gray-900">
              Cards, invoices and receipts
            </span>
            <span className="text-sm text-gray-500">
              Your card, your invoices and your billing address are on Stripe.
              Changing or cancelling your plan is there too.
            </span>
          </div>
          <Button
            variant="outline"
            loading={portalPending}
            onClick={() => portal()}
          >
            Open billing on Stripe
          </Button>
        </div>
      )}
    </div>
  )
}

export default BillingPage
