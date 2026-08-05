import type { CheckoutProduct } from '@spaire/sdk/models/components/checkoutproduct'
import type { CheckoutPublic } from '@spaire/sdk/models/components/checkoutpublic'
import type { LegacyRecurringProductPrice } from '@spaire/sdk/models/components/legacyrecurringproductprice'
import type { ProductPrice } from '@spaire/sdk/models/components/productprice'

interface ProductCheckoutMixin {
  product_id: string
  product: CheckoutProduct
  productPriceId: string
  productPrice: ProductPrice | LegacyRecurringProductPrice | null
  prices: { [k: string]: Array<ProductPrice | LegacyRecurringProductPrice> }
}

export type ProductCheckoutPublic = CheckoutPublic & ProductCheckoutMixin

export const hasProductCheckout = (
  checkout: CheckoutPublic,
): checkout is ProductCheckoutPublic => {
  return checkout.product !== null && checkout.prices !== null
}

/**
 * Enriches a CheckoutPublic with a derived productPrice.
 *
 * The Spaire SDK strips `product_price` from the backend response (it's not
 * in the Zod schema), so we derive it from `prices[productId]`. For seat-based
 * products there is exactly one price per product, so index [0] is always
 * correct. For legacy-recurring products with multiple prices the currently
 * selected price is also the first entry returned by the backend for that
 * product.
 */
export const enrichCheckout = (
  checkout: CheckoutPublic,
): ProductCheckoutPublic | null => {
  if (!checkout.product || !checkout.prices) return null
  const productId = checkout.productId
  const productPrices = productId ? (checkout.prices[productId] ?? []) : []
  const productPrice = productPrices[0] ?? null
  return {
    ...checkout,
    product_id: productId ?? '',
    productPriceId: productPrice?.id ?? '',
    productPrice,
    prices: checkout.prices,
  } as ProductCheckoutPublic
}
