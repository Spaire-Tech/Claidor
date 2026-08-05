'use client'

import { useProduct } from '@/hooks/queries'
import { schemas } from '@spaire/client'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { CreateProductPage } from './CreateProductPage'
import { ProductPreviewPanel } from './ProductPreviewPanel'

interface CreateProductSplitPageProps {
  organization: schemas['Organization']
  fromProductId?: string
}

/**
 * Full-screen split layout for creating products — form on the left,
 * live tax/price preview on the right (mirrors the checkout link creation page).
 */
const CreateProductSplitPageInner = ({
  organization,
  sourceProduct,
}: {
  organization: schemas['Organization']
  sourceProduct?: schemas['Product']
}) => {
  const searchParams = useSearchParams()
  const rawReturnTo = searchParams?.get('returnTo') ?? null
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/')
      ? rawReturnTo
      : `/dashboard/${organization.slug}/products`
  const backLabel =
    returnTo === `/dashboard/${organization.slug}/products`
      ? 'Back to Products'
      : 'Back to Space'

  const [previewPrice, setPreviewPrice] = useState<{
    amount: number | null
    currency: string
    recurringInterval: string | null
    recurringIntervalCount: number | null
    allPrices: { currency: string; amount: number | null; amountType: string }[]
  }>({
    amount: null,
    currency: organization.default_presentment_currency,
    recurringInterval: null,
    recurringIntervalCount: null,
    allPrices: [],
  })

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left panel — product form */}
      <div className="flex flex-1 min-w-0 flex-col overflow-hidden border-r border-gray-200 bg-white ">
        <div className="border-b border-gray-200 px-6 py-4">
          <Link
            href={returnTo}
            className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black "
          >
            <ArrowBackOutlined fontSize="small" />
            <span>{backLabel}</span>
          </Link>
        </div>
        <div className="overflow-y-auto">
          <CreateProductPage
            organization={organization}
            sourceProduct={sourceProduct}
            splitMode
            onPriceChange={setPreviewPrice}
          />
        </div>
      </div>

      {/* Right panel — preview */}
      <div className="hidden md:flex w-[420px] shrink-0 flex-col overflow-y-auto p-8">
        <div className="mx-auto w-full max-w-sm">
          <ProductPreviewPanel
            priceAmount={previewPrice.amount}
            currency={previewPrice.currency}
            recurringInterval={previewPrice.recurringInterval}
            recurringIntervalCount={previewPrice.recurringIntervalCount}
            allPrices={previewPrice.allPrices}
          />
        </div>
      </div>
    </div>
  )
}

export const CreateProductSplitPage = ({
  organization,
  fromProductId,
}: CreateProductSplitPageProps) => {
  const { data: sourceProduct, isLoading } = useProduct(fromProductId)

  if (fromProductId && isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className=" text-gray-500">
          Loading product...
        </p>
      </div>
    )
  }

  if (fromProductId && !sourceProduct) {
    return null
  }

  return (
    <CreateProductSplitPageInner
      organization={organization}
      sourceProduct={sourceProduct}
    />
  )
}
