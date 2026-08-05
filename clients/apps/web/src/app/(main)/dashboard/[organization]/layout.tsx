import { OrganizationContextProvider } from '@/providers/maintainerOrganization'
import PastDueBanner from '@/components/Settings/SpaireTier/PastDueBanner'
// Trial banner temporarily hidden per request — re-enable by uncommenting
// this import and the <TrialBanner /> render below.
// import TrialBanner from '@/components/Settings/SpaireTier/TrialBanner'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { getUserOrganizations } from '@/utils/user'
import { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import React from 'react'

export async function generateMetadata(props: {
  params: Promise<{ organization: string }>
}): Promise<Metadata> {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  return {
    title: {
      template: `%s | ${organization.name} | Spaire`,
      default: organization.name,
    },
  }
}

export default async function Layout(props: {
  params: Promise<{ organization: string }>
  children: React.ReactNode
}) {
  const params = await props.params

  const { children } = props

  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )

  let userOrganizations = await getUserOrganizations(api, false)

  // If the organization is not in the user's organizations, refetch bypassing the cache
  // This avoids race conditions with new organizations (e.g. during onboarding) without losing
  // the cache in 99% of the cases
  if (!userOrganizations.some((org) => org.id === organization.id)) {
    userOrganizations = await getUserOrganizations(api, true)
  }

  // If we can't find the organization even after a refresh, redirect
  if (!userOrganizations.some((org) => org.id === organization.id)) {
    return redirect('/dashboard')
  }

  // Plan-selection gate: keep half-onboarded creators out of the
  // dashboard until they finish the onboarding flow. The gate
  // releases when EITHER:
  //   (a) ai_onboarding_completed_at is stamped, OR
  //   (b) the org has a real platform subscription (not the
  //       auto-attached Starter trial) — i.e. the creator went through
  //       upgrade-checkout at some point. This second branch keeps
  //       established customers from being bounced into onboarding
  //       just because their pre-existing org never tripped the new
  //       ai_onboarding_completed_at flag.
  //
  // /onboarding/* is exempted so the user can actually progress
  // through onboarding; /finance/account is exempted so connect-
  // a-payout flows initiated from the AI assistant can finish even
  // when the assistant marks onboarding complete from a side path.
  const requestHeaders = await headers()
  const pathname = requestHeaders.get('x-spaire-pathname') ?? ''
  const orgPathPrefix = `/dashboard/${params.organization}`
  const isOnboardingRoute = pathname.startsWith(`${orgPathPrefix}/onboarding`)
  const isFinanceAccountRoute = pathname.startsWith(
    `${orgPathPrefix}/finance/account`,
  )
  const onboardingCompletedAt = (
    organization as typeof organization & {
      ai_onboarding_completed_at?: string | null
    }
  ).ai_onboarding_completed_at

  let planPicked = Boolean(onboardingCompletedAt)
  if (!planPicked && !isOnboardingRoute && !isFinanceAccountRoute) {
    // Second source of truth for "creator finished plan selection":
    // they have an active platform subscription that is NOT the
    // auto-attached Starter trial. Fetching this on every dashboard
    // request is cheap (one indexed lookup) and protects existing
    // paid customers from getting bounced into onboarding on
    // deploy. Any error here fails open to a redirect so a
    // misconfigured platform org doesn't silently let everyone
    // skip onboarding.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const platformApi = api as unknown as any
      const { data: subscription } = await platformApi.GET(
        '/v1/platform/organizations/{organization_id}/subscription',
        {
          params: { path: { organization_id: organization.id } },
          cache: 'no-store',
        },
      )
      if (subscription) {
        const sub = subscription as {
          status?: string
          is_default_trial?: boolean
        }
        const hasActiveSub =
          !!sub.status && sub.status !== 'none' && sub.status !== 'canceled'
        if (hasActiveSub && !sub.is_default_trial) {
          planPicked = true
        }
      }
    } catch {
      // Swallow — if we can't reach the platform endpoint we keep
      // the redirect behavior, which is the safer default. (Single-
      // tenant deploys without a configured platform org will always
      // return tier=legacy / status=none here; those installations
      // should rely on ai_onboarding_completed_at instead.)
    }
  }

  if (!planPicked && !isOnboardingRoute && !isFinanceAccountRoute) {
    return redirect(`${orgPathPrefix}/onboarding/plan`)
  }

  // Course-only ("MasterClass builder") reposition: the generic
  // digital-business surfaces are removed from the dashboard nav
  // (components/Dashboard/navigation.tsx) but remain reachable by direct
  // URL, so we also gate them here and bounce to the course list. Payment
  // Links (/products/checkout-links) and Discounts (/products/discounts)
  // are intentionally kept, and product detail/edit plus course creation
  // (/products/new) stay reachable — so under /products we gate only the
  // catalog list and the digital-only delivery types. Reversible: remove
  // this block (and restore the nav `if`) to bring a surface back.
  const relPath = pathname.startsWith(orgPathPrefix)
    ? pathname.slice(orgPathPrefix.length)
    : ''
  const hiddenSurfacePrefixes = [
    '/storefront',
    '/email-marketing',
    '/developers',
    '/founder-tools',
    '/formation',
    '/startup-stack',
    '/claude-code',
    // Usage-metering analytics — hidden from the Analytics tabs too. The
    // Metrics tab (/analytics, /analytics/metrics) stays reachable.
    '/analytics/events',
    '/analytics/costs',
  ]
  const isHiddenSurface =
    hiddenSurfacePrefixes.some(
      (prefix) => relPath === prefix || relPath.startsWith(`${prefix}/`),
    ) ||
    relPath === '/products' ||
    relPath === '/products/' ||
    relPath.startsWith('/products/benefits') ||
    relPath.startsWith('/products/meters') ||
    relPath.startsWith('/products/lead-magnets')
  if (isHiddenSurface && !isOnboardingRoute) {
    return redirect(`${orgPathPrefix}/courses`)
  }

  return (
    <OrganizationContextProvider
      organization={organization}
      organizations={userOrganizations}
    >
      <PastDueBanner organizationId={organization.id} />
      {/* Trial banner temporarily hidden per request — re-enable by
          uncommenting this and the TrialBanner import above. */}
      {/* <TrialBanner
        organizationId={organization.id}
        organizationSlug={organization.slug}
      /> */}
      {children}
    </OrganizationContextProvider>
  )
}
