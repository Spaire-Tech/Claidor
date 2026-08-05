import { PolarHog, usePostHog } from '@/hooks/posthog'
import { useOrganizationAccount } from '@/hooks/queries'
import AttachMoneyOutlined from '@mui/icons-material/AttachMoneyOutlined'
import CodeOutlined from '@mui/icons-material/CodeOutlined'
import DiscountOutlined from '@mui/icons-material/DiscountOutlined'
import ExtensionOutlined from '@mui/icons-material/ExtensionOutlined'
import HiveOutlined from '@mui/icons-material/HiveOutlined'
import LayersOutlined from '@mui/icons-material/LayersOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import MailOutlined from '@mui/icons-material/MailOutlined'
import OndemandVideoOutlined from '@mui/icons-material/OndemandVideoOutlined'
import PeopleAltOutlined from '@mui/icons-material/PeopleAltOutlined'
import ReceiptLongOutlined from '@mui/icons-material/ReceiptLongOutlined'
import ShoppingBagOutlined from '@mui/icons-material/ShoppingBagOutlined'
import SpaceDashboardOutlined from '@mui/icons-material/SpaceDashboardOutlined'
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined'
import TrendingUp from '@mui/icons-material/TrendingUp'
import TuneOutlined from '@mui/icons-material/TuneOutlined'
import { schemas } from '@spaire/client'
import { usePathname } from 'next/navigation'
import { useCallback, useMemo } from 'react'

export type SubRoute = {
  readonly title: string
  readonly link: string
  readonly icon?: React.ReactNode
  readonly if?: boolean | (() => boolean)
  readonly extra?: React.ReactNode
}

export type Route = {
  readonly id: string
  readonly title: string
  readonly icon?: React.ReactElement<any>
  readonly link: string
  readonly if: boolean | undefined
  readonly subs?: SubRoute[]
  readonly showSubsInNav?: boolean
  readonly selectedExactMatchOnly?: boolean
  readonly selectedMatchFallback?: boolean
  readonly checkIsActive?: (currentPath: string) => boolean
}

export type SubRouteWithActive = SubRoute & { readonly isActive: boolean }

export type RouteWithActive = Route & {
  readonly isActive: boolean
  readonly subs?: SubRouteWithActive[]
}

const applySubRouteIsActive = (
  path: string,
  parentRoute?: Route,
): ((r: SubRoute) => SubRouteWithActive) => {
  return (r: SubRoute): SubRouteWithActive => {
    let isActive = r.link === path

    if (!isActive && path.startsWith(r.link)) {
      if (parentRoute?.link !== r.link) {
        isActive = true
      } else if (parentRoute.subs) {
        const hasMoreSpecificMatch = parentRoute.subs.some(
          (sub) =>
            sub !== r && sub.link !== r.link && path.startsWith(sub.link),
        )
        isActive = !hasMoreSpecificMatch
      }
    }

    return {
      ...r,
      isActive,
    }
  }
}

const applyIsActive = (path: string): ((r: Route) => RouteWithActive) => {
  return (r: Route): RouteWithActive => {
    let isActive = false

    if (r.checkIsActive !== undefined) {
      isActive = r.checkIsActive(path)
    } else {
      // Fallback
      isActive = Boolean(path && path.startsWith(r.link))
    }

    const subs = r.subs ? r.subs.map(applySubRouteIsActive(path, r)) : undefined

    return {
      ...r,
      isActive,
      subs,
    }
  }
}

const useResolveRoutes = (
  routesResolver: (
    org?: schemas['Organization'],
    posthog?: PolarHog,
  ) => Route[],
  org?: schemas['Organization'],
  allowAll?: boolean,
): RouteWithActive[] => {
  const path = usePathname()
  const posthog = usePostHog()

  return useMemo(() => {
    return (
      routesResolver(org, posthog)
        .filter((o) => allowAll || o.if)
        // Filter out child routes if they have an if-function and it evaluates to false
        .map((route) => {
          if (route.subs && Array.isArray(route.subs)) {
            return {
              ...route,
              subs: route.subs.filter(
                (child) =>
                  typeof child.if === 'undefined' ||
                  (typeof child.if === 'function' ? child.if() : child.if),
              ),
            }
          }
          return route
        })
        .map(applyIsActive(path))
    )
  }, [org, path, allowAll, routesResolver, posthog])
}

export const useDashboardRoutes = (
  org?: schemas['Organization'],
  allowAll?: boolean,
): RouteWithActive[] => {
  return useResolveRoutes((org) => dashboardRoutesList(org), org, allowAll)
}

export const useGeneralRoutes = (
  org?: schemas['Organization'],
  allowAll?: boolean,
): RouteWithActive[] => {
  return useResolveRoutes((org) => generalRoutesList(org), org, allowAll)
}

