'use client'

import { CheckoutLinkForm } from '@/components/CheckoutLinks/CheckoutLinkForm'
import { CheckoutLinkPreviewPanel } from '@/components/CheckoutLinks/CheckoutLinkPreviewPanel'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export const CheckoutLinkCreatePage = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const router = useRouter()
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  const [displaySettings, setDisplaySettings] = useState({
    showLogo: true,
    showMedia: true,
    showDescription: true,
  })

  const handleClose = (checkoutLink: schemas['CheckoutLink']) => {
    router.push(
      `/dashboard/${organization.slug}/products/checkout-links/${checkoutLink.id}`,
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left panel — form */}
      <div className="flex w-[460px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white ">
        <div className="border-b border-gray-200 px-6 py-4">
          <Link
            href={`/dashboard/${organization.slug}/products/checkout-links`}
            className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black "
          >
            <ArrowBackOutlined fontSize="small" />
            <span>Back to Payment Links</span>
          </Link>
        </div>
        <div className="flex flex-col gap-6 overflow-y-auto px-8 py-8">
          <h1 className="text-xl font-semibold text-gray-900">
            Create Payment Link
          </h1>
          <CheckoutLinkForm
            organization={organization}
            onClose={handleClose}
            onProductsChange={setSelectedProductIds}
            onDisplaySettingsChange={setDisplaySettings}
          />
        </div>
      </div>

      {/* Right panel — live preview */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <CheckoutLinkPreviewPanel
          productId={selectedProductIds[0]}
          showLogo={displaySettings.showLogo}
          showMedia={displaySettings.showMedia}
          showDescription={displaySettings.showDescription}
        />
      </div>
    </div>
  )
}
