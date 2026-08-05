'use client'

import { SpaireEmbedCheckout } from '@spaire/checkout/embed'
import type { CheckoutPublic } from '@spaire/sdk/models/components/checkoutpublic'
import { X } from 'lucide-react'
import { useCallback, useEffect } from 'react'

interface CheckoutEmbedCloseProps {
  checkout: CheckoutPublic
}

const CheckoutEmbedClose: React.FC<
  React.PropsWithChildren<CheckoutEmbedCloseProps>
> = ({ checkout }) => {
  const onClose = useCallback(() => {
    if (!checkout.embedOrigin) {
      return
    }
    SpaireEmbedCheckout.postMessage({ event: 'close' }, checkout.embedOrigin)
  }, [checkout])

  useEffect(() => {
    const outsideClickListener = (event: MouseEvent) => {
      const contentElement = document.getElementById('spaire-embed-content')
      if (contentElement && !contentElement.contains(event.target as Node)) {
        onClose()
      }
    }
    document
      .getElementById('spaire-embed-layout')
      ?.addEventListener('click', outsideClickListener)

    return () => {
      document
        .getElementById('spaire-embed-layout')
        ?.removeEventListener('click', outsideClickListener)
    }
  }, [onClose])

  return (
    <button
      type="button"
      className=" fixed top-2 right-2 rounded-full bg-transparent bg-white p-2 shadow-xl md:top-4 md:right-4"
      onClick={onClose}
    >
      <X className="h-4 w-4 md:h-6 md:w-6" />
    </button>
  )
}

export default CheckoutEmbedClose
