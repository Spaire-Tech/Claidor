'use client'

import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import Link from 'next/link'
import { useParams, usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

// Reframed for individual creators (Spaire MasterClass builder).
// Enterprise/multi-tenant/dev tabs are gated off below via `enabled: false`.
// Routes & page components are intentionally KEPT — only nav visibility changes,
// so flipping `enabled` back to true fully restores each tab.
const settingsTabs = [
  { title: 'Account', suffix: '', enabled: true },
  { title: 'Subscription', suffix: '/plan', enabled: true },
  { title: 'Billing', suffix: '/billing', enabled: true },
  // Hidden for the course-only creator experience (reversible):
  { title: 'Members', suffix: '/members', enabled: false }, // team management
  { title: 'Webhooks', suffix: '/webhooks', enabled: false }, // dev integrations
  { title: 'Custom Fields', suffix: '/custom-fields', enabled: false },
].filter((tab) => tab.enabled)

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
