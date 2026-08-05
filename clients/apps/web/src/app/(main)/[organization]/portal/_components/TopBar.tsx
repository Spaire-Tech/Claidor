'use client'

import { schemas } from '@claidor/client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import {
  type CustomerWithProfile,
  OnboardingModal,
  SettingsModal,
} from './ProfileOnboarding'
import { usePortalTabs } from './usePortalTabs'

const initialsFor = (name: string | null | undefined, email: string) => {
  const source = (name && name.trim()) || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

const orgInitial = (name: string) => {
  const trimmed = name.trim()
  return trimmed ? trimmed[0]!.toUpperCase() : '·'
}

export const TopBar = ({
  organization,
  hidden = false,
}: {
  organization: schemas['CustomerOrganization']
  /** Hide-on-scroll state, owned by PortalShell so sticky sub-navigation
   *  can coordinate with the bar via a root class. */
  hidden?: boolean
}) => {
  const pathname = usePathname()

  // Tab building, permission gating, and href threading are shared with the
  // mobile bottom tab bar via usePortalTabs.
  const { tabs, buildHref, token, authenticatedUser, customer } =
    usePortalTabs(organization)
  const desktopTabs = tabs.filter((t) => t.desktop)
  const overviewHref = buildHref(`/${organization.slug}/portal/overview`)

  return (
    <header className={'sp-topbar' + (hidden ? ' sp-topbar--hidden' : '')}>
      <div className="sp-topbar-inner">
        <Link
          href={overviewHref}
          className="sp-brand"
          aria-label={organization.name}
        >
          <span className="sp-brand-mark" aria-hidden>
            {organization.avatar_url ? (
              <img src={organization.avatar_url} alt="" />
            ) : (
              orgInitial(organization.name)
            )}
          </span>
          <span>{organization.name}</span>
        </Link>
        <nav className="sp-tabs" aria-label="Student portal sections">
          {desktopTabs.map((t) => (
            <Link
              key={t.href}
              href={buildHref(t.href)}
              className={'sp-tab' + (t.matches(pathname) ? ' is-active' : '')}
              prefetch
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="sp-right">
          <AccountAvatar
            authenticatedUser={authenticatedUser}
            customer={customer}
            organization={organization}
            token={token}
          />
        </div>
      </div>
    </header>
  )
}

// Top-right account chip. Acts as a button that opens a dropdown with
// Settings + Log out. Also gatekeeps the first-sign-in onboarding
// modal — when the customer hasn't picked a display name yet, we
// pop the modal automatically (per session).
function AccountAvatar({
  authenticatedUser,
  customer,
  organization,
  token,
}: {
  authenticatedUser: schemas['PortalAuthenticatedUser'] | undefined
  customer: schemas['CustomerPortalCustomer'] | undefined
  organization: schemas['CustomerOrganization']
  token: string | null
}) {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [onboardingOpen, setOnboardingOpen] = React.useState(false)
  const onboardingShownRef = React.useRef(false)

  // Cast the customer to include `avatar_url` — the field is server-side
  // already but `pnpm generate` hasn't republished the OpenAPI schema
  // yet, so the typed shape doesn't carry it.
  const customerProfile = customer as
    | (typeof customer & CustomerWithProfile)
    | undefined

  const isPreviewCustomer = !!(
    customer?.email && customer.email.endsWith('@course-preview.invalid')
  )

  // First-sign-in trigger. Real customers without a name picked land
  // on the onboarding modal once per portal session. Preview
  // customers skip it — they're really the admin and we already
  // surface their identity elsewhere.
  React.useEffect(() => {
    if (!customer || isPreviewCustomer) return
    if (onboardingShownRef.current) return
    if (typeof window === 'undefined') return
    const key = `portal_onboarding_dismissed_${customer.id ?? 'self'}`
    if (sessionStorage.getItem(key) === '1') return
    if (!customer.name || customer.name.trim().length === 0) {
      setOnboardingOpen(true)
      onboardingShownRef.current = true
    }
  }, [customer, isPreviewCustomer])

  // Resolved avatar — customer's own → preview-customer org logo
  // fallback. Initials otherwise.
  const customerAvatar = customerProfile?.avatar_url ?? null
  const avatarUrl =
    customerAvatar ?? (isPreviewCustomer ? organization.avatar_url : null)

  const displayName =
    customer?.name ?? authenticatedUser?.name ?? authenticatedUser?.email ?? ''
  const title = displayName || organization.name

  const closeMenuOnAction = (run: () => void) => {
    setMenuOpen(false)
    run()
  }

  const onLogOut = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(
          `portal_onboarding_dismissed_${customer?.id ?? 'self'}`,
        )
      } catch {
        // ignore
      }
    }
    router.push(`/${organization.slug}/portal/request`)
  }

  const onDismissOnboarding = () => {
    if (typeof window !== 'undefined' && customer) {
      try {
        sessionStorage.setItem(
          `portal_onboarding_dismissed_${customer.id ?? 'self'}`,
          '1',
        )
      } catch {
        // ignore
      }
    }
    setOnboardingOpen(false)
  }

  return (
    <>
      <div className="sp-account">
        <button
          type="button"
          className={
            'sp-avatar' +
            (avatarUrl ? ' sp-avatar--image' : '') +
            ' sp-avatar--btn'
          }
          title={title}
          aria-label="Account menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" />
          ) : authenticatedUser ? (
            initialsFor(
              customer?.name ?? authenticatedUser.name,
              authenticatedUser.email,
            )
          ) : (
            '·'
          )}
        </button>
        {menuOpen && (
          <div
            className="sp-account-menu"
            role="menu"
            onMouseLeave={() => setMenuOpen(false)}
          >
            <div className="sp-account-menu-head">
              <div className="sp-account-menu-name">
                {displayName || 'Member'}
              </div>
              {customer?.email && !isPreviewCustomer && (
                <div className="sp-account-menu-email">{customer.email}</div>
              )}
            </div>
            <button
              type="button"
              role="menuitem"
              className="sp-account-menu-item"
              onClick={() => closeMenuOnAction(() => setSettingsOpen(true))}
            >
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              className="sp-account-menu-item sp-account-menu-item--danger"
              onClick={() => closeMenuOnAction(onLogOut)}
            >
              Log out
            </button>
          </div>
        )}
      </div>

      {customerProfile && (
        <OnboardingModal
          customer={customerProfile}
          token={token}
          open={onboardingOpen}
          onClose={onDismissOnboarding}
        />
      )}
      {customerProfile && (
        <SettingsModal
          customer={customerProfile}
          token={token}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  )
}
