'use client'

// Mobile-only bottom tab bar. Sticks to the bottom of the viewport and shows
// the primary destinations (Overview / Courses / Community / Billing) plus a
// YouTube-style "You" tab that opens the profile hub sheet — the mobile home
// for everything the desktop top bar keeps behind the avatar dropdown
// (settings, log out, bookmarks, theme) and the tabs that don't fit here
// (Enrollments, Team). Tab building and permission gating live in
// usePortalTabs, shared with the desktop TopBar. Visible only at narrow
// widths — the CSS in portal.css hides it on desktop.

import { schemas } from '@spaire/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as React from 'react'
import { ProfileHubSheet } from './ProfileHubSheet'
import { type CustomerWithProfile } from './ProfileOnboarding'
import { useHideOnScroll } from './useHideOnScroll'
import { usePortalTabs, type PortalTabKey } from './usePortalTabs'

// Tab glyphs — line-based, fill the body when active for a soft "selected"
// state without competing with the brand's grayscale palette.
const HomeIcon = (active: boolean) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-4v-7h-8v7H4a1 1 0 0 1-1-1v-8.5Z" />
  </svg>
)
const StackIcon = (active: boolean) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect
      x="3"
      y="4"
      width="18"
      height="6"
      rx="1.5"
      fill={active ? 'currentColor' : 'none'}
    />
    <rect x="3" y="14" width="18" height="6" rx="1.5" />
  </svg>
)
const CardIcon = (active: boolean) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <rect
      x="3"
      y="6"
      width="18"
      height="13"
      rx="2"
      fill={active ? 'currentColor' : 'none'}
      fillOpacity={active ? 0.12 : 0}
    />
    <path d="M3 10h18M7 15h3" />
  </svg>
)
const ChatIcon = (active: boolean) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M21 12a8 8 0 0 1-12.7 6.5L3 20l1.5-5.3A8 8 0 1 1 21 12z" />
  </svg>
)
const PersonIcon = (active: boolean) => (
  <svg
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill={active ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
  </svg>
)

const TAB_ICONS: Record<PortalTabKey, (active: boolean) => React.ReactNode> = {
  overview: HomeIcon,
  courses: StackIcon,
  community: ChatIcon,
  orders: CardIcon, // unused in the bar (Enrollments lives in the You hub)
  team: PersonIcon, // unused in the bar (Team lives in the You hub)
  settings: CardIcon,
}

// Routes reachable only through the You hub — the You tab lights up while
// the customer is on one of them so the bar always shows where they are.
const HUB_ROUTE = /\/portal\/(orders|team|usage|wallet|bookmarks)/

export const MobileTabBar = ({
  organization,
}: {
  organization: schemas['CustomerOrganization']
}) => {
  const pathname = usePathname()
  const hidden = useHideOnScroll()
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

  const barTabs = tabs.filter((t) => t.mobile)
  const hubActive = hubOpen || HUB_ROUTE.test(pathname)

  // Same avatar resolution as the desktop chip: customer's own image →
  // preview-customer org logo fallback → initial.
  const customerProfile = customer as
    | (typeof customer & CustomerWithProfile)
    | undefined
  const isPreviewCustomer = !!(
    customer?.email && customer.email.endsWith('@course-preview.invalid')
  )
  const avatarUrl =
    customerProfile?.avatar_url ??
    (isPreviewCustomer ? organization.avatar_url : null)

  return (
    <>
      <nav
        className={
          'sp-tabbar' + (hidden && !hubOpen ? ' sp-tabbar--hidden' : '')
        }
        aria-label="Student portal sections"
        style={
          { '--sp-tabbar-cols': barTabs.length + 1 } as React.CSSProperties
        }
      >
        <div className="sp-tabbar-inner">
          {barTabs.map((t) => {
            const active = t.matches(pathname)
            return (
              <Link
                key={t.href}
                href={buildHref(t.href)}
                className={'sp-tabbar-item' + (active ? ' is-active' : '')}
                aria-current={active ? 'page' : undefined}
                prefetch
              >
                <span className="sp-tabbar-icon" aria-hidden>
                  {TAB_ICONS[t.key](active)}
                </span>
                <span className="sp-tabbar-label">{t.label}</span>
              </Link>
            )
          })}
          <button
            type="button"
            className={'sp-tabbar-item' + (hubActive ? ' is-active' : '')}
            aria-label="You — account and more"
            aria-haspopup="dialog"
            aria-expanded={hubOpen}
            onClick={() => setHubOpen((v) => !v)}
          >
            <span className="sp-tabbar-icon" aria-hidden>
              {avatarUrl ? (
                <span className="sp-tabbar-avatar">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={avatarUrl} alt="" />
                </span>
              ) : (
                PersonIcon(hubActive)
              )}
            </span>
            <span className="sp-tabbar-label">You</span>
          </button>
        </div>
      </nav>

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
