'use client'

import ArrowBack from '@mui/icons-material/ArrowBack'
import { schemas } from '@spaire/client'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  useSidebar,
} from '@spaire/ui/components/atoms/Sidebar'
import Link from 'next/link'
import { twMerge } from 'tailwind-merge'
import {
  SubRouteWithActive,
  useAccountRoutes,
  useGeneralRoutes,
  useOrganizationRoutes,
} from '../../Dashboard/navigation'

export const OrganizationNavigation = ({
  organization: org,
}: {
  organization: schemas['Organization']
}) => {
  const generalRoutesList = useGeneralRoutes(org)
  const organizationRoutes = useOrganizationRoutes(org)

  const { state } = useSidebar()

  const isCollapsed = state === 'collapsed'

  const dashboardRoutes = [...generalRoutesList, ...organizationRoutes]

  return (
    <SidebarMenu>
      {dashboardRoutes.map((route) => (
        <SidebarMenuItem key={route.link}>
          <SidebarMenuButton
            tooltip={route.title}
            asChild
            isActive={route.isActive}
          >
            <Link
              key={route.link}
              prefetch={true}
              className={twMerge(
                'flex flex-row items-center rounded-lg border border-transparent px-2 transition-colors',
                route.isActive
                  ? ' border-gray-200 bg-white! text-black shadow-xs '
                  : ' text-gray-500 hover:text-black',
                isCollapsed && '',
              )}
              href={route.link}
            >
              {'icon' in route && route.icon ? (
                <span
                  className={twMerge(
                    'flex flex-col items-center justify-center overflow-visible rounded-full bg-transparent text-[15px]',
                    route.isActive
                      ? 'text-blue-500'
                      : 'bg-transparent',
                  )}
                >
                  {route.icon}
                </span>
              ) : undefined}
              <span className="ml-2 text-sm font-medium">{route.title}</span>
            </Link>
          </SidebarMenuButton>
          {route.isActive && route.subs && route.showSubsInNav !== false && (
            <SidebarMenuSub className="my-2 gap-y-2">
              {route.subs.map((subRoute: SubRouteWithActive) => {
                return (
                  <SidebarMenuSubItem key={subRoute.link}>
                    <Link
                      href={subRoute.link}
                      prefetch={true}
                      className={twMerge(
                        ' ml-4 inline-flex flex-row items-center gap-x-2 text-sm font-medium text-gray-500 transition-colors hover:text-black',
                        subRoute.isActive && 'text-blue-500',
                      )}
                    >
                      {subRoute.title}
                      {subRoute.extra}
                    </Link>
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export const AccountNavigation = () => {
  const accountRoutes = useAccountRoutes()

  const { state } = useSidebar()

  const isCollapsed = state === 'collapsed'

  return (
    <SidebarMenu>
      <SidebarMenuItem className="mb-4 flex flex-row items-center gap-2">
        <SidebarMenuButton tooltip="Back to Dashboard" asChild>
          <Link
            href="/dashboard"
            className="flex flex-row items-center gap-4 border border-transparent text-black"
          >
            <span className="flex flex-col items-center justify-center overflow-visible rounded-full bg-transparent text-[15px]">
              <ArrowBack fontSize="inherit" />
            </span>
            <span>Account Settings</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      {accountRoutes.map((route) => (
        <SidebarMenuItem key={route.link}>
          <SidebarMenuButton
            tooltip={route.title}
            asChild
            isActive={route.isActive}
          >
            <Link
              key={route.link}
              prefetch={true}
              className={twMerge(
                'flex flex-row items-center rounded-lg border border-transparent px-2 transition-colors',
                route.isActive
                  ? ' border-gray-200 bg-white text-black shadow-xs '
                  : ' text-gray-500 hover:text-black',
                isCollapsed && '',
              )}
              href={route.link}
            >
              {'icon' in route && route.icon ? (
                <span
                  className={twMerge(
                    'flex flex-col items-center justify-center overflow-visible rounded-full bg-transparent text-[15px]',
                    route.isActive
                      ? 'text-blue-500'
                      : 'bg-transparent',
                  )}
                >
                  {route.icon}
                </span>
              ) : undefined}
              <span className="ml-2 text-sm font-medium">{route.title}</span>
            </Link>
          </SidebarMenuButton>
          {route.isActive && route.subs && (
            <SidebarMenuSub className="my-2 gap-y-2">
              {route.subs.map((subRoute: SubRouteWithActive) => {
                return (
                  <SidebarMenuSubItem key={subRoute.link}>
                    <Link
                      href={subRoute.link}
                      prefetch={true}
                      className={twMerge(
                        ' ml-4 inline-flex flex-row items-center gap-x-2 text-sm font-medium text-gray-500',
                        subRoute.isActive && 'text-blue-500',
                      )}
                    >
                      {subRoute.title}
                      {subRoute.extra}
                    </Link>
                  </SidebarMenuSubItem>
                )
              })}
            </SidebarMenuSub>
          )}
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}
