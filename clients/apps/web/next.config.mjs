/* global process */
import bundleAnalyzer from '@next/bundle-analyzer'
import createMDX from '@next/mdx'
import { withSentryConfig } from '@sentry/nextjs'
import { themeConfig } from './shiki.config.mjs'

const AUTH_COOKIE_KEY =
  process.env.SIMEON_AUTH_COOKIE_KEY ||
  process.env.POLAR_AUTH_COOKIE_KEY ||
  'simeon_session'
// Sessions made before the rename carry the earlier cookie name.
const LEGACY_AUTH_COOKIE_KEY = 'claidor_session'
const ENVIRONMENT =
  process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || 'development'
const CODESPACES = process.env.CODESPACES === 'true'

const defaultFrontendHostname = process.env.NEXT_PUBLIC_FRONTEND_BASE_URL
  ? new URL(process.env.NEXT_PUBLIC_FRONTEND_BASE_URL).hostname
  : 'app.simeonlabs.com'

const S3_PUBLIC_IMAGES_BUCKET_ORIGIN = process.env
  .S3_PUBLIC_IMAGES_BUCKET_HOSTNAME
  ? `${process.env.S3_PUBLIC_IMAGES_BUCKET_PROTOCOL || 'https'}://${process.env.S3_PUBLIC_IMAGES_BUCKET_HOSTNAME}${process.env.S3_PUBLIC_IMAGES_BUCKET_PORT ? `:${process.env.S3_PUBLIC_IMAGES_BUCKET_PORT}` : ''}`
  : ''
const baseCSP = `
    default-src 'self';
    connect-src 'self' blob: ${process.env.NEXT_PUBLIC_API_URL} ${process.env.S3_UPLOAD_ORIGINS} https://api.stripe.com https://maps.googleapis.com https://*.google-analytics.com https://chat.uk.plain.com https://prod-uk-services-attachm-attachmentsuploadbucket2-1l2e4906o2asm.s3.eu-west-2.amazonaws.com https://*.mux.com https://api.giphy.com;
    frame-src 'self' https://*.js.stripe.com https://js.stripe.com https://hooks.stripe.com https://customer-wl21dabnj6qtvcai.cloudflarestream.com videodelivery.net *.cloudflarestream.com https://buy.simeonlabs.com https://www.youtube.com https://youtube.com https://open.spotify.com https://w.soundcloud.com https://www.tiktok.com https://www.instagram.com https://player.vimeo.com https://embed.music.apple.com https://stream.mux.com;
    media-src 'self' blob: https://*.mux.com https://stream.mux.com ${S3_PUBLIC_IMAGES_BUCKET_ORIGIN} https://claidor-production-files-public.s3.amazonaws.com https://claidor-production-files-public.s3.us-east-1.amazonaws.com https://prod-uk-services-workspac-workspacefilespublicbuck-vs4gjqpqjkh6.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsbucket28b3ccf-uwfssb4vt2us.s3.eu-west-2.amazonaws.com;
    script-src 'self' blob: 'unsafe-eval' 'unsafe-inline' https://*.js.stripe.com https://js.stripe.com https://maps.googleapis.com https://www.googletagmanager.com https://chat.cdn-plain.com https://embed.cloudflarestream.com https://static.cloudflareinsights.com https://cdn.simeonlabs.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://www.gravatar.com https://img.logo.dev https://lh3.googleusercontent.com https://avatars.githubusercontent.com ${S3_PUBLIC_IMAGES_BUCKET_ORIGIN} https://claidor-production-files-public.s3.amazonaws.com https://claidor-production-files-public.s3.us-east-1.amazonaws.com https://prod-uk-services-workspac-workspacefilespublicbuck-vs4gjqpqjkh6.s3.amazonaws.com https://prod-uk-services-attachm-attachmentsbucket28b3ccf-uwfssb4vt2us.s3.eu-west-2.amazonaws.com https://i0.wp.com https://img.youtube.com https://i.ytimg.com https://yt3.ggpht.com https://yt3.googleusercontent.com https://www.google.com https://i.scdn.co https://i1.sndcdn.com https://p16-sign.tiktokcdn-us.com https://p19-sign.tiktokcdn-us.com https://*.cdninstagram.com https://*.fbcdn.net https://i.vimeocdn.com https://*.mzstatic.com https://image.mux.com https://*.giphy.com https://cdn.jsdelivr.net;
    font-src 'self' blob: data:;
    object-src 'none';
    base-uri 'self';
    ${ENVIRONMENT !== 'development' ? 'upgrade-insecure-requests;' : ''}
`
const nonEmbeddedCSP = `
  ${baseCSP}
  form-action 'self' ${process.env.NEXT_PUBLIC_API_URL};
  frame-ancestors 'self';
`
const embeddedCSP = `
  ${baseCSP}
  form-action 'self' ${process.env.NEXT_PUBLIC_API_URL};
  frame-ancestors *;
`
// Simeon on the web (4 October 2026): the Mac app's window at /app. It
// talks to the API and, through the API's proxy, to the person's cloud
// computer: commands and the event stream (connect-src), the agents'
// pictures (img-src) and the computer panel (frame-src). It is never
// shown inside another site.
const appWindowCSP = `
  default-src 'self';
  connect-src 'self' blob: ${process.env.NEXT_PUBLIC_API_URL};
  img-src 'self' blob: data: https: ${process.env.NEXT_PUBLIC_API_URL};
  media-src 'self' blob: ${process.env.NEXT_PUBLIC_API_URL};
  frame-src ${process.env.NEXT_PUBLIC_API_URL};
  script-src 'self' blob:;
  worker-src 'self' blob:;
  style-src 'self' 'unsafe-inline';
  font-src 'self' blob: data:;
  object-src 'none';
  base-uri 'self';
  frame-ancestors 'none';
  ${ENVIRONMENT !== 'development' ? 'upgrade-insecure-requests;' : ''}
`

