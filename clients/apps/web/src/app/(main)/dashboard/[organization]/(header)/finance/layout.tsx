'use client'

import { useOrganizationAccount } from '@/hooks/queries'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import { cn } from '@spaire/ui/lib/utils'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PropsWithChildren, useContext } from 'react'

const allTabs = [
  { title: 'Overview', suffix: '/income', requiresPayouts: true },
  { title: 'Payouts', suffix: '/payouts', requiresPayouts: true },
  { title: 'Account', suffix: '/account', requiresPayouts: false },
]

export default function BalanceLayout({ children }: PropsWithChildren) {
  const { organization } = useContext(OrganizationContext)
  const pathname = usePathname()
  const base = `/dashboard/${organization.slug}/finance`

  const { data: account } = useOrganizationAccount(organization.id)
  const payoutsEnabled = account?.is_payouts_enabled ?? false
  const isAccountSetupPage = pathname.startsWith(`${base}/account`)

  const visibleTabs = allTabs.filter(
    (t) => !t.requiresPayouts || payoutsEnabled,
  )

  if (isAccountSetupPage) {
    return <>{children}</>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto px-4 md:px-8">
        <div className="flex min-w-max flex-row gap-1 pt-6">
          {visibleTabs.map((tab) => {
            const isActive = pathname.startsWith(`${base}${tab.suffix}`)
            return (
              <Link
                key={tab.suffix}
                href={`${base}${tab.suffix}`}
                prefetch={true}
                className={cn(
                  'relative mr-6 pb-3 text-sm font-medium transition-colors last:mr-0',
                  isActive
                    ? 'text-gray-900 after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-0.5 after:rounded-full after:bg-blue-500'
                    : 'text-gray-400 hover:text-gray-600 ',
                )}
              >
                {tab.title}
              </Link>
            )
          })}
        </div>
      </div>
      {children}
    </div>
  )
}
