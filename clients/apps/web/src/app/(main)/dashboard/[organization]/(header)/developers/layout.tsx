'use client'

import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

const developersTabs = [
  { title: 'Agent Install', suffix: '' },
  { title: 'Frameworks', suffix: '/frameworks' },
  { title: 'API', suffix: '/api' },
]

export default function DevelopersLayout({ children }: PropsWithChildren) {
  const params = useParams<{ organization: string }>()
  const pathname = usePathname()
  const base = `/dashboard/${params.organization}/developers`

  // Show tabs only on the top-level tab pages
  const isTabPage =
    pathname === base ||
    pathname === `${base}/` ||
    pathname === `${base}/frameworks` ||
    pathname === `${base}/frameworks/` ||
    pathname === `${base}/api` ||
    pathname === `${base}/api/`

  if (!isTabPage) {
    return children
  }

  const activeTab =
    developersTabs.find((t) =>
      t.suffix === ''
        ? pathname === base || pathname === `${base}/`
        : pathname.startsWith(`${base}${t.suffix}`),
    ) ?? developersTabs[0]

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto px-4 pt-6 md:px-8">
        <Tabs value={activeTab.title}>
          <TabsList className="flex min-w-max flex-row bg-transparent ring-0 ">
            {developersTabs.map((tab) => (
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
