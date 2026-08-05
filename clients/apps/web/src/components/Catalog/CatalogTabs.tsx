'use client'

import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'

type CatalogTab = {
  title: string
  path: string
}

const catalogTabs: CatalogTab[] = [
  { title: 'Products', path: '/products' },
  { title: 'Lead Magnets', path: '/products/lead-magnets' },
  { title: 'Payment Links', path: '/products/checkout-links' },
  { title: 'Discounts', path: '/products/discounts' },
  { title: 'Files', path: '/products/benefits' },
]

export function CatalogTabs() {
  const params = useParams<{ organization: string }>()
  const pathname = usePathname()
  const orgBase = `/dashboard/${params.organization}`

  const activeTab =
    [...catalogTabs]
      .sort((a, b) => b.path.length - a.path.length)
      .find((t) => {
        const full = `${orgBase}${t.path}`
        return pathname === full || pathname.startsWith(`${full}/`)
      }) ?? catalogTabs[0]

  return (
    <div
      className="overflow-x-auto px-4 pt-6 md:px-8"
      data-catalog-tabs="true"
    >
      <Tabs value={activeTab.title}>
        <TabsList className="flex min-w-max flex-row bg-transparent ring-0 ">
          {catalogTabs.map((tab) => (
            <Link key={tab.title} href={`${orgBase}${tab.path}`} prefetch={true}>
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
  )
}
