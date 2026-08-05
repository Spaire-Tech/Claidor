'use client'

import type { ProductCheckoutPublic } from '../guards'
import { isLegacyRecurringPrice } from '../utils/product'
import AmountLabel from './AmountLabel'

export interface CheckoutHeroPriceProps {
  checkout: ProductCheckoutPublic
}

const CheckoutHeroPrice = ({ checkout }: CheckoutHeroPriceProps) => {
  const { product, productPrice } = checkout

  if (!productPrice) return null

  return (
    <AmountLabel
      amount={checkout.totalAmount ?? checkout.netAmount ?? 0}
      currency={checkout.currency ?? productPrice.priceCurrency}
      interval={
        isLegacyRecurringPrice(productPrice)
          ? productPrice.recurringInterval
          : product.recurringInterval
      }
      intervalCount={product.recurringIntervalCount}
      mode="standard"
    />
  )
}

export default CheckoutHeroPrice
