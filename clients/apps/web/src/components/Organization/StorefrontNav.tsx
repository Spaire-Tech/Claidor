'use client'

import { useCustomerOrders } from '@/hooks/queries'
import { api } from '@/utils/client'
import { organizationPageLink } from '@/utils/nav'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSelectedLayoutSegment } from 'next/navigation'
import { twMerge } from 'tailwind-merge'

interface OrganizationStorefrontNavProps {
  className?: string
  organization: schemas['Organization']
}

export const StorefrontNav = ({
  organization,
  className,
}: OrganizationStorefrontNavProps) => {
  const routeSegment = useSelectedLayoutSegment()
  const currentTab = routeSegment ?? 'products'

  const { data: orders } = useCustomerOrders(api)

  const tabs = [
    { id: 'products', label: 'Products', href: organizationPageLink(organization) },
    { id: 'about', label: 'About', href: organizationPageLink(organization, 'about') },
    ...(
      (orders?.items.length ?? 0) > 0
        ? [{ id: 'portal', label: 'My Orders', href: organizationPageLink(organization, 'portal') }]
        : []
    ),
  ]

  return (
    <nav className={twMerge('flex flex-row items-center gap-x-6', className)}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={twMerge(
            'relative pb-2 text-[14px] font-medium transition-colors',
            currentTab === tab.id
              ? 'text-gray-950'
              : 'text-gray-400 hover:text-gray-600',
          )}
        >
          {tab.label}
          {currentTab === tab.id && (
            <span className="absolute bottom-0 left-0 h-0.5 w-full rounded-full bg-gray-950" />
          )}
        </Link>
      ))}
    </nav>
  )
}
