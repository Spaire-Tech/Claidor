import { nanoid } from 'nanoid'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

const POLAR_AUTH_COOKIE_KEY =
  process.env.POLAR_AUTH_COOKIE_KEY || 'spaire_session'
// Legacy cookie name fallback - the backend may still set 'polar_session'
// if it hasn't been redeployed with the rebrand changes yet
const LEGACY_AUTH_COOKIE_KEY = 'polar_session'

const DISTINCT_ID_COOKIE = 'spaire_distinct_id'
const DISTINCT_ID_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

const AUTHENTICATED_ROUTES = [
  new RegExp('^/start(/.*)?'),
  new RegExp('^/dashboard(/.*)?'),
  new RegExp('^/finance(/.*)?'),
  new RegExp('^/settings(/.*)?'),
  new RegExp('^/oauth2(/.*)?'),
]

const getOrCreateDistinctId = (
  request: NextRequest,
): { id: string; isNew: boolean } => {
  const existing = request.cookies.get(DISTINCT_ID_COOKIE)?.value
  if (existing) {
    return { id: existing, isNew: false }
  }
  return { id: `anon_${nanoid()}`, isNew: true }
}

const isForwardedRoute = (request: NextRequest): boolean => {
  if (request.nextUrl.pathname.startsWith('/docs/')) {
    return true
  }

  if (request.nextUrl.pathname.startsWith('/mintlify-assets/')) {
    return true
  }

  if (request.nextUrl.pathname.startsWith('/_mintlify/')) {
    return true
  }

  if (request.nextUrl.pathname.startsWith('/ingest/')) {
    return true
  }

  return false
}

const requiresAuthentication = (request: NextRequest): boolean => {
  if (isForwardedRoute(request)) {
    return false
  }

  return AUTHENTICATED_ROUTES.some((route) =>
    route.test(request.nextUrl.pathname),
  )
}

const getLoginResponse = (request: NextRequest): NextResponse => {
  const redirectURL = request.nextUrl.clone()
  redirectURL.pathname = '/login'
  redirectURL.search = ''
  const returnTo = `${request.nextUrl.pathname}${request.nextUrl.search}`
  redirectURL.searchParams.set('return_to', returnTo)
  return NextResponse.redirect(redirectURL)
}

const SPACE_HOSTNAME = process.env.NEXT_PUBLIC_SPACE_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SPACE_BASE_URL).hostname
  : 'space.spairehq.com'

const FRONTEND_HOSTNAME = process.env.NEXT_PUBLIC_FRONTEND_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_FRONTEND_BASE_URL).hostname
  : '127.0.0.1'

const SPACE_BLOCKED_PREFIXES = [
  '/dashboard',
  '/login',
  '/signup',
  '/settings',
  '/start',
  '/checkout',
  '/oauth2',
  '/docs',
  '/blog',
]

// Hostnames served with the regular (slug-path) routing. Anything else is
// treated as a candidate creator custom domain (learn.creator.com).
const isPlatformHostname = (hostname: string): boolean =>
  hostname === '' ||
  hostname === FRONTEND_HOSTNAME ||
  hostname === SPACE_HOSTNAME ||
  hostname === 'localhost' ||
  hostname === '127.0.0.1' ||
  hostname.endsWith('.vercel.app') // preview deployments

// Host → organization slug cache (per edge/server instance). Hits are kept
// longer than misses so a creator finishing DNS setup isn't stuck behind a
// stale negative entry.
const CUSTOM_DOMAIN_HIT_TTL_MS = 5 * 60 * 1000
const CUSTOM_DOMAIN_MISS_TTL_MS = 30 * 1000
const customDomainCache = new Map<
  string,
  { slug: string | null; expiresAt: number }
>()

const resolveCustomDomainSlug = async (
  hostname: string,
): Promise<string | null> => {
  const cached = customDomainCache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.slug
  }

  const apiUrl =
    process.env.POLAR_API_URL || process.env.NEXT_PUBLIC_API_URL || ''
  if (!apiUrl) {
    console.error(
      '[proxy] Custom domain lookup skipped: POLAR_API_URL and NEXT_PUBLIC_API_URL are both unset',
    )
    return null
  }

  try {
    const response = await fetch(
      `${apiUrl}/v1/storefronts/lookup/domain/${encodeURIComponent(hostname)}`,
      { method: 'GET', cache: 'no-cache' },
    )
    if (response.ok) {
      const { organization_slug: slug } = (await response.json()) as {
        organization_slug: string
      }
      customDomainCache.set(hostname, {
        slug,
        expiresAt: Date.now() + CUSTOM_DOMAIN_HIT_TTL_MS,
      })
      return slug
    }
    if (response.status === 404) {
      customDomainCache.set(hostname, {
        slug: null,
        expiresAt: Date.now() + CUSTOM_DOMAIN_MISS_TTL_MS,
      })
      return null
    }
    console.error(
      `[proxy] Custom domain lookup for ${hostname} returned ${response.status}`,
    )
  } catch (error) {
    console.error(
      `[proxy] Custom domain lookup for ${hostname} failed: ${error}`,
    )
  }
  // Transient failure: serve the stale cache entry if we have one rather
  // than bouncing a live storefront to the main app.
  return cached ? cached.slug : null
}

