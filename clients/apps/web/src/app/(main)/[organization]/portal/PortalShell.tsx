'use client'

import { schemas } from '@spaire/client'
import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { CourseMobileNav } from './_components/CourseMobileNav'
import { MobileTabBar } from './_components/MobileTabBar'
import { PortalLoading } from './_components/PortalLoading'
import { TopBar } from './_components/TopBar'
import { useHideOnScroll } from './_components/useHideOnScroll'
import { usePortalTabs } from './_components/usePortalTabs'
import './portal.css'
import { usePortalTheme } from './usePortalTheme'

const isCourseRoute = (pathname: string): boolean => {
  return /\/portal\/courses\/[^/]+/.test(pathname)
}

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
  // queries settle — otherwise Overview/Masterclasses render first and the
  // gated tabs (Community / Enrollments / Billing) pop in afterwards.
  const { ready } = usePortalTabs(organization)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Hide-on-scroll lives here (not inside TopBar) so the root can carry the
  // state as a class — sticky sub-bars (the community hub tabs) read it to
  // pin at the very top while the bar is hidden instead of floating 56px down.
  const topbarHidden = useHideOnScroll()
  const rootClass = `spaire-portal sp-app sp-app--mobile-tabs${
    dark ? ' sp-dark' : ''
  }${topbarHidden ? ' sp-app--topbar-hidden' : ''}`
  // Only the in-lesson player is immersive (full-bleed, no portal nav). The
  // course portal page itself keeps the standard TopBar.
  const immersive = isCourseRoute(pathname) && !!searchParams.get('lesson')
  const auth = isAuthRoute(pathname)

  // Paint every ancestor (and the browser canvas) the theme colour. The
  // (main) layout wraps the portal in a bg-white div; without this the
  // short pages (Courses / Downloads / Orders) leaked white below the
  // content and the overscroll flashed white.
  useEffect(() => {
    if (immersive || auth) return
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
  }, [dark, immersive, auth])

  if (immersive) {
    return <div className="w-full">{children}</div>
  }

  if (auth) {
    // Sign-in / claim screens render full-bleed without the portal nav. Their
    // light/dark is the creator's design choice (set in the course builder's
    // Auth tab), NOT a customer toggle — so it follows the org setting here,
    // not usePortalTheme.
    const signInDark = organization.customer_portal_sign_in_theme === 'dark'
    return (
      <div className={`spaire-portal sp-app ${signInDark ? 'sp-dark' : ''}`}>
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

  // The course portal page renders its own full-bleed layout (cinematic hero
  // + module rows) and so opts out of the standard .sp-page max-width wrapper.
  if (isCourseRoute(pathname)) {
    // On phones the course page swaps the standard chrome for its own:
    // the top-left hamburger + creator-name bar (CourseMobileNav) replaces
    // both the top bar and the bottom tab bar (portal.css hides them under
    // .sp-course-route ≤720px), so the page reads like a streaming app.
    return (
      <div ref={rootRef} className={`${rootClass} sp-course-route`}>
        <TopBar organization={organization} hidden={topbarHidden} />
        <CourseMobileNav organization={organization} />
        <main className="sp-course-portal">{children}</main>
        <MobileTabBar organization={organization} />
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