export const useOrganizationRoutes = (
  org?: schemas['Organization'],
  allowAll?: boolean,
): RouteWithActive[] => {
  const { data: account, error: accountError } = useOrganizationAccount(org?.id)
  // Explicit 404 = no account exists yet → send to setup
  const noAccount =
    accountError && (accountError as any)?.response?.status === 404
  // Pass false when no account or payouts disabled; undefined while still loading (no redirect)
  const payoutsReady = noAccount ? false : account?.is_payouts_enabled
  const resolver = useCallback(
    (o?: schemas['Organization'], posthog?: PolarHog) =>
      organizationRoutesList(o, posthog, payoutsReady),
    [payoutsReady],
  )
  return useResolveRoutes(resolver, org, allowAll)
}

export const useAccountRoutes = (): RouteWithActive[] => {
  const path = usePathname()
  return accountRoutesList()
    .filter((o) => o.if)
    .map(applyIsActive(path))
}

// internals below

const generalRoutesList = (org?: schemas['Organization']): Route[] => [
  {
    id: 'home',
    title: 'Overview',
    icon: <SpaceDashboardOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}`,
    checkIsActive: (currentRoute: string) =>
      currentRoute === `/dashboard/${org?.slug}`,
    if: true,
  },
  {
    id: 'space',
    title: 'Space',
    icon: <StorefrontOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/storefront`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/storefront`)
    },
    if: false,
  },
  {
    id: 'catalog',
    title: 'Products',
    icon: <HiveOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/products`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/products`)
    },
    if: false,
    showSubsInNav: false,
    subs: [
      { title: 'Products', link: `/dashboard/${org?.slug}/products` },
      {
        title: 'Payment Links',
        link: `/dashboard/${org?.slug}/products/checkout-links`,
      },
      {
        title: 'Discounts',
        link: `/dashboard/${org?.slug}/products/discounts`,
      },
      { title: 'Files', link: `/dashboard/${org?.slug}/products/benefits` },
    ],
  },
  {
    id: 'courses',
    title: 'MasterClass',
    icon: <OndemandVideoOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/courses`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/courses`)
    },
    if: true,
  },
  {
    id: 'customers',
    title: 'Customers',
    icon: <PeopleAltOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/customers`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/customers`)
    },
    if: false,
  },
  {
    id: 'invoices',
    title: 'Invoices',
    icon: <ReceiptLongOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/invoices`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/invoices`)
    },
    if: false,
  },
  {
    id: 'analytics',
    title: 'Analytics',
    icon: <TrendingUp fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/analytics`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/analytics`)
    },
    if: true,
  },
  {
    id: 'sales',
    title: 'Sales',
    icon: <ShoppingBagOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/sales`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/sales`)
    },
    if: true,
  },
  // Promoted out of the (now hidden) Products/catalog parent so they survive
  // the course-only reposition. Routes still live under /products/* and are
  // intentionally NOT URL-gated in [organization]/layout.tsx.
  {
    id: 'payment-links',
    title: 'Payment Links',
    icon: <LinkOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/products/checkout-links`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(
        `/dashboard/${org?.slug}/products/checkout-links`,
      )
    },
    if: false,
  },
  {
    id: 'discounts',
    title: 'Discounts',
    icon: <DiscountOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/products/discounts`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(
        `/dashboard/${org?.slug}/products/discounts`,
      )
    },
    if: false,
  },
  {
    id: 'marketing',
    title: 'Marketing',
    icon: <MailOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/email-marketing`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/email-marketing`)
    },
    if: false,
  },
  {
    id: 'developers',
    title: 'Developers',
    icon: <ExtensionOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/developers`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/developers`)
    },
    if: false,
  },
  {
    id: 'founder-tools',
    title: 'Founder Tools',
    icon: <LayersOutlined fontSize="inherit" />,
    link: `/dashboard/${org?.slug}/founder-tools/perks`,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/founder-tools`)
    },
    if: false,
  },
]

const dashboardRoutesList = (org?: schemas['Organization']): Route[] => [
  ...accountRoutesList(),
  ...generalRoutesList(org),
  ...organizationRoutesList(org),
]

const accountRoutesList = (): Route[] => [
  {
    id: 'preferences',
    title: 'Preferences',
    link: `/dashboard/account/preferences`,
    icon: <TuneOutlined className="h-5 w-5" fontSize="inherit" />,
    if: true,
    subs: undefined,
  },
  {
    id: 'developer',
    title: 'Developer',
    link: `/dashboard/account/developer`,
    icon: <CodeOutlined fontSize="inherit" />,
    if: false,
  },
]

const organizationRoutesList = (
  org?: schemas['Organization'],
  _posthog?: PolarHog,
  payoutsReady?: boolean,
): Route[] => [
  {
    id: 'finance',
    title: 'Payouts',
    // false = no account or disabled → account setup; undefined = still loading → keep /income
    link:
      payoutsReady === false
        ? `/dashboard/${org?.slug}/finance/account`
        : `/dashboard/${org?.slug}/finance/income`,
    icon: <AttachMoneyOutlined fontSize="inherit" />,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/finance`)
    },
    if: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    link: `/dashboard/${org?.slug}/settings`,
    icon: <TuneOutlined fontSize="inherit" />,
    checkIsActive: (currentRoute: string): boolean => {
      return currentRoute.startsWith(`/dashboard/${org?.slug}/settings`)
    },
    if: true,
  },
]
