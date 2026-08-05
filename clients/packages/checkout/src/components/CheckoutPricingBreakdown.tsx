'use client'

import { formatCurrency } from '@spaire/currency'
import type { CheckoutPublic } from '@spaire/sdk/models/components/checkoutpublic'
import { cn } from '@spaire/ui/lib/utils'
import { PropsWithChildren, useMemo } from 'react'
import { hasProductCheckout } from '../guards'
import { getDiscountDisplay } from '../utils/discount'
import { getMeteredPrices, isLegacyRecurringPrice } from '../utils/product'
import AmountLabel from './AmountLabel'
import MeteredPriceLabel from './MeteredPriceLabel'

const DetailRow = ({
  title,
  emphasis,
  className,
  children,
}: PropsWithChildren<{
  title: string
  emphasis?: boolean
  className?: string
}>) => {
  return (
    <div
      className={cn(
        'flex flex-row items-start justify-between gap-x-8',
        emphasis ? 'font-medium' : ' text-gray-500',
        className,
      )}
    >
      <span className="min-w-0 truncate">{title}</span>
      <span className="shrink-0">{children}</span>
    </div>
  )
}

export interface CheckoutPricingBreakdownProps {
  checkout: CheckoutPublic
}

const formatTotalLabel = (
  interval: string | null | undefined,
  intervalCount: number | null | undefined,
): string => {
  if (!interval) return 'Total'
  const count = intervalCount ?? 1
  switch (interval) {
    case 'day':
      return count === 1 ? 'Every day' : `Every ${count} days`
    case 'week':
      return count === 1 ? 'Every week' : `Every ${count} weeks`
    case 'month':
      return count === 1 ? 'Every month' : `Every ${count} months`
    case 'year':
      return count === 1 ? 'Every year' : `Every ${count} years`
    default:
      return 'Total'
  }
}

const CheckoutPricingBreakdown = ({
  checkout,
}: CheckoutPricingBreakdownProps) => {
  const interval = hasProductCheckout(checkout)
    ? isLegacyRecurringPrice(checkout.productPrice!)
      ? checkout.productPrice!.recurringInterval
      : checkout.product.recurringInterval
    : null
  const intervalCount = hasProductCheckout(checkout)
    ? checkout.product.recurringIntervalCount
    : null

  const { product, prices } = checkout
  const meteredPrices = useMemo(
    () => (product && prices ? getMeteredPrices(prices[product.id] as any) : []),
    [product, prices],
  )

  const totalLabel = formatTotalLabel(interval, intervalCount)

  if (checkout.isFreeProductPrice) {
    return null
  }

  return (
    <div className="flex flex-col gap-y-2">
      {checkout.currency ? (
        <>
          <DetailRow title="Subtotal" className="text-gray-600">
            <AmountLabel
              amount={checkout.amount}
              currency={checkout.currency}
              interval={interval}
              intervalCount={intervalCount}
              mode="standard"
            />
          </DetailRow>

          {checkout.discount && (
            <DetailRow
              title={`${checkout.discount.name}${checkout.discount.type === 'percentage' ? ` (${getDiscountDisplay(checkout.discount as any)})` : ''}`}
              className="text-gray-600"
            >
              {formatCurrency('standard')(
                -checkout.discountAmount,
                checkout.currency,
              )}
            </DetailRow>
          )}

          <DetailRow title="Taxes" className="text-gray-600">
            {checkout.taxAmount !== null
              ? formatCurrency('standard')(
                  checkout.taxAmount,
                  checkout.currency,
                )
              : '—'}
          </DetailRow>

          <DetailRow title={totalLabel} emphasis>
            <AmountLabel
              amount={checkout.totalAmount}
              currency={checkout.currency}
              interval={interval}
              intervalCount={intervalCount}
              mode="standard"
            />
          </DetailRow>

          {meteredPrices.length > 0 && (
            <DetailRow title="Additional metered usage" emphasis />
          )}
          {meteredPrices.map((meteredPrice) => (
            <DetailRow
              title={meteredPrice.meter.name}
              key={meteredPrice.id}
              className="text-gray-600"
            >
              <MeteredPriceLabel price={meteredPrice} />
            </DetailRow>
          ))}
        </>
      ) : (
        <span>Free</span>
      )}

      {(checkout.trialEnd ||
        (checkout.activeTrialInterval &&
          checkout.activeTrialIntervalCount)) && (
        <div className=" mt-3 border-t border-gray-300 pt-4">
          {checkout.activeTrialInterval &&
            checkout.activeTrialIntervalCount && (
              <DetailRow
                emphasis
                title={
                  checkout.activeTrialInterval === 'year'
                    ? `${checkout.activeTrialIntervalCount} year${checkout.activeTrialIntervalCount !== 1 ? 's' : ''} free`
                    : checkout.activeTrialInterval === 'month'
                      ? `${checkout.activeTrialIntervalCount} month${checkout.activeTrialIntervalCount !== 1 ? 's' : ''} free`
                      : checkout.activeTrialInterval === 'week'
                        ? `${checkout.activeTrialIntervalCount} week${checkout.activeTrialIntervalCount !== 1 ? 's' : ''} free`
                        : `${checkout.activeTrialIntervalCount} day${checkout.activeTrialIntervalCount !== 1 ? 's' : ''} free`
                }
              >
                <span>Free</span>
              </DetailRow>
            )}
          {checkout.trialEnd && (
            <span className=" text-sm text-gray-500">
              Trial ends{' '}
              {new Intl.DateTimeFormat('en-US', {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              }).format(new Date(checkout.trialEnd))}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default CheckoutPricingBreakdown
