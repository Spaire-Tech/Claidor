'use client'

import { Tabs, TabsList, TabsTrigger } from '@claidor/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

// Claidor keeps two tabs: the workspace itself, and who is in it. The
// payments-era tabs (plan, billing, webhooks, custom fields) left with
// their routes when the old dashboard was removed.
const settingsTabs = [
  { title: 'Général', suffix: '' },
  { title: 'Membres', suffix: '/members' },
]

export default function SettingsLayout({ children }: PropsWithChildren) {
  const params = useParams<{ organization: string }>()
  const pathname = usePathname()
  const base = `/dashboard/${params.organization}/settings`

  const activeTab =
    settingsTabs.find((t) =>
      t.suffix === ''
        ? pathname === base || pathname === `${base}/`
        : pathname.startsWith(`${base}${t.suffix}`),
    ) ?? settingsTabs[0]

  return (
    <div className="flex h-full flex-col">
      <div className="overflow-x-auto px-4 pt-6 md:px-8">
        <Tabs value={activeTab.title}>
          <TabsList className="flex min-w-max flex-row bg-transparent ring-0 ">
            {settingsTabs.map((tab) => (
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
