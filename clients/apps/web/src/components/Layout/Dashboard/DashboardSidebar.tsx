import { NotificationsPopover } from '@/components/Notifications/NotificationsPopover'
import { useAuth } from '@/hooks'
import { CONFIG } from '@/utils/config'
import { isImpersonating } from '@/utils/impersonation'
import ArrowOutwardOutlined from '@mui/icons-material/ArrowOutwardOutlined'
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown'
import ScienceOutlined from '@mui/icons-material/ScienceOutlined'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@spaire/ui/components/atoms/Sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { Separator } from '@spaire/ui/components/ui/separator'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { SpaireLogotype } from '../Public/SpaireLogotype'
import {
  AccountNavigation,
  OrganizationNavigation,
} from './DashboardNavigation'

export const DashboardSidebar = ({
  type = 'organization',
  organization,
  organizations,
}: {
  type?: 'organization' | 'account'
  organization?: schemas['Organization']
  organizations: schemas['Organization'][]
}) => {
  const router = useRouter()
  const { state } = useSidebar()

  const { currentUser } = useAuth()

  const isCollapsed = state === 'collapsed'

  const navigateToOrganization = (org: schemas['Organization']) => {
    router.push(`/dashboard/${org.slug}`)
  }

  // Annoying useEffect hack to allow access to client-side cookies from Server-Side component
  const [_isImpersonating, setIsImpersonating] = useState(false)
  useEffect(() => {
    setIsImpersonating(isImpersonating())
  }, [])
  const isTopBannerVisible = CONFIG.IS_SANDBOX || _isImpersonating

  // Course-only reposition: creators are individuals, so the "New
  // Organization" action is hidden. Existing organizations remain switchable.
  // Reversible: flip to true to re-enable creating organizations.
  const allowCreateOrganization = false

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader
        className={twMerge(
          'flex md:pt-3.5',
          isTopBannerVisible ? 'md:pt-10' : '',
          isCollapsed
            ? 'flex-row items-center justify-between gap-y-4 md:flex-col md:items-start md:justify-start'
            : 'flex-row items-center justify-between',
        )}
      >
        {/* Client org logo at top — replaces Spaire logo */}
        {type === 'organization' && organization ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex cursor-pointer items-center gap-2 rounded-lg p-1 transition-colors hover:bg-gray-100">
                <Avatar
                  name={organization.name}
                  avatar_url={organization.avatar_url}
                  className="h-7 w-7"
                />
                {!isCollapsed && (
                  <KeyboardArrowDown className="text-gray-400" fontSize="small" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="bottom"
              align="start"
              className="min-w-[200px]"
            >
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  className="flex flex-row items-center gap-x-2"
                  onClick={() => navigateToOrganization(org)}
                >
                  <Avatar
                    name={org.name}
                    avatar_url={org.avatar_url}
                    className="h-6 w-6"
                  />
                  <span className="min-w-0 truncate">{org.name}</span>
                </DropdownMenuItem>
              ))}
              {allowCreateOrganization && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      router.push('/dashboard/create?existing_org=true')
                    }
                  >
                    New Organization
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() =>
                  router.push(`${CONFIG.BASE_URL}/v1/auth/logout`)
                }
              >
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <SpaireLogotype
            size={32}
            href={organization ? `/dashboard/${organization.slug}` : '/dashboard'}
          />
        )}
        <motion.div
          key={isCollapsed ? 'header-collapsed' : 'header-expanded'}
          className={`flex ${isCollapsed ? 'flex-row md:flex-col-reverse' : 'flex-row'} items-center gap-2`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <NotificationsPopover />
          <SidebarTrigger />
        </motion.div>
      </SidebarHeader>

      <SidebarContent className="gap-4 px-2 py-4">
        <motion.div
          key={isCollapsed ? 'nav-collapsed' : 'nav-expanded'}
          className="flex flex-col items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
        >
          {type === 'account' && <AccountNavigation />}
          {type === 'organization' && organization && (
            <OrganizationNavigation organization={organization} />
          )}
        </motion.div>
      </SidebarContent>
      <SidebarFooter>
        <Separator />
        {!CONFIG.IS_SANDBOX && (
          <Link
            href="https://sandbox.spairehq.com/start"
            target="_blank"
            className={twMerge(
              'mt-2 flex cursor-pointer flex-row items-center rounded-lg border border-transparent px-2 text-sm transition-colors',
              ' text-gray-500 hover:text-black',
            )}
          >
            <ScienceOutlined fontSize="inherit" />
            {!isCollapsed && <span className="ml-4 font-medium">Sandbox</span>}
          </Link>
        )}
        <Link
          className={twMerge(
            'flex flex-row items-center rounded-lg border border-transparent text-sm transition-colors',
            ' text-gray-500 hover:text-black',
          )}
          href="https://docs.spairehq.com"
          target="_blank"
        >
          <ArrowOutwardOutlined className="ml-2" fontSize="inherit" />
          {!isCollapsed && (
            <span className="ml-4 font-medium">Documentation</span>
          )}
        </Link>
      </SidebarFooter>
    </Sidebar>
  )
}
