'use client'

import revalidate from '@/app/actions'
import { ForceLightMode } from '@/components/Profile/ForceLightMode'
import { toast } from '@/components/Toast/use-toast'
import { useSpaireSubscription } from '@/hooks/queries/spaireTier'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import { api } from '@/utils/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useContext, useEffect, useRef } from 'react'

/**
 * Onboarding completion step.
 *
 * In the course-only ("MasterClass builder") flow, onboarding is just two
 * visible steps — OrganizationStep ("name + slug + logo", /dashboard/create)
 * then PlanPage ("Choose your plan", /onboarding/plan). Plan selection hands
 * off to Polar-hosted checkout, which returns here with ?upgraded=1.
 *
 * This page no longer renders a "Create your Space Card" editor. It is an
 * invisible finishing step: it verifies the checkout actually converted the
 * auto-attached trial, stamps ai_onboarding_completed_at so the dashboard
 * plan-gate releases, then forwards the creator straight into the course
 * wizard ("Sell your expertise"). The public storefront is intentionally NOT
 * enabled here — Space is hidden in this build (see the Phase 6 reposition).
 */

// The upgrade webhook can land a beat after Polar redirects back, so the
// subscription may still read as the auto-trial for a moment. Poll a few
// times before concluding the checkout never completed.
const MAX_VERIFY_ATTEMPTS = 6
const VERIFY_INTERVAL_MS = 1500

export default function ReviewPage() {
  const { organization } = useContext(OrganizationContext)
  const router = useRouter()
  const searchParams = useSearchParams()
  const subscriptionQuery = useSpaireSubscription(organization.id)

  // Polar redirects back here with ?upgraded=1 after checkout. Without it
  // there is nothing to finish — send the creator back to pick a plan.
  const cameFromCheckout = searchParams.get('upgraded') === '1'

  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const courseWizardPath = `/dashboard/${organization.slug}/products/new?type=course`
    const planPath = `/dashboard/${organization.slug}/onboarding/plan`

    if (!cameFromCheckout) {
      router.replace(planPath)
      return
    }

    let cancelled = false

    const finishOnboarding = async () => {
      // Stamp ai_onboarding_completed_at so the dashboard plan-gate releases.
      // Idempotent server-side; failures are non-fatal because the active
      // paid subscription is a second source of truth for the gate.
      await api
        .POST('/v1/organizations/{id}/ai-onboarding-complete', {
          params: { path: { id: organization.id } },
        })
        .catch(() => undefined)
      await revalidate(`organizations:${organization.id}`)
      await revalidate(`organizations:${organization.slug}`)
    }

    const run = async () => {
      // `is_default_trial` stays true while the active subscription is still
      // the auto-created trial from organization.created. It flips false once
      // Stripe mints a subscription on the chosen tier — our proof checkout
      // completed (the ?upgraded=1 param alone can be spoofed by browser-back).
      for (let attempt = 0; attempt < MAX_VERIFY_ATTEMPTS; attempt++) {
        const { data } = await subscriptionQuery.refetch()
        if (cancelled) return
        if (data && !data.is_default_trial) {
          await finishOnboarding()
          if (cancelled) return
          router.replace(courseWizardPath)
          return
        }
        await new Promise((resolve) => setTimeout(resolve, VERIFY_INTERVAL_MS))
        if (cancelled) return
      }

      toast({
        title: 'Finish picking your plan',
        description:
          "Looks like the Spaire checkout didn't finish — pick a plan to keep going.",
      })
      router.replace(planPath)
    }

    void run()

    return () => {
      cancelled = true
    }
    // Mount-once: the verification loop owns its own polling and cancellation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <ForceLightMode />
      <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-gray-900" />
        <p className="text-[15px] text-gray-500">Setting up your studio…</p>
      </div>
    </>
  )
}
