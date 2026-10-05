'use client'

import {
  formatCredits,
  PaidTierKey,
  renewalSentence,
  tierDisplayName,
  useSimeonSubscription,
} from '@/hooks/queries/simeonTier'
import { schemas } from '@simeon/client'
import Link from 'next/link'
import PastDueBanner from './PastDueBanner'
import SimeonBillingManagement from './SimeonBillingManagement'
import SimeonPlanCards from './SimeonPlanCards'
import TrialBanner from './TrialBanner'

interface BillingPageProps {
  organization: schemas['Organization']
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
}

/**
 * app.simeonlabs.com/billing: the person's plan, the three cards, and
 * the cards and invoices below. The Mac app's upgrade button, the site's
 * "Try it free" buttons and the Mac sign-in gate all land here
 * (docs/services-billing.md).
 */
const BillingPage = ({
  organization,
  plan,
  returnTo,
  upgraded,
}: BillingPageProps) => {
  const subscription = useSimeonSubscription(organization.id)
  const sub = subscription.data
  const hasPlan =
    sub !== undefined && sub.tier !== 'inactive' && sub.tier !== 'unmanaged'

  return (
    <div className="flex flex-col gap-y-10">
      <PastDueBanner organizationId={organization.id} />
      <TrialBanner organizationId={organization.id} />

      {upgraded && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-900">
          <span className="font-medium">Your card is saved.</span>{' '}
          {sub?.status === 'trialing'
            ? 'Your 7 days start now. Open Simeon on your Mac and sign in to begin.'
            : 'Your plan is active. Open Simeon on your Mac to keep going.'}
        </div>
      )}

      {returnTo && !hasPlan && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <span className="font-medium">
            One step before you sign in to Simeon on your Mac.
          </span>{' '}
          Pick a plan and save a card. Your 7 days are free and you can cancel
          any time before they end. You are sent back to finish signing in once
          the card is saved.
        </div>
      )}

      {returnTo && hasPlan && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900">
          <span className="font-medium">You have a plan.</span>{' '}
          <Link href={returnTo} className="underline">
            Go back and finish signing in to Simeon.
          </Link>
        </div>
      )}

      {sub && hasPlan && (
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

      <SimeonPlanCards
        organization={organization}
        successUrl={returnTo ?? undefined}
        highlightTier={plan}
      />

      {hasPlan && <SimeonBillingManagement organization={organization} />}
    </div>
  )
}

export default BillingPage
