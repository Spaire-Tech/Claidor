'use client'

import { useCustomerCustomerMeters, useCustomerWallets } from '@/hooks/queries'
import { Client, schemas } from '@spaire/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { usePortalTheme } from '../usePortalTheme'
import { BookmarkIcon } from './icons'
import { PortalSheet } from './PortalSheet'
import { type CustomerWithProfile, SettingsModal } from './ProfileOnboarding'

// Mobile "You" hub — everything the desktop top bar keeps behind the avatar
// dropdown and right-side icons (profile settings, log out, bookmarks, theme)
// plus the destinations that don't fit the bottom tab bar (Enrollments, Team,
// Usage, Wallet). Gating mirrors the desktop TopBar and the Overview page's
// Manage section so we never link to a feature the customer can't use.
export const ProfileHubSheet = ({
  organization,
  open,
  onClose,
  api,
  token,
  authenticatedUser,
  customer,
  canAccessBilling,
  showTeam,
  buildHref,
}: {
  organization: schemas['CustomerOrganization']
  open: boolean
  onClose: () => void
  api: Client
  token: string | null
  authenticatedUser: schemas['PortalAuthenticatedUser'] | undefined
  customer: schemas['CustomerPortalCustomer'] | undefined
  canAccessBilling: boolean
  showTeam: boolean
  buildHref: (href: string) => string
}) => {
  const router = useRouter()
  const { dark } = usePortalTheme(organization.slug, token ?? '')
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  const { data: metersData } = useCustomerCustomerMeters(api)
  const { data: walletsData } = useCustomerWallets(api)
  const showUsage = (metersData?.items.length ?? 0) > 0
  const showWallet = canAccessBilling && (walletsData?.items.length ?? 0) > 0

  // Cast the customer to include `avatar_url` — the field is server-side
  // already but the published OpenAPI schema doesn't carry it yet (same
  // workaround as the desktop AccountAvatar).
  const customerProfile = customer as
    | (typeof customer & CustomerWithProfile)
    | undefined
  const isPreviewCustomer = !!(
    customer?.email && customer.email.endsWith('@course-preview.invalid')
  )
  const avatarUrl =
    customerProfile?.avatar_url ??
    (isPreviewCustomer ? organization.avatar_url : null)
  const displayName =
    customer?.name ?? authenticatedUser?.name ?? authenticatedUser?.email ?? ''

  const slug = organization.slug

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
    onClose()
    router.push(`/${slug}/portal/request`)
  }

  const navItem = (
    href: string,
    label: string,
    icon: React.ReactNode,
  ): React.ReactNode => (
    <Link
      key={href}
      href={buildHref(href)}
      className="sp-hub-item"
      onClick={onClose}
    >
      <span className="sp-hub-icon" aria-hidden>
        {icon}
      </span>
      {label}
      <span className="sp-hub-spacer" />
      <ChevronIcon />
    </Link>
  )

  return (
    <>
      <PortalSheet
        open={open}
        onClose={onClose}
        dark={dark}
        ariaLabel="Account"
      >
        <div className="sp-hub-head">
          <span
            className={'sp-avatar' + (avatarUrl ? ' sp-avatar--image' : '')}
            style={{
              display: 'grid',
              width: 44,
              height: 44,
              fontSize: 15,
              marginLeft: 0,
            }}
            aria-hidden
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" />
            ) : (
              initialsFor(displayName, authenticatedUser?.email ?? '')
            )}
          </span>
          <div>
            <div className="sp-hub-name">{displayName || 'Member'}</div>
            {customer?.email && !isPreviewCustomer && (
              <div className="sp-hub-email">{customer.email}</div>
            )}
          </div>
        </div>
        <div className="sp-hub-sep" role="separator" />
        {canAccessBilling &&
          navItem(`/${slug}/portal/orders`, 'Enrollments', <BagGlyph />)}
        {showTeam && navItem(`/${slug}/portal/team`, 'Team', <TeamGlyph />)}
        {showUsage && navItem(`/${slug}/portal/usage`, 'Usage', <MeterGlyph />)}
        {showWallet &&
          navItem(`/${slug}/portal/wallet`, 'Wallet', <WalletGlyph />)}
        {navItem(`/${slug}/portal/bookmarks`, 'Bookmarks', <BookmarkIcon />)}
        <div className="sp-hub-sep" role="separator" />
        {customerProfile && (
          <button
            type="button"
            className="sp-hub-item"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="sp-hub-icon" aria-hidden>
              <GearGlyph />
            </span>
            Profile settings
            <span className="sp-hub-spacer" />
            <ChevronIcon />
          </button>
        )}
        <div className="sp-hub-sep" role="separator" />
        <button
          type="button"
          className="sp-hub-item sp-hub-item--danger"
          onClick={onLogOut}
        >
          <span className="sp-hub-icon" aria-hidden>
            <LogOutGlyph />
          </span>
          Log out
        </button>
      </PortalSheet>

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

const initialsFor = (name: string | null | undefined, email: string) => {
  const source = (name && name.trim()) || email
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '·'
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

const glyphProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const ChevronIcon = () => (
  <svg {...glyphProps} width={16} height={16} aria-hidden>
    <path d="m9 6 6 6-6 6" />
  </svg>
)
const BagGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <path d="M5 8h14l-1 12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 8Z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)
const TeamGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.4a3.2 3.2 0 0 1 0 5.2M17.8 14.6a5.5 5.5 0 0 1 2.7 5.4" />
  </svg>
)
const MeterGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <path d="M4 19a8.5 8.5 0 1 1 16 0" />
    <path d="M12 15l3.5-4.5" />
  </svg>
)
const WalletGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <rect x="3" y="6" width="18" height="13" rx="2.5" />
    <path d="M16 12.5h5" />
  </svg>
)
const GearGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.03Z" />
  </svg>
)
const LogOutGlyph = () => (
  <svg {...glyphProps} aria-hidden>
    <path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </svg>
)
