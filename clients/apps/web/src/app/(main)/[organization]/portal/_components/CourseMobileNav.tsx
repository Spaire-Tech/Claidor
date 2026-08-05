'use client'

// Mobile-only chrome for the COURSE portal page (≤720px). The bottom tab bar
// and standard top bar step aside there so the page reads like a streaming
// app, not a course platform: a single hamburger button floats over the hero
// (the bar itself is transparent and pinned). Everything else lives inside
// the sheet it opens — the creator name as the sheet title, the portal
// destinations (the tabs the bottom bar used to carry, plus Bookmarks), and
// an account row that opens the existing "You" profile hub (settings,
// enrollments, log out…).

import { schemas } from '@spaire/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { usePortalTheme } from '../usePortalTheme'
import { PortalSheet } from './PortalSheet'
import { ProfileHubSheet } from './ProfileHubSheet'
import { type CustomerWithProfile } from './ProfileOnboarding'
import { usePortalTabs } from './usePortalTabs'

const initialsFor = (name: string | null | undefined, email: string) => {
  const source = (name && name.trim()) || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

export const CourseMobileNav = ({
  organization,
}: {
  organization: schemas['CustomerOrganization']
}) => {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [hubOpen, setHubOpen] = React.useState(false)

  const {
    tabs,
    buildHref,
    token,
    api,
    authenticatedUser,
    customer,
    canAccessBilling,
    showTeam,
  } = usePortalTabs(organization)
  const { dark } = usePortalTheme(organization.slug, token ?? '')

  // Same avatar resolution as the bottom tab bar's You chip.
  const customerProfile = customer as
    | (typeof customer & CustomerWithProfile)
    | undefined
  const isPreviewCustomer = !!(
    customer?.email && customer.email.endsWith('@course-preview.invalid')
  )
  const avatarUrl =
    customerProfile?.avatar_url ??
    (isPreviewCustomer ? organization.avatar_url : null)
  const studentInitials = customer
    ? initialsFor(customerProfile?.name ?? customer.name, customer.email ?? '')
    : '·'

  // Same split as the bottom tab bar: only the mobile tabs live here.
  // Everything else (Enrollments, Team, Bookmarks, Settings, Log out) is in
  // the profile hub the account row opens — no destination twice.
  const menuItems = tabs.filter((t) => t.mobile)

  return (
    <>
      <header className="sp-cnav">
        <button
          type="button"
          className="sp-cnav-btn"
          aria-label="Menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </header>

      <PortalSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={organization.name}
        dark={dark}
      >
        <nav className="sp-cnav-menu" aria-label="Student portal sections">
          {menuItems.map((t) => {
            const active = t.matches(pathname)
            return (
              <Link
                key={t.href}
                href={buildHref(t.href)}
                className={'sp-cnav-item' + (active ? ' is-active' : '')}
                aria-current={active ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
                prefetch
              >
                {t.label}
              </Link>
            )
          })}
          <button
            type="button"
            className="sp-cnav-item sp-cnav-account"
            onClick={() => {
              setMenuOpen(false)
              setHubOpen(true)
            }}
          >
            <span className="sp-cnav-avatar" aria-hidden>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt="" />
              ) : (
                <span>{studentInitials}</span>
              )}
            </span>
            <span className="sp-cnav-account-info">
              <span className="sp-cnav-account-name">
                {customerProfile?.name ?? customer?.name ?? 'Account'}
              </span>
              <span className="sp-cnav-account-sub">
                Settings, enrollments &amp; more
              </span>
            </span>
          </button>
        </nav>
      </PortalSheet>

      <ProfileHubSheet
        organization={organization}
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        api={api}
        token={token}
        authenticatedUser={authenticatedUser}
        customer={customer}
        canAccessBilling={canAccessBilling}
        showTeam={showTeam}
        buildHref={buildHref}
      />
    </>
  )
}
