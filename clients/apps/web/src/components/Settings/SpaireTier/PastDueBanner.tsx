'use client'

import { toast } from '@/components/Toast/use-toast'
import {
  useCreateCustomerPortalSession,
  useSpaireSubscription,
} from '@/hooks/queries/spaireTier'
import { useCallback, useState } from 'react'

interface PastDueBannerProps {
  organizationId: string
}

const formatDate = (iso: string | null): string | null => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Persistent banner shown across the dashboard while the creator's Spaire
 * subscription is `past_due` (a charge failed). Polar's dunning is already
 * retrying the card; this surfaces the state and gives the creator a direct
 * "Pay now" path to the customer portal to update the card / settle the
 * balance before the suspension deadline. Renders nothing otherwise.
 */
const PastDueBanner = ({ organizationId }: PastDueBannerProps) => {
  const subscription = useSpaireSubscription(organizationId)
  const createSession = useCreateCustomerPortalSession(organizationId)
  const [pending, setPending] = useState(false)
  const sub = subscription.data

  const openPortal = useCallback(async () => {
    setPending(true)
    try {
      const result = await createSession.mutateAsync({
        return_url: window.location.href,
      })
      window.open(result.customer_portal_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      const detail =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any)?.detail ?? 'Could not open billing. Please try again.'
      toast({ title: 'Billing unavailable', description: String(detail) })
    } finally {
      setPending(false)
    }
  }, [createSession])

  if (!sub || sub.status !== 'past_due') {
    return null
  }

  const payBy = formatDate(sub.suspension_at)

  return (
    <div className="flex flex-col items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <span>
        <span className="font-medium">Your Spaire payment failed.</span>{' '}
        {payBy
          ? `Update your card and pay your balance by ${payBy} to keep your plan — after that your subscription is canceled and your org loses access.`
          : 'Update your card to settle your balance and keep your plan.'}
      </span>
      <button
        type="button"
        onClick={openPortal}
        disabled={pending}
        className="shrink-0 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800 disabled:opacity-60"
      >
        {pending ? 'Opening…' : 'Pay balance'}
      </button>
    </div>
  )
}

export default PastDueBanner
