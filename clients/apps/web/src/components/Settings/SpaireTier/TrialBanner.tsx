'use client'

import { useSpaireSubscription } from '@/hooks/queries/spaireTier'
import Link from 'next/link'

interface TrialBannerProps {
  organizationId: string
  organizationSlug: string
}

// Days until the trial ends; negative once the trial end is in the past.
const daysLeft = (trialEnd: string | null | undefined): number | null => {
  if (!trialEnd) return null
  const ms = new Date(trialEnd).getTime() - Date.now()
  if (Number.isNaN(ms)) return null
  return Math.ceil(ms / (1000 * 60 * 60 * 24))
}

/**
 * Persistent banner shown across the dashboard while the creator is on the
 * auto-attached Starter trial, counting down to conversion and linking to
 * the plan page to add a payment method. Renders nothing once the trial is
 * converted or expired.
 */
const TrialBanner = ({
  organizationId,
  organizationSlug,
}: TrialBannerProps) => {
  const subscription = useSpaireSubscription(organizationId)
  const sub = subscription.data

  if (!sub || sub.status !== 'trialing') {
    return null
  }

  const remaining = daysLeft(sub.trial_end)
  // A stale 'trialing' status can outlive the trial-end date; never claim
  // a past trial "ends today".
  const ended = remaining !== null && remaining < 0
  const countdown =
    remaining === null
      ? 'Your free trial is active'
      : ended
        ? 'Your free trial has ended'
        : remaining === 0
          ? 'Your free trial ends today'
          : remaining === 1
            ? 'Your free trial ends tomorrow'
            : `Your free trial ends in ${remaining} days`

  return (
    <div className="flex flex-col items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>
        <span className="font-medium">{countdown}.</span>{' '}
        {ended
          ? 'Head to the plan page to pick a plan and keep your access.'
          : `Your card on file is charged when it ends and your plan continues — cancel any time before then if you don't want to keep going.`}
      </span>
      <Link
        href={`/dashboard/${organizationSlug}/settings/plan`}
        className="shrink-0 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800"
      >
        Manage plan
      </Link>
    </div>
  )
}

export default TrialBanner
