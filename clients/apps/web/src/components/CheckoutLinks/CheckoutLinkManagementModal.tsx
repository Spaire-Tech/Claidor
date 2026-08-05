'use client'

import { schemas } from '@spaire/client'
import { useState } from 'react'
import { CheckoutLinkForm } from './CheckoutLinkForm'
import { CheckoutLinkPreviewPanel } from './CheckoutLinkPreviewPanel'

interface CheckoutLinkManagementModalProps {
  organization: schemas['Organization']
  onClose: (checkoutLink: schemas['CheckoutLink']) => void
  productIds: string[]
}

export const CheckoutLinkManagementModal = ({
  organization,
  onClose,
  productIds,
}: CheckoutLinkManagementModalProps) => {
  const [selectedProductIds, setSelectedProductIds] =
    useState<string[]>(productIds)

  return (
    <div className="flex h-full flex-row overflow-hidden">
      <div className=" flex w-[480px] shrink-0 flex-col gap-8 overflow-y-auto border-r border-gray-200 px-8 py-12">
        <div className="flex flex-row items-center justify-between">
          <h1 className="text-xl">Create Payment Link</h1>
        </div>
        <CheckoutLinkForm
          organization={organization}
          onClose={onClose}
          productIds={productIds}
          onProductsChange={setSelectedProductIds}
        />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <CheckoutLinkPreviewPanel productId={selectedProductIds[0]} />
      </div>
    </div>
  )
}
