'use client'

import {
  type CustomerNotificationRead,
  useCustomerNotificationUnreadCount,
  useCustomerNotifications,
  useMarkAllCustomerNotificationsRead,
  useMarkCustomerNotificationRead,
} from '@/hooks/queries/community'
import { useCustomerSSE } from '@/hooks/sse'
import { schemas } from '@spaire/client'
import { useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import * as React from 'react'
import { usePortalTheme } from '../usePortalTheme'
import { BellIcon, BookmarkIcon } from './icons'
import { PortalSheet } from './PortalSheet'
import {
  type CustomerWithProfile,
  OnboardingModal,
  SettingsModal,
} from './ProfileOnboarding'
import { useMediaMax } from './useMediaMax'
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
  /** Hide-on-scroll state, owned by PortalShell so the community hub's
   *  sticky tab bar can coordinate with the bar via a root class. */
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
          <NotificationsBell slug={organization.slug} token={token} />
          <Link
            href={buildHref(`/${organization.slug}/portal/bookmarks`)}
            className={
              'sp-iconbtn' +
              (pathname.includes('/portal/bookmarks') ? ' is-active' : '')
            }
            aria-label="Bookmarks"
            title="Bookmarks"
          >
            <BookmarkIcon />
          </Link>
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
  // surface their identity from the course's instructor_name.
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

// ---------------------------------------------------------------------
// Notifications bell — dropdown over the existing bell icon on desktop,
// a bottom sheet at the mobile breakpoint. Only the red dot is
// conditional; the icon button stays put when there's no token
// (preview/anonymous viewer) but opening is then disabled.
// ---------------------------------------------------------------------

function NotificationsBell({
  slug,
  token,
}: {
  slug: string
  token: string | null
}) {
  const [open, setOpen] = React.useState(false)
  const isMobile = useMediaMax(720)
  const { dark } = usePortalTheme(slug, token ?? '')
  const unreadQ = useCustomerNotificationUnreadCount(token)
  const listQ = useCustomerNotifications(open ? token : null)
  const markRead = useMarkCustomerNotificationRead(token)
  const markAllRead = useMarkAllCustomerNotificationsRead(token)

  // Live updates: subscribe to the customer SSE channel and invalidate
  // the unread count + list the moment the server publishes a new
  // notification. The 60s polling fallback in the query stays as a
  // safety net for dropped SSE connections.
  const queryClient = useQueryClient()
  const sse = useCustomerSSE(token ?? undefined)
  React.useEffect(() => {
    if (!token) return
    const onCreated = () => {
      queryClient.invalidateQueries({
        queryKey: ['customer-notifications-unread', token],
      })
      queryClient.invalidateQueries({
        queryKey: ['customer-notifications', token],
      })
    }
    sse.on('customer_notification.created', onCreated)
    return () => {
      sse.off('customer_notification.created', onCreated)
    }
  }, [sse, token, queryClient])

  const unread = unreadQ.data?.unread ?? 0
  const list = listQ.data ?? []

  // If a mark-read mutation fails, re-sync from the server so the unread count
  // and list reflect reality instead of a stale (optimistic) state.
  const resyncNotifications = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['customer-notifications-unread', token],
    })
    queryClient.invalidateQueries({
      queryKey: ['customer-notifications', token],
    })
  }, [queryClient, token])

  const markAllReadButton =
    unread > 0 ? (
      <button
        type="button"
        className="sp-account-menu-item"
        style={{ padding: '4px 8px', fontSize: 12, width: 'auto' }}
        onClick={() =>
          markAllRead.mutate(undefined, {
            onError: resyncNotifications,
          })
        }
      >
        Mark all read
      </button>
    ) : null

  const listContent = listQ.isLoading ? (
    <div
      style={{
        padding: 16,
        color: 'var(--sp-muted)',
        fontSize: 13,
      }}
    >
      Loading…
    </div>
  ) : list.length === 0 ? (
    <div
      style={{
        padding: 16,
        color: 'var(--sp-muted)',
        fontSize: 13,
      }}
    >
      You&apos;re all caught up.
    </div>
  ) : (
    list.map((n) => (
      <NotificationRow
        key={n.id}
        notif={n}
        onMarkRead={() =>
          markRead.mutate(n.id, { onError: resyncNotifications })
        }
      />
    ))
  )

  return (
    <div className="sp-account" style={{ position: 'relative' }}>
      <button
        type="button"
        className="sp-iconbtn"
        aria-label="Notifications"
        title="Notifications"
        aria-haspopup={isMobile ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={!token}
      >
        <BellIcon />
        {unread > 0 && <span className="sp-dot" aria-hidden />}
      </button>
      {isMobile ? (
        <PortalSheet
          open={open}
          onClose={() => setOpen(false)}
          title="Notifications"
          dark={dark}
          headerAction={markAllReadButton}
        >
          {listContent}
        </PortalSheet>
      ) : (
        open && (
          <div
            className="sp-account-menu"
            role="menu"
            style={{
              width: 'min(360px, calc(100vw - 32px))',
              maxHeight: 480,
              overflow: 'auto',
            }}
            onMouseLeave={() => setOpen(false)}
          >
            <div
              className="sp-account-menu-head"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div className="sp-account-menu-name">Notifications</div>
              {markAllReadButton}
            </div>
            {listContent}
          </div>
        )
      )}
    </div>
  )
}

function NotificationRow({
  notif,
  onMarkRead,
}: {
  notif: CustomerNotificationRead
  onMarkRead: () => void
}) {
  const title = String(
    (notif.payload as Record<string, unknown>).title ?? 'Community update',
  )
  const courseName = String(
    (notif.payload as Record<string, unknown>).course_name ?? '',
  )
  const subtitle = typeForCopy(notif.type, courseName)
  const unread = notif.read_at === null
  return (
    <button
      type="button"
      role="menuitem"
      className="sp-account-menu-item"
      onClick={onMarkRead}
      style={{
        display: 'block',
        textAlign: 'left',
        width: '100%',
        padding: '10px 12px',
        background: unread ? 'var(--sp-surface-2)' : 'transparent',
      }}
    >
      <div style={{ fontWeight: unread ? 600 : 400, fontSize: 13 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--sp-muted)' }}>{subtitle}</div>
    </button>
  )
}

function typeForCopy(t: string, course: string) {
  switch (t) {
    case 'community.event.published':
      return course ? `New event in ${course}` : 'New event scheduled'
    case 'community.event.starting_soon_24h':
      return 'Starts tomorrow'
    case 'community.event.starting_soon_15m':
      return 'Starts in 15 minutes'
    case 'community.event.live':
      return 'Live now'
    case 'community.event.replay_nag_t2h':
    case 'community.event.replay_nag_t24h':
      return 'Add a replay?'
    default:
      return ''
  }
}
