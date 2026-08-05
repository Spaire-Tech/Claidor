'use client'

import {
  CurrentSpaireSubscription,
  SpaireTierKey,
  TierFeatures,
  TierLimits,
  tierDisplayName,
  useSpaireSubscription,
} from './spaireTier'

export type FeatureKey = keyof TierFeatures
export type LimitKey = keyof TierLimits

/**
 * The minimum paid tier that unlocks each feature. Mirrors
 * polar/entitlements/tiers.py — keep in sync when you flip a feature
 * up or down a tier.
 */
const FEATURE_REQUIRED_TIER: Record<FeatureKey, SpaireTierKey> = {
  drip_scheduling: 'starter',
  // Sequences & segments are included on Starter (3 active on Starter,
  // 15 on Studio) — the count cap is enforced separately, the feature
  // itself is not gated above Starter. Must match the backend, which
  // sets email_sequences_and_segments=True on Starter.
  email_sequences_and_segments: 'starter',
  email_ab_testing: 'studio',
  stackable_discounts: 'studio',
  custom_email_sender_domain: 'studio',
  seat_based_product_pricing: 'studio',
  cohort_analytics: 'studio',
  customer_wallet: 'studio',
  white_label_course_player: 'studio',
  sandbox_mode: 'starter',
  custom_pricing_negotiation: 'scale',
  // Hosted (custom) storefront domain unlocked on Studio — matches
  // tiers.py custom_storefront_domain=True on studio and scale.
  custom_storefront_domain: 'studio',
  custom_checkout_domain: 'scale',
  sso: 'scale',
  audit_logs: 'scale',
}

export interface Entitlements {
  isLoading: boolean
  tier: SpaireTierKey | null
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
 * limit headroom, trial countdown. Built on top of useSpaireSubscription
 * so it stays in sync with whatever the platform-org subscription says.
 */
export const useEntitlements = (
  organizationId: string | undefined,
): Entitlements => {
  const sub = useSpaireSubscription(organizationId)
  const data: CurrentSpaireSubscription | undefined = sub.data

  const tier = (data?.tier ?? null) as SpaireTierKey | null
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
