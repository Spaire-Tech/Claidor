'use client'

import Checkout from '@/components/Checkout/Checkout'
import CheckoutLayout from '@/components/Checkout/CheckoutLayout'
import { useCheckout } from '@spaire/checkout/providers'

const ClientPage = ({
  embed,
  theme,
  locale,
  preview,
  showLogo,
  showMedia,
  showDescription,
}: {
  embed: boolean
  theme?: 'light' | 'dark'
  locale?: string
  preview?: boolean
  showLogo?: boolean
  showMedia?: boolean
  showDescription?: boolean
}) => {
  const { checkout } = useCheckout()

  return (
    <CheckoutLayout checkout={checkout} embed={embed} theme={theme}>
      <Checkout
        embed={embed}
        theme={theme}
        locale={locale}
        preview={preview}
        showLogo={showLogo}
        showMedia={showMedia}
        showDescription={showDescription}
      />
    </CheckoutLayout>
  )
}

export default ClientPage
