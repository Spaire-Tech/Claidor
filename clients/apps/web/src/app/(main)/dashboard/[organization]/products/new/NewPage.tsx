'use client'

import { CreateProductSplitPage } from '@/components/Products/CreateProductSplitPage'
import { schemas } from '@claidor/client'
import { useSearchParams } from 'next/navigation'

// Product creation routes straight into the generic digital-product flow
// (CreateProductSplitPage). `?fromProductId=` pre-fills the form from an
// existing product (the Duplicate action on the products list).
export default function Page({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const searchParams = useSearchParams()
  const fromProductId = searchParams?.get('fromProductId') ?? undefined
  return (
    <CreateProductSplitPage
      organization={organization}
      fromProductId={fromProductId}
    />
  )
}
