'use client'

import { CatalogTabs } from '@/components/Catalog/CatalogTabs'
import { usePathname } from 'next/navigation'
import { PropsWithChildren } from 'react'

export default function CatalogLayout({ children }: PropsWithChildren) {
  const pathname = usePathname()

  const isDetailPage =
    /\/products\/(new|[0-9a-f-]{36})/.test(pathname) ||
    pathname.endsWith('/checkout-links/new')

  if (isDetailPage) {
    return children
  }

  return (
    <div className="flex h-full flex-col">
      <CatalogTabs />
      {children}
    </div>
  )
}
