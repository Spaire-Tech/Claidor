'use client'

import {
  useAuthenticatedCustomer,
  usePortalAuthenticatedUser,
} from '@/hooks/queries'
import { useCommunityEnrolledCourses } from '@/hooks/queries/community'
import { createClientSideAPI } from '@/utils/client'
import { hasBillingPermission } from '@/utils/customerPortal'
import { schemas } from '@spaire/client'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

export type PortalTabKey =
  | 'overview'
  | 'courses'
  | 'community'
  | 'orders'
  | 'team'
  | 'settings'

export type PortalTab = {
  key: PortalTabKey
  href: string
  label: string
  matches: (path: string) => boolean
  /** Shown in the desktop pill strip. */
  desktop: boolean
  /** Shown in the mobile bottom tab bar. Tabs that aren't (Enrollments,
   * Team) live in the mobile "You" hub instead. */
  mobile: boolean
}

// Single source of truth for portal navigation. Both the desktop TopBar and
// the mobile bottom tab bar consume this hook, so permission gating and route
// matching can't drift between the two.
export const usePortalTabs = (
  organization: schemas['CustomerOrganization'],
) => {
  const searchParams = useSearchParams()
  const token =
    searchParams.get('customer_session_token') ??
    searchParams.get('member_session_token')

  // Always call hooks at the top level (rules of hooks). When there is no
  // token the API instance still gets built, but the underlying queries will
  // fail silently and gated tabs simply stay hidden.
  const api = React.useMemo(() => createClientSideAPI(token ?? ''), [token])
  const { data: authenticatedUser, isLoading: userLoading } =
    usePortalAuthenticatedUser(api)
  const { data: customer, isLoading: customerLoading } =
    useAuthenticatedCustomer(api)
  const { data: communityCourses, isLoading: communityLoading } =
    useCommunityEnrolledCourses(token)

  // False until every tab-gating query has settled — PortalShell holds the
  // whole portal behind the boot loader on this, so the gated tabs
  // (Community / Enrollments / Billing) never pop in after the fact.
  // (Disabled queries — no token — report isLoading: false, so a tokenless
  // visit doesn't hang here.)
  const ready = !userLoading && !customerLoading && !communityLoading

  // Community is only surfaced once at least one enrolled course has a live,
  // published community. Undefined data (still loading) keeps it hidden so we
  // never flash a tab that then disappears.
  const showCommunity = (communityCourses ?? []).some(
    (c) => c.community_enabled,
  )
  const canAccessBilling = hasBillingPermission(authenticatedUser)
  const isTeamCustomer = customer?.type === 'team'
  // Team management is shown to team customers whose billing-capable members
  // can manage seats (member model orgs only).
  const showTeam = !!(
    isTeamCustomer &&
    canAccessBilling &&
    organization.organization_features?.member_model_enabled
  )

  const searchString = searchParams.toString()
  const buildHref = React.useCallback(
    (href: string) => (searchString ? `${href}?${searchString}` : href),
    [searchString],
  )

  const slug = organization.slug
  const tabs = React.useMemo((): PortalTab[] => {
    const list: PortalTab[] = [
      {
        key: 'overview',
        href: `/${slug}/portal/overview`,
        label: 'Overview',
        matches: (p) => p.includes('/portal/overview'),
        desktop: true,
        mobile: true,
      },
      {
        key: 'courses',
        href: `/${slug}/portal/courses`,
        label: 'Masterclasses',
        // Don't light up Courses while inside a course's community sub-route —
        // that path belongs to the Community tab (matched below).
        matches: (p) =>
          p.includes('/portal/courses') &&
          !/\/portal\/courses\/[^/]+\/community/.test(p),
        desktop: true,
        mobile: true,
      },
    ]
    if (showCommunity) {
      list.push({
        key: 'community',
        href: `/${slug}/portal/community`,
        label: 'Community',
        matches: (p) =>
          p.includes('/portal/community') ||
          /\/portal\/courses\/[^/]+\/community/.test(p),
        desktop: true,
        mobile: true,
      })
    }
    // Phase 4d: Downloads tab hidden from the student portal nav. Route file
    // is kept; add an entry here to bring the tab back on both surfaces.
    if (canAccessBilling) {
      list.push({
        key: 'orders',
        href: `/${slug}/portal/orders`,
        label: 'Enrollments',
        matches: (p) => p.includes('/portal/orders'),
        desktop: true,
        mobile: false,
      })
    }
    if (showTeam) {
      list.push({
        key: 'team',
        href: `/${slug}/portal/team`,
        label: 'Team',
        matches: (p) => p.includes('/portal/team'),
        desktop: true,
        mobile: false,
      })
    }
    if (canAccessBilling) {
      list.push({
        key: 'settings',
        href: `/${slug}/portal/settings`,
        label: 'Billing',
        matches: (p) => p.includes('/portal/settings'),
        desktop: true,
        mobile: true,
      })
    }
    return list
  }, [slug, showCommunity, canAccessBilling, showTeam])

  return {
    tabs,
    buildHref,
    token,
    api,
    authenticatedUser,
    customer,
    canAccessBilling,
    showTeam,
    ready,
  }
}