const handleCustomDomain = async (
  request: NextRequest,
  hostname: string,
): Promise<NextResponse> => {
  const { pathname } = request.nextUrl

  // Analytics/docs proxying works the same on any host.
  if (isForwardedRoute(request)) {
    return NextResponse.next()
  }

  // Never serve dashboard/auth/checkout surfaces on a creator domain — the
  // session cookie must stay on the platform hosts.
  if (SPACE_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const mainUrl = new URL(
      `${pathname}${request.nextUrl.search}`,
      process.env.NEXT_PUBLIC_FRONTEND_BASE_URL || 'https://app.spairehq.com',
    )
    return NextResponse.redirect(mainUrl)
  }

  const slug = await resolveCustomDomainSlug(hostname)
  if (!slug) {
    // Unknown or not-yet-verified domain: send visitors to the main app.
    return NextResponse.redirect(
      new URL(
        process.env.NEXT_PUBLIC_FRONTEND_BASE_URL || 'https://app.spairehq.com',
      ),
    )
  }

  // Canonical hygiene: the slug never appears in custom-domain URLs. A
  // slug-prefixed path (from an old shared link) permanently redirects to
  // its slug-less form on this host.
  if (pathname === `/${slug}` || pathname.startsWith(`/${slug}/`)) {
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = pathname.slice(slug.length + 1) || '/'
    return NextResponse.redirect(redirectURL, { status: 308 })
  }

  // Serve the org's pages at slug-less paths: rewrite / → /{slug},
  // /portal/... → /{slug}/portal/... — the app tree stays unchanged.
  const rewriteURL = request.nextUrl.clone()
  rewriteURL.pathname = `/${slug}${pathname === '/' ? '' : pathname}`

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-spaire-storefront-host', hostname)
  requestHeaders.set('x-spaire-pathname', pathname)

  const { id: distinctId, isNew: isNewDistinctId } =
    getOrCreateDistinctId(request)
  requestHeaders.set('x-spaire-distinct-id', distinctId)

  const response = NextResponse.rewrite(rewriteURL, {
    request: { headers: requestHeaders },
  })
  if (isNewDistinctId) {
    response.cookies.set(DISTINCT_ID_COOKIE, distinctId, {
      maxAge: DISTINCT_ID_COOKIE_MAX_AGE,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  }
  return response
}

export async function proxy(request: NextRequest) {
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? ''
  const hostname = host.split(':')[0]

  // --- Creator custom domain routing (learn.creator.com) ---
  if (!isPlatformHostname(hostname)) {
    return handleCustomDomain(request, hostname)
  }

  // --- Spaire Space subdomain routing ---
  if (hostname === SPACE_HOSTNAME) {
    const { pathname } = request.nextUrl

    // Block non-storefront routes on the space domain — redirect to main app
    if (SPACE_BLOCKED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      const mainUrl = new URL(
        pathname,
        process.env.NEXT_PUBLIC_FRONTEND_BASE_URL || 'https://app.spairehq.com',
      )
      return NextResponse.redirect(mainUrl)
    }
  }

  // Do not run middleware for forwarded routes
  // @pieterbeulque added this because the `config.matcher` behavior below
  // doesn't appear to be working consistently with Vercel rewrites
  if (isForwardedRoute(request)) {
    return NextResponse.next()
  }

  // Redirect old customer query string URLs to path-based URLs
  const customersMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/customers$/,
  )
  if (customersMatch && request.nextUrl.searchParams.has('customerId')) {
    const customerId = request.nextUrl.searchParams.get('customerId')
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${customersMatch[1]}/customers/${customerId}`
    redirectURL.searchParams.delete('customerId')
    return NextResponse.redirect(redirectURL)
  }

  // Redirect old benefit query string URLs to path-based URLs
  const benefitsMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/benefits$/,
  )
  if (benefitsMatch && request.nextUrl.searchParams.has('benefitId')) {
    const benefitId = request.nextUrl.searchParams.get('benefitId')
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${benefitsMatch[1]}/products/benefits/${benefitId}`
    redirectURL.searchParams.delete('benefitId')
    return NextResponse.redirect(redirectURL)
  }

  // Redirect old checkout link query string URLs to path-based URLs
  const checkoutLinksMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/products\/checkout-links$/,
  )
  if (
    checkoutLinksMatch &&
    request.nextUrl.searchParams.has('checkoutLinkId')
  ) {
    const checkoutLinkId = request.nextUrl.searchParams.get('checkoutLinkId')
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${checkoutLinksMatch[1]}/products/checkout-links/${checkoutLinkId}`
    redirectURL.searchParams.delete('checkoutLinkId')
    return NextResponse.redirect(redirectURL)
  }

  // Redirect old meter query string URLs to path-based URLs
  const metersMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/usage-billing\/meters$/,
  )
  if (metersMatch && request.nextUrl.searchParams.has('selectedMeter')) {
    const selectedMeter = request.nextUrl.searchParams.get('selectedMeter')
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${metersMatch[1]}/products/meters/${selectedMeter}`
    redirectURL.searchParams.delete('selectedMeter')
    return NextResponse.redirect(redirectURL)
  }

  // Redirect deprecated path-based URLs to new structure
  // Events: /dashboard/{org}/usage-billing/events/* -> /dashboard/{org}/analytics/events/*
  const eventsPathMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/usage-billing\/events(\/.*)?$/,
  )
  if (eventsPathMatch) {
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${eventsPathMatch[1]}/analytics/events${eventsPathMatch[2] || ''}`
    return NextResponse.redirect(redirectURL, { status: 308 })
  }

  // Benefits: /dashboard/{org}/benefits/* -> /dashboard/{org}/products/benefits/*
  const benefitsPathMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/benefits(\/.*)?$/,
  )
  if (benefitsPathMatch) {
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${benefitsPathMatch[1]}/products/benefits${benefitsPathMatch[2] || ''}`
    return NextResponse.redirect(redirectURL, { status: 308 })
  }

  // Meters: /dashboard/{org}/usage-billing/meters/* -> /dashboard/{org}/products/meters/*
  const metersPathMatch = request.nextUrl.pathname.match(
    /^\/dashboard\/([^/]+)\/usage-billing\/meters(\/.*)?$/,
  )
  if (metersPathMatch) {
    const redirectURL = request.nextUrl.clone()
    redirectURL.pathname = `/dashboard/${metersPathMatch[1]}/products/meters${metersPathMatch[2] || ''}`
    return NextResponse.redirect(redirectURL, { status: 308 })
  }

  let user: Record<string, unknown> | undefined = undefined

  // Resolve API URL at request time (not module load time) to ensure
  // runtime env vars are available in Edge Runtime
  const apiUrl =
    process.env.POLAR_API_URL || process.env.NEXT_PUBLIC_API_URL || ''

  const hasCookie =
    request.cookies.has(POLAR_AUTH_COOKIE_KEY) ||
    request.cookies.has(LEGACY_AUTH_COOKIE_KEY)
  if (hasCookie && apiUrl) {
    // Build Cookie header from all incoming request cookies
    const cookieHeader = request.cookies
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ')

    const fetchHeaders: Record<string, string> = {
      Cookie: cookieHeader,
    }
    const xForwardedFor = request.headers.get('X-Forwarded-For')
    if (xForwardedFor) {
      fetchHeaders['X-Forwarded-For'] = xForwardedFor
    }

    try {
      // Use direct fetch instead of openapi-fetch client to avoid
      // credentials: 'include' which can interfere with custom Cookie
      // headers in Edge Runtime environments
      const authResponse = await fetch(`${apiUrl}/v1/users/me`, {
        method: 'GET',
        headers: fetchHeaders,
        cache: 'no-cache',
      })

      if (authResponse.ok) {
        user = await authResponse.json()
      } else if (authResponse.status === 401) {
        console.error(
          `[proxy] Auth cookie '${POLAR_AUTH_COOKIE_KEY}' present but /v1/users/me returned 401. apiUrl: ${apiUrl}`,
        )
      } else {
        console.error(
          `[proxy] Unexpected response from /v1/users/me: status=${authResponse.status}, apiUrl: ${apiUrl}`,
        )
      }
    } catch (error) {
      console.error(
        `[proxy] Failed to verify user session: ${error}. apiUrl: ${apiUrl}`,
      )
      // Don't throw - gracefully degrade to unauthenticated
    }
  }

  if (requiresAuthentication(request) && !user) {
    if (!apiUrl) {
      console.error(
        '[proxy] Auth redirect: POLAR_API_URL and NEXT_PUBLIC_API_URL are both unset - cannot verify sessions',
      )
    } else if (!hasCookie) {
      console.error(
        `[proxy] Auth redirect: cookie '${POLAR_AUTH_COOKIE_KEY}' not found. Available cookies: ${
          request.cookies
            .getAll()
            .map((c) => c.name)
            .join(', ') || 'none'
        }`,
      )
    }
    return getLoginResponse(request)
  }

  const { id: distinctId, isNew: isNewDistinctId } =
    getOrCreateDistinctId(request)

  const headers: Record<string, string> = {
    'x-spaire-distinct-id': distinctId,
    // Forward the request path so server layouts can route on it. The
    // dashboard [organization]/layout.tsx uses this to skip the
    // "redirect to /onboarding/plan" gate when the request is itself
    // already an /onboarding route.
    'x-spaire-pathname': request.nextUrl.pathname,
  }
  if (user) {
    headers['x-polar-user'] = JSON.stringify(user)
  }

  const response = NextResponse.next({ headers })

  if (isNewDistinctId) {
    response.cookies.set(DISTINCT_ID_COOKIE, distinctId, {
      maxAge: DISTINCT_ID_COOKIE_MAX_AGE,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    })
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - ingest (Posthog)
     * - monitoring (Sentry)
     * - docs, _mintlify, mintlify-assets (Mintlify)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|ingest|monitoring|docs|_mintlify|mintlify-assets|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
}