// Don't add form-action to the OAuth2 authorize page, as it blocks the OAuth2 redirection
// 10-years old debate about whether to block redirects with form-action or not: https://github.com/w3c/webappsec-csp/issues/8
const oauth2CSP = `
  ${baseCSP}
  frame-ancestors 'none';
`

// A specific CSP for pages served from a Mintlify docs site
// Ref: https://www.mintlify.com/docs/guides/csp-configuration#content-security-policy-csp-configuration
const docsCSP = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' cdn.jsdelivr.net www.googletagmanager.com cdn.segment.com plausible.io
  us.posthog.com tag.clearbitscripts.com cdn.heapanalytics.com chat.cdn-plain.com chat-assets.frontapp.com
  browser.sentry-cdn.com js.sentry-cdn.com;
  style-src 'self' 'unsafe-inline' d4tuoctqmanu0.cloudfront.net fonts.googleapis.com;
  font-src 'self' d4tuoctqmanu0.cloudfront.net fonts.googleapis.com;
  img-src 'self' data: blob: d3gk2c5xim1je2.cloudfront.net mintcdn.com *.mintcdn.com cdn.jsdelivr.net mintlify.s3.us-west-1.amazonaws.com;
  connect-src 'self' *.mintlify.dev *.mintlify.com d1ctpt7j8wusba.cloudfront.net mintcdn.com *.mintcdn.com
  api.mintlifytrieve.com www.googletagmanager.com cdn.segment.com plausible.io us.posthog.com browser.sentry-cdn.com;
  frame-src 'self' *.mintlify.dev;
