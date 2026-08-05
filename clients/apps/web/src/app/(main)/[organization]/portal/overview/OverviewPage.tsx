'use client'

import {
  useAuthenticatedCustomer,
  useCustomerCustomerMeters,
  useCustomerWallets,
  usePortalAuthenticatedUser,
} from '@/hooks/queries'
import { createClientSideAPI } from '@/utils/client'
import { hasBillingPermission } from '@/utils/customerPortal'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import * as React from 'react'
import { ArrowIcon } from '../_components/icons'

const greetingFor = (date: Date) => {
  const h = date.getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

const formatDateShort = (iso: string | null): string | null => {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

const Stat = ({ label, value }: { label: string; value: string | number }) => (
  <div className="sp-stat">
    <div className="sp-stat-label">{label}</div>
    <div className="sp-stat-value">
      {typeof value === 'number' ? value.toLocaleString() : value}
    </div>
  </div>
)

const OverviewBody = ({
  organization,
  subscriptions,
  claimedSubscriptions,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  subscriptions: schemas['CustomerSubscription'][]
  claimedSubscriptions: schemas['CustomerSubscription'][]
  customerSessionToken: string
}) => {
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const buildHref = (path: string) =>
    searchString ? `${path}?${searchString}` : path

  const api = React.useMemo(
    () => createClientSideAPI(customerSessionToken),
    [customerSessionToken],
  )
  const { data: authenticatedUser } = usePortalAuthenticatedUser(api)
  const { data: customer } = useAuthenticatedCustomer(api)
  const canAccessBilling = hasBillingPermission(authenticatedUser)

  // Secondary destinations (Usage / Wallet / Team) have no top-level tab on
  // their own; surface them here, gated so we never link to a feature the
  // customer can't use or that has no data to show.
  const { data: metersData } = useCustomerCustomerMeters(api)
  const { data: walletsData } = useCustomerWallets(api)
  const isTeamCustomer = customer?.type === 'team'
  const showTeamLink =
    isTeamCustomer &&
    canAccessBilling &&
    !!organization.organization_features?.member_model_enabled
  const showUsageLink = (metersData?.items.length ?? 0) > 0
  const showWalletLink =
    canAccessBilling && (walletsData?.items.length ?? 0) > 0
  const showManageSection = showUsageLink || showWalletLink || showTeamLink

  const activeOwnedSubscriptions = subscriptions.filter(
    (s) => s.status === 'active' || s.status === 'trialing',
  )
  const activeClaimedSubscriptions = claimedSubscriptions.filter(
    (s) => s.status === 'active' || s.status === 'trialing',
  )
  const headlineSubscription =
    activeOwnedSubscriptions[0] ?? activeClaimedSubscriptions[0]

  const displayName =
    customer?.name ||
    customer?.billing_name ||
    authenticatedUser?.name ||
    authenticatedUser?.email?.split('@')[0] ||
    null
  const firstName = displayName ? displayName.split(' ')[0] : 'there'
  const greet = greetingFor(new Date())

  const stats: Array<{ label: string; value: string | number }> = [
    {
      label: 'Active plans',
      value:
        activeOwnedSubscriptions.length + activeClaimedSubscriptions.length,
    },
  ]

  const planTitle = headlineSubscription
    ? `${formatCurrency(headlineSubscription.amount, headlineSubscription.currency)} / ${headlineSubscription.recurring_interval}`
    : null
  const planRenews = headlineSubscription?.current_period_end
    ? formatDateShort(headlineSubscription.current_period_end)
    : null

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">
            {greet}, {firstName}.
          </h1>
        </div>
      </div>

      <div className="sp-stats">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {showManageSection && (
        <>
          <div className="sp-sec-head">
            <h2 className="sp-sec-title">Manage</h2>
          </div>
          <div className="sp-manage">
            {showUsageLink && (
              <Link
                href={buildHref(`/${organization.slug}/portal/usage`)}
                className="sp-btn is-ghost"
              >
                Usage <ArrowIcon size={13} />
              </Link>
            )}
            {showWalletLink && (
              <Link
                href={buildHref(`/${organization.slug}/portal/wallet`)}
                className="sp-btn is-ghost"
              >
                Wallet <ArrowIcon size={13} />
              </Link>
            )}
            {showTeamLink && (
              <Link
                href={buildHref(`/${organization.slug}/portal/team`)}
                className="sp-btn is-ghost"
              >
                Team <ArrowIcon size={13} />
              </Link>
            )}
          </div>
        </>
      )}

      {headlineSubscription && (
        <div className="sp-lib">
          <div>
            <div className="sp-lib-eyebrow">Your library</div>
            <div className="sp-lib-title">{planTitle}</div>
            {planRenews && (
              <div className="sp-lib-meta">Renews {planRenews}</div>
            )}
          </div>
          {canAccessBilling && (
            <Link
              href={buildHref(`/${organization.slug}/portal/settings`)}
              className="sp-btn is-ghost"
            >
              Manage billing <ArrowIcon size={13} />
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

const formatCurrency = (amountCents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amountCents / 100)
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`
  }
}

const ClientPage = ({
  organization,
  subscriptions,
  claimedSubscriptions,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  subscriptions: schemas['ListResource_CustomerSubscription_']
  claimedSubscriptions: schemas['CustomerSubscription'][]
  customerSessionToken: string
}) => {
  return (
    <NuqsAdapter>
      <OverviewBody
        organization={organization}
        subscriptions={subscriptions.items ?? []}
        claimedSubscriptions={claimedSubscriptions}
        customerSessionToken={customerSessionToken}
      />
    </NuqsAdapter>
  )
}

export default ClientPage
