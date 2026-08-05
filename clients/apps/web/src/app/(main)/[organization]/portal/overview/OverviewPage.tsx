'use client'

import {
  useAuthenticatedCustomer,
  useCustomerCustomerMeters,
  useCustomerWallets,
  usePortalAuthenticatedUser,
} from '@/hooks/queries'
import {
  useCustomerCourses,
  type CustomerCourseEnrollment,
} from '@/hooks/queries/courses'
import { createClientSideAPI } from '@/utils/client'
import { hasBillingPermission } from '@/utils/customerPortal'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import * as React from 'react'
import { ArrowIcon, CheckIcon, PlayIcon } from '../_components/icons'
import { PortalLoading } from '../_components/PortalLoading'

const isCompleted = (e: CustomerCourseEnrollment) =>
  e.progress.total_lessons > 0 &&
  e.progress.completed_lessons >= e.progress.total_lessons

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

const SmallCard = ({
  enrollment,
  href,
  index,
}: {
  enrollment: CustomerCourseEnrollment
  href: string
  index: number
}) => {
  const completed = isCompleted(enrollment)
  const completedLabel = completed
    ? formatDateShort(enrollment.completed_at)
    : null
  const progressPct = Math.round(enrollment.progress.completion_percent)
  const objectPosition = enrollment.course.thumbnail_object_position || 'center'

  return (
    <Link
      href={href}
      className="sp-card sp-fade-in"
      style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="sp-card-media">
        {enrollment.course.thumbnail_url ? (
          <img
            src={enrollment.course.thumbnail_url}
            alt=""
            loading="lazy"
            style={{ objectPosition }}
          />
        ) : (
          <div className="sp-card-media-fallback">Masterclass</div>
        )}
      </div>
      <div className="sp-card-body">
        <h3 className="sp-card-title">
          {enrollment.course.title || 'Untitled course'}
        </h3>
        <div className="sp-card-meta">
          {completed ? (
            <>
              <span className="sp-check" aria-hidden>
                <CheckIcon />
              </span>
              <span>
                {completedLabel ? `Completed ${completedLabel}` : 'Completed'}
              </span>
            </>
          ) : enrollment.progress.total_lessons === 0 ? (
            <span>{enrollment.course.lesson_count} lessons</span>
          ) : (
            <>
              <div
                className="sp-progress"
                aria-label={`${progressPct}% complete`}
              >
                <i style={{ width: `${progressPct}%` }} />
              </div>
              <span className="sp-progress-pct">{progressPct}%</span>
            </>
          )}
        </div>
      </div>
    </Link>
  )
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

  const { data: enrollments, isLoading: coursesLoading } =
    useCustomerCourses(customerSessionToken)

  const list = enrollments ?? []
  const inProgress = list.filter((e) => !isCompleted(e))
  const completed = list.filter(isCompleted)

  const continueList = [...inProgress]
    .sort(
      (a, b) => b.progress.completion_percent - a.progress.completion_percent,
    )
    .slice(0, 3)
  const recentCompleted = [...completed]
    .sort((a, b) => {
      const ta = a.completed_at ? Date.parse(a.completed_at) : 0
      const tb = b.completed_at ? Date.parse(b.completed_at) : 0
      return tb - ta
    })
    .slice(0, 3)

  const minutesPracticed = list.reduce((sum, e) => {
    const totalMin = Math.round((e.course.total_duration_seconds || 0) / 60)
    if (isCompleted(e)) return sum + totalMin
    return sum + Math.round(totalMin * (e.progress.completion_percent / 100))
  }, 0)

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
  const focus = continueList[0]
  const focusTitle = focus?.course.title?.split(':')[0]?.trim()

  const stats: Array<{ label: string; value: string | number }> = [
    { label: 'Masterclasses started', value: list.length },
    { label: 'Completed', value: completed.length },
    { label: 'Minutes practiced', value: minutesPracticed },
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
          {focus && focusTitle && (
            <p className="sp-page-sub">
              You&apos;re {Math.round(focus.progress.completion_percent)}% into{' '}
              <span style={{ color: 'var(--sp-ink-2)', fontWeight: 500 }}>
                {focusTitle}
              </span>{' '}
              — pick up where you left off.
            </p>
          )}
        </div>
        <Link
          href={
            focus
              ? buildHref(
                  `/${organization.slug}/portal/courses/${focus.course.id}`,
                )
              : buildHref(`/${organization.slug}/portal/courses`)
          }
          className="sp-btn"
        >
          <PlayIcon /> Continue learning
        </Link>
      </div>

      <div className="sp-stats">
        {stats.map((s) => (
          <Stat key={s.label} label={s.label} value={s.value} />
        ))}
      </div>

      {coursesLoading ? (
        <PortalLoading variant="inline" />
      ) : (
        <>
          {continueList.length > 0 && (
            <>
              <div className="sp-sec-head">
                <h2 className="sp-sec-title">Continue</h2>
                <Link
                  className="sp-link"
                  href={buildHref(`/${organization.slug}/portal/courses`)}
                >
                  All courses →
                </Link>
              </div>
              <div
                className="sp-grid sp-grid--rail"
                style={{ marginBottom: 48 }}
              >
                {continueList.map((e, i) => (
                  <SmallCard
                    key={e.enrollment_id}
                    enrollment={e}
                    href={buildHref(
                      `/${organization.slug}/portal/courses/${e.course.id}`,
                    )}
                    index={i}
                  />
                ))}
              </div>
            </>
          )}

          {recentCompleted.length > 0 && (
            <>
              <div className="sp-sec-head">
                <h2 className="sp-sec-title">Recently completed</h2>
              </div>
              <div className="sp-grid">
                {recentCompleted.map((e, i) => (
                  <SmallCard
                    key={e.enrollment_id}
                    enrollment={e}
                    href={buildHref(
                      `/${organization.slug}/portal/courses/${e.course.id}`,
                    )}
                    index={i}
                  />
                ))}
              </div>
            </>
          )}

          {list.length === 0 && (
            <div className="sp-empty">
              <div className="sp-empty-title">Your library is empty</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Courses you have access to will show up here.
              </div>
            </div>
          )}
        </>
      )}

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