`

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['shiki'],
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  webpack: (config, { dev }) => {
    if (config.cache && !dev) {
      config.cache = Object.freeze({
        type: 'memory',
      })
    }

    return config
  },

  // Since Codespaces run behind a proxy, we need to allow it for Server-Side Actions, like cache revalidation
  // See: https://github.com/vercel/next.js/issues/58019
  ...(CODESPACES
    ? {
        experimental: {
          serverActions: {
            allowedForwardedHosts: [
              `${process.env.CODESPACE_NAME}-8080.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
              'localhost:8080',
              '127.0.0.1:8080',
            ],
            allowedOrigins: [
              `${process.env.CODESPACE_NAME}-8080.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
              'localhost:8080',
              '127.0.0.1:8080',
            ],
          },
        },
      }
    : {}),

  images: {
    remotePatterns: [
      ...(process.env.S3_PUBLIC_IMAGES_BUCKET_HOSTNAME
        ? [
            {
              protocol: process.env.S3_PUBLIC_IMAGES_BUCKET_PROTOCOL || 'https',
              hostname: process.env.S3_PUBLIC_IMAGES_BUCKET_HOSTNAME,
              port: process.env.S3_PUBLIC_IMAGES_BUCKET_PORT || '',
              pathname: process.env.S3_PUBLIC_IMAGES_BUCKET_PATHNAME || '**',
            },
          ]
        : []),
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '**',
      },
      {
        protocol: 'https',
        hostname: '7vk6rcnylug0u6hg.public.blob.vercel-storage.com',
        port: '',
        pathname: '**',
      },
    ],
  },

  async rewrites() {
    return [
      // Simeon on the web: the window is a built page under public/app
      // (desktop/web/build-web.mjs); /app opens it.
      {
        source: '/app',
        destination: '/app/index.html',
      },
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ]
  },

  async redirects() {
    return [
      {
        source: '/careers',
        destination: 'https://simeonlabs.com/company',
        permanent: false,
      },

      // Logged-in user redirections (check both new and legacy cookie names)
      {
        source: '/',
        destination: '/start',
        has: [
          {
            type: 'cookie',
            key: AUTH_COOKIE_KEY,
          },
          {
            type: 'host',
            value: defaultFrontendHostname,
          },
        ],
        permanent: false,
      },
      {
        source: '/',
        destination: '/start',
        has: [
          {
            type: 'cookie',
            key: LEGACY_AUTH_COOKIE_KEY,
          },
          {
            type: 'host',
            value: defaultFrontendHostname,
          },
        ],
        permanent: false,
      },

      // Send the dashboard to its own host when served from another one
      // Skip in development so local dev server serves the dashboard directly
      ...(ENVIRONMENT !== 'development'
        ? [
            {
              source: '/dashboard/:path*',
              destination: `https://${defaultFrontendHostname}/dashboard/:path*`,
              missing: [
                {
                  type: 'host',
                  value: defaultFrontendHostname,
                },
                {
                  type: 'header',
                  key: 'x-forwarded-host',
                  value: defaultFrontendHostname,
                },
              ],
              permanent: false,
            },
          ]
        : []),

      {
        source: '/maintainer',
        destination: '/dashboard',
        permanent: true,
      },
      {
        source: '/maintainer/:path(.*)',
        destination: '/dashboard/:path(.*)',
        permanent: true,
      },
      {
        source: '/finance',
        destination: '/finance/income',
        permanent: false,
      },
      {
        source: '/dashboard/:organization/overview',
        destination: '/dashboard/:organization',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/benefits',
        destination: '/dashboard/:organization/products/benefits',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/products/overview',
        destination: '/dashboard/:organization/products',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/issues',
        destination: '/dashboard/:organization/issues/overview',
        permanent: false,
      },
      {
        source: '/dashboard/:organization/promote/issues',
        destination: '/dashboard/:organization/issues/badge',
        permanent: false,
      },
      {
        source: '/dashboard/:organization/issues/promote',
        destination: '/dashboard/:organization/issues/badge',
        permanent: false,
      },
      {
        source: '/dashboard/:organization/finance',
        destination: '/dashboard/:organization/finance/income',
        permanent: false,
      },
      {
        source: '/dashboard/:organization/usage-billing',
        destination: '/dashboard/:organization/products/meters',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/usage-billing/meters',
        destination: '/dashboard/:organization/products/meters',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/usage-billing/events',
        destination: '/dashboard/:organization/analytics/events',
        permanent: true,
      },
      {
        source: '/dashboard/:organization/usage-billing/spans',
        destination: '/dashboard/:organization/analytics/costs',
        permanent: true,
      },

      // Account Settings Redirects
      {
        source: '/settings',
        destination: '/dashboard/account/preferences',
        permanent: true,
      },

      // Access tokens redirect
      {
        source: '/settings/tokens',
        destination: '/account/developer',
        permanent: false,
      },
    ]
  },
  async headers() {
    const baseHeaders = [
      {
        key: 'Content-Security-Policy',
        value: nonEmbeddedCSP.replace(/\n/g, ''),
      },
      {
        key: 'Permissions-Policy',
        value:
          'payment=(), publickey-credentials-get=(), camera=(), microphone=(), geolocation=()',
      },
      {
        key: 'X-Frame-Options',
        value: 'SAMEORIGIN',
      },
    ]

    // Add X-Robots-Tag header for sandbox environment
    if (ENVIRONMENT === 'sandbox') {
      baseHeaders.push({
        key: 'X-Robots-Tag',
        value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
      })
    }

    return [
      {
        source: '/((?!checkout|oauth2|docs|app).*)',
        headers: baseHeaders,
      },
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: appWindowCSP.replace(/\n/g, ''),
          },
          {
            key: 'Permissions-Policy',
            value:
              'payment=(), publickey-credentials-get=(), camera=(), microphone=(self), geolocation=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
          },
        ],
      },
      {
        source: '/app',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: appWindowCSP.replace(/\n/g, ''),
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Robots-Tag',
            value: 'noindex, nofollow, noarchive, nosnippet, noimageindex',
          },
        ],
      },
      {
        source: '/oauth2/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: oauth2CSP.replace(/\n/g, ''),
          },
          {
            key: 'Permissions-Policy',
            value:
              'payment=(), publickey-credentials-get=(), camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          ...(ENVIRONMENT === 'sandbox'
            ? [
                {
                  key: 'X-Robots-Tag',
                  value:
                    'noindex, nofollow, noarchive, nosnippet, noimageindex',
                },
              ]
            : []),
        ],
      },
      {
        source: '/checkout/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: embeddedCSP.replace(/\n/g, ''),
          },
          {
            key: 'Permissions-Policy',
            value: `payment=*, publickey-credentials-get=*, camera=(), microphone=(), geolocation=()`,
          },
          ...(ENVIRONMENT === 'sandbox'
            ? [
                {
                  key: 'X-Robots-Tag',
                  value:
                    'noindex, nofollow, noarchive, nosnippet, noimageindex',
                },
              ]
            : []),
        ],
      },
      {
        source: '/docs/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: docsCSP.replace(/\n/g, ''),
          },
          {
            key: 'Permissions-Policy',
            value:
              'payment=(), publickey-credentials-get=(), camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          ...(ENVIRONMENT === 'sandbox'
            ? [
                {
                  key: 'X-Robots-Tag',
                  value:
                    'noindex, nofollow, noarchive, nosnippet, noimageindex',
                },
              ]
            : []),
        ],
      },
    ]
  },
}

const createConfig = async () => {
  const withMDX = createMDX({
    options: {
      remarkPlugins: ['remark-frontmatter', 'remark-gfm'],
      rehypePlugins: [
        'rehype-mdx-import-media',
        'rehype-slug',
        [
          '@shikijs/rehype',
          {
            themes: themeConfig,
          },
        ],
      ],
    },
  })

  let conf = withMDX(nextConfig)

  // Injected content via Sentry wizard below

  conf = withSentryConfig(conf, {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT ?? 'dashboard',

    // Pass the auth token
    authToken: process.env.SENTRY_AUTH_TOKEN,

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    reactComponentAnnotation: {
      enabled: false,
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,
  })

  if (process.env.ANALYZE === 'true') {
    const withBundleAnalyzer = bundleAnalyzer({
      enabled: true,
    })
    conf = withBundleAnalyzer(conf)
  }

  return conf
}

export default createConfig
