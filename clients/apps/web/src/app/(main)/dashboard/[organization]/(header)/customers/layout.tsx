'use client'

import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

const customerTabs = [{ title: 'Customers', suffix: '' }]

export default function CustomersLayout({ children }: PropsWithChildren) {
  const params = useParams<{ organization: string }>()
  const pathname = usePathname()
  const base = `/dashboard/${params.organization}/customers`

  // Hide tabs on detail pages
  const isDetailPage = /\/customers\/[0-9a-f-]{36}/.test(pathname)

  if (isDetailPage) {
    return children
  }

  const activeTab =
    customerTabs.find((t) =>
      t.suffix === ''
        ? pathname === base || pathname === `${base}/`
        : pathname.startsWith(`${base}${t.suffix}`),
    ) ?? customerTabs[0]

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto px-4 pt-6 md:px-8">
        <Tabs value={activeTab.title}>
          <TabsList className="flex min-w-max flex-row bg-transparent ring-0 ">
            {customerTabs.map((tab) => (
              <Link
                key={tab.suffix}
                href={`${base}${tab.suffix}`}
                prefetch={true}
              >
                <TabsTrigger
                  className="flex flex-row items-center gap-x-2 px-4"
                  value={tab.title}
                >
                  {tab.title}
                </TabsTrigger>
              </Link>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {children}
    </div>
  )
}
