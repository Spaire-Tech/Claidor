'use client'

import {
  CurrentSimeonSubscription,
  SimeonTierKey,
  TierFeatures,
  TierLimits,
  tierDisplayName,
  useSimeonSubscription,
} from './simeonTier'

export type FeatureKey = keyof TierFeatures
export type LimitKey = keyof TierLimits

/**
 * The minimum paid tier that unlocks each feature. Mirrors
 * simeon/entitlements/tiers.py — keep in sync when you flip a feature
 * up or down a tier.
 */
const FEATURE_REQUIRED_TIER: Record<FeatureKey, SimeonTierKey> = {
  // The creator-era feature gates, kept in step with tiers.py: Standard
  // carries what Starter did, Pro what Studio did, Max what Scale did.
  drip_scheduling: 'standard',
  email_sequences_and_segments: 'standard',
  email_ab_testing: 'pro',
  stackable_discounts: 'pro',
  custom_email_sender_domain: 'pro',
  seat_based_product_pricing: 'pro',
  cohort_analytics: 'pro',
  customer_wallet: 'pro',
  white_label_course_player: 'pro',
  sandbox_mode: 'standard',
  custom_pricing_negotiation: 'max',
  custom_storefront_domain: 'pro',
  custom_checkout_domain: 'max',
  sso: 'max',
  audit_logs: 'max',
}

export interface Entitlements {
  isLoading: boolean
  tier: SimeonTierKey | null
  status: string | null
  trialEnd: Date | null
  /**
   * Whole days between now and trial_end (negative when expired).
   * null when the subscription is not currently trialing.
   */
  daysLeftInTrial: number | null
  features: TierFeatures | null
  limits: TierLimits | null
  /** Does the current tier include this feature? */
  hasFeature: (feature: FeatureKey) => boolean
  /**
   * Minimum tier that unlocks the feature, in display form ("Studio",
   * "Scale", etc.). Useful for upgrade prompts.
   */
  requiredTierFor: (feature: FeatureKey) => string
}

/**
 * One-stop shop for "what is this org allowed to do?" — feature gates,
 * limit headroom, trial countdown. Built on top of useSimeonSubscription
 * so it stays in sync with whatever the platform-org subscription says.
 */
export const useEntitlements = (
  organizationId: string | undefined,
): Entitlements => {
  const sub = useSimeonSubscription(organizationId)
  const data: CurrentSimeonSubscription | undefined = sub.data

  const tier = (data?.tier ?? null) as SimeonTierKey | null
  const features = data?.entitlements.features ?? null
  const limits = data?.entitlements.limits ?? null
  const status = data?.status ?? null
  const trialEnd = data?.trial_end ? new Date(data.trial_end) : null

  const daysLeftInTrial =
    status === 'trialing' && trialEnd
      ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null

  const hasFeature = (feature: FeatureKey): boolean =>
    Boolean(features?.[feature])

  const requiredTierFor = (feature: FeatureKey): string =>
    tierDisplayName(FEATURE_REQUIRED_TIER[feature])

  return {
    isLoading: sub.isLoading,
    tier,
    status,
    trialEnd,
    daysLeftInTrial,
    features,
    limits,
    hasFeature,
    requiredTierFor,
  }
}
