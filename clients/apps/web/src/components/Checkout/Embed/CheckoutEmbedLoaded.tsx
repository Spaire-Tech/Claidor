'use client'

import { ClaidorEmbedCheckout } from '@claidor/checkout/embed'
import type { CheckoutPublic } from '@spaire/sdk/models/components/checkoutpublic'
import { useEffect } from 'react'

interface CheckoutEmbedLoadedProps {
  checkout: CheckoutPublic
}

const CheckoutEmbedLoaded: React.FC<
  React.PropsWithChildren<CheckoutEmbedLoadedProps>
> = ({ checkout }) => {
  useEffect(() => {
    if (!checkout.embedOrigin) {
      return
    }
    ClaidorEmbedCheckout.postMessage({ event: 'loaded' }, checkout.embedOrigin)
  }, [])

  return null
}

export default CheckoutEmbedLoaded
