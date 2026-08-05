'use client'

import { schemas } from '@claidor/client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { MobileTabBar } from './_components/MobileTabBar'
import { PortalLoading } from './_components/PortalLoading'
import { TopBar } from './_components/TopBar'
import { useHideOnScroll } from './_components/useHideOnScroll'
import { usePortalTabs } from './_components/usePortalTabs'
import './portal.css'
import { usePortalTheme } from './usePortalTheme'

const isAuthRoute = (pathname: string): boolean => {
  return (
    pathname.endsWith('/portal/request') ||
    pathname.endsWith('/portal/authenticate') ||
    pathname.endsWith('/portal/claim')
  )
}

export const PortalShell = ({
  organization,
  children,
}: {
  organization: schemas['CustomerOrganization']
  children: React.ReactNode
}) => {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const token =
    searchParams.get('customer_session_token') ??
    searchParams.get('member_session_token') ??
    ''
  const { dark } = usePortalTheme(organization.slug, token)
  // Hold the whole portal behind the boot loader until the tab-gating
  // queries settle — otherwise Overview renders first and the gated tabs
  // (Enrollments / Billing) pop in afterwards.
  const { ready } = usePortalTabs(organization)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Hide-on-scroll lives here (not inside TopBar) so the root can carry the
  // state as a class — sticky sub-bars read it to pin at the very top while
  // the bar is hidden instead of floating 56px down.
  const topbarHidden = useHideOnScroll()
  const rootClass = `claidor-portal sp-app sp-app--mobile-tabs${
    dark ? ' sp-dark' : ''
  }${topbarHidden ? ' sp-app--topbar-hidden' : ''}`
  const auth = isAuthRoute(pathname)

  // Paint every ancestor (and the browser canvas) the theme colour. The
  // (main) layout wraps the portal in a bg-white div; without this the
  // short pages (Downloads / Orders) leaked white below the content and
  // the overscroll flashed white.
  useEffect(() => {
    if (auth) return
    const bg = dark ? '#141416' : '#f5f5f7'
    const touched: { el: HTMLElement; prev: string }[] = []
    let node: HTMLElement | null = rootRef.current?.parentElement ?? null
    while (node && node !== document.body) {
      touched.push({ el: node, prev: node.style.backgroundColor })
      node.style.backgroundColor = bg
      node = node.parentElement
    }
    const root = document.documentElement
    const body = document.body
    const prevRoot = root.style.backgroundColor
    const prevBody = body.style.backgroundColor
    root.style.backgroundColor = bg
    body.style.backgroundColor = bg
    return () => {
      for (const { el, prev } of touched) el.style.backgroundColor = prev
      root.style.backgroundColor = prevRoot
      body.style.backgroundColor = prevBody
    }
  }, [dark, auth])

  if (auth) {
    // Sign-in / claim screens render full-bleed without the portal nav. Their
    // light/dark is the creator's design choice, NOT a customer toggle — so
    // it follows the org setting here, not usePortalTheme.
    const signInDark = organization.customer_portal_sign_in_theme === 'dark'
    return (
      <div className={`claidor-portal sp-app ${signInDark ? 'sp-dark' : ''}`}>
        {children}
      </div>
    )
  }

  // Boot: black screen + gradient ring until the nav is fully resolved, so
  // the portal appears in one piece instead of assembling itself.
  if (!ready) {
    return (
      <div ref={rootRef} className={rootClass}>
        <PortalLoading />
      </div>
    )
  }

  return (
    <div ref={rootRef} className={rootClass}>
      <TopBar organization={organization} hidden={topbarHidden} />
      <main className="sp-page">{children}</main>
      <MobileTabBar organization={organization} />
    </div>
  )
}
