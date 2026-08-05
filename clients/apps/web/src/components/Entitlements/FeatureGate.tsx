'use client'

import { FeatureKey, useEntitlements } from '@/hooks/queries/entitlements'
import LockOutlined from '@mui/icons-material/LockOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'

interface FeatureGateProps {
  feature: FeatureKey
  organizationId: string
  organizationSlug: string
  children: ReactNode
  /** Override the gate's headline copy. */
  title?: string
  /** Override the gate's sub-copy. */
  description?: string
  /** Render the gate inline (no full-page card) instead of replacing the
   *  children with a hero. Used when the gated thing is part of a
   *  larger layout (e.g. a feature toggle inside a form). */
  variant?: 'card' | 'inline'
}

/**
 * Wrap any creator-facing surface that requires a paid feature flag.
 * If the org's current tier includes the feature, children render
 * untouched. Otherwise we replace them with an upgrade card that
 * routes to /settings/plan.
 *
 * Mirrors the backend's `entitlements_service.require_feature(...)`
 * — when the user upgrades, the UI unlocks without any other change.
 */
export const FeatureGate = ({
  feature,
  organizationId,
  organizationSlug,
  children,
  title,
  description,
  variant = 'card',
}: FeatureGateProps) => {
  const { isLoading, hasFeature, requiredTierFor } =
    useEntitlements(organizationId)

  if (isLoading) {
    return <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
  }

  if (hasFeature(feature)) {
    return <>{children}</>
  }

  const requiredTier = requiredTierFor(feature)
  const headline = title ?? `${FEATURE_NICE_NAME[feature]} is on ${requiredTier}`
  const sub =
    description ??
    `Upgrade to ${requiredTier} to unlock ${FEATURE_NICE_NAME[feature].toLowerCase()}.`

  return (
    <div
      className={twMerge(
        'flex flex-col items-center gap-y-4 rounded-2xl border border-gray-200 bg-white text-center',
        variant === 'card' ? 'px-8 py-16' : 'px-6 py-8',
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
        <LockOutlined className="text-blue-500" style={{ fontSize: 22 }} />
      </div>
      <div className="flex max-w-md flex-col gap-y-1">
        <h3 className="text-lg font-medium text-gray-900">{headline}</h3>
        <p className="text-sm text-gray-500">{sub}</p>
      </div>
      <Link href={`/dashboard/${organizationSlug}/settings/plan`}>
        <Button className="bg-black text-white hover:bg-gray-800">
          Upgrade to {requiredTier}
        </Button>
      </Link>
    </div>
  )
}

/**
 * Display copy for each feature. Centralised so upgrade cards and
 * inline locks all show the same name.
 */
const FEATURE_NICE_NAME: Record<FeatureKey, string> = {
  drip_scheduling: 'Drip scheduling',
  email_sequences_and_segments: 'Email sequences',
  email_ab_testing: 'A/B testing',
  stackable_discounts: 'Stackable discounts',
  custom_email_sender_domain: 'Custom email sender domain',
  seat_based_product_pricing: 'B2B seat pricing',
  cohort_analytics: 'Cohort analytics',
  customer_wallet: 'Customer wallet',
  white_label_course_player: 'White-label player',
  sandbox_mode: 'Sandbox / test mode',
  custom_pricing_negotiation: 'Custom pricing',
  custom_storefront_domain: 'Custom storefront domain',
  custom_checkout_domain: 'Custom checkout domain',
  sso: 'SSO',
  audit_logs: 'Audit logs',
}
