'use client'

import { api } from '@/utils/client'
import { enums } from '@spaire/client'
import CountryPicker from '@spaire/ui/components/atoms/CountryPicker'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@spaire/ui/components/atoms/Tabs'
import { formatCurrency } from '@spaire/currency'
import { useCallback, useEffect, useState } from 'react'

interface TaxPreviewResult {
  subtotal: number
  tax_amount: number
  total: number
  currency: string
  quantity: number
  tax_rate: { display_name: string; percentage: number | null } | null
  taxability_reason: string | null
}

interface ProductPreviewPanelProps {
  /** Price amount in smallest unit (e.g. cents) */
  priceAmount: number | null
  currency: string
  recurringInterval: string | null
  recurringIntervalCount: number | null
  allPrices?: { currency: string; amount: number | null; amountType: string }[]
}

const fmt = formatCurrency('standard')
const formatAmount = (amount: number, currency: string): string =>
  fmt(amount, currency.toLowerCase())

const intervalLabel = (
  interval: string | null,
  count: number | null,
): string => {
  if (!interval) return ''
  if (count && count > 1) return `every ${count} ${interval}s`
  return `per ${interval}`
}

const US_STATES: [string, string][] = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
  ['DC', 'District of Columbia'],
]

const CA_PROVINCES: [string, string][] = [
  ['AB', 'Alberta'],
  ['BC', 'British Columbia'],
  ['MB', 'Manitoba'],
  ['NB', 'New Brunswick'],
  ['NL', 'Newfoundland and Labrador'],
  ['NS', 'Nova Scotia'],
  ['ON', 'Ontario'],
  ['PE', 'Prince Edward Island'],
  ['QC', 'Quebec'],
  ['SK', 'Saskatchewan'],
]

export const ProductPreviewPanel = ({
  priceAmount,
  currency,
  recurringInterval,
  recurringIntervalCount,
  allPrices = [],
}: ProductPreviewPanelProps) => {
  const [quantity, setQuantity] = useState(1)
  // Default to GB so the preview shows UK tax immediately
  const [country, setCountry] = useState<string>('GB')
  const [state, setState] = useState<string>('')
  const [preview, setPreview] = useState<TaxPreviewResult | null>(null)
  const [loading, setLoading] = useState(false)

  // Track which currency is selected in the preview
  const [selectedCurrency, setSelectedCurrency] = useState<string>(currency)

  // When allPrices changes (new currencies added), keep selectedCurrency valid
  useEffect(() => {
    if (allPrices.length > 0 && !allPrices.some((p) => p.currency === selectedCurrency)) {
      setSelectedCurrency(allPrices[0].currency)
    }
  }, [allPrices, selectedCurrency])

  // Resolve the active price amount for the selected currency
  const activePriceEntry = allPrices.find((p) => p.currency === selectedCurrency)
  const activeCurrency = activePriceEntry?.currency ?? currency
  const activeAmount = activePriceEntry?.amount ?? (activeCurrency === currency ? priceAmount : null)
  const effectiveAmount = activeAmount ?? 0

  const handleCountryChange = (value: string) => {
    setCountry(value)
    setState('')
  }

  const fetchPreview = useCallback(async () => {
    if (!country || effectiveAmount <= 0) {
      setPreview(null)
      return
    }

    setLoading(true)
    try {
      const { data } = await (api as any).POST('/v1/products/tax-preview', {
        body: {
          amount: effectiveAmount,
          currency: activeCurrency.toLowerCase(),
          country: country.toUpperCase(),
          quantity,
          state: state || undefined,
        },
      })
      if (data) {
        setPreview(data as TaxPreviewResult)
      }
    } catch {
      setPreview(null)
    } finally {
      setLoading(false)
    }
  }, [effectiveAmount, activeCurrency, country, quantity, state])

  useEffect(() => {
    fetchPreview()
  }, [fetchPreview])

  // Reset preview when currency changes
  useEffect(() => {
    setPreview(null)
  }, [selectedCurrency])

  const multipleCurrencies = allPrices.length > 1

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Preview
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Estimate totals based on pricing model, unit quantity, and tax.
        </p>
      </div>

      {/* Currency tabs — only shown when multiple currencies */}
      {multipleCurrencies && (
        <Tabs value={selectedCurrency} onValueChange={setSelectedCurrency}>
          <TabsList>
            {allPrices.map((p) => (
              <TabsTrigger key={p.currency} value={p.currency}>
                {p.currency.toUpperCase()}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Unit quantity
          </label>
          <Input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => {
              const v = parseInt(e.target.value)
              if (!isNaN(v) && v >= 1) setQuantity(v)
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700">
            Location
          </label>
          <CountryPicker
            allowedCountries={enums.addressInputCountryValues}
            value={country || undefined}
            onChange={handleCountryChange}
          />
        </div>

        {country === 'US' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              State
            </label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger>
                <SelectValue placeholder="Select state" />
              </SelectTrigger>
              <SelectContent>
                {US_STATES.map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {country === 'CA' && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">
              Province
            </label>
            <Select value={state} onValueChange={setState}>
              <SelectTrigger>
                <SelectValue placeholder="Select province" />
              </SelectTrigger>
              <SelectContent>
                {CA_PROVINCES.map(([code, label]) => (
                  <SelectItem key={code} value={code}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {country && (
        <div className="flex flex-col gap-4 border-t border-gray-200 pt-4">
          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
          ) : (
            <>
              <p className="text-sm font-medium text-gray-900">
                <span className="text-blue-500">{quantity}</span>
                {' × '}
                <span className="text-blue-500">
                  {formatAmount(effectiveAmount, activeCurrency)}
                </span>
                {' = '}
                <span className="font-semibold text-blue-500">
                  {formatAmount(effectiveAmount * quantity, activeCurrency)}
                </span>
              </p>

              <div className="border-t border-gray-200" />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Subtotal
                  </span>
                  <span className="font-medium text-gray-900">
                    {preview
                      ? formatAmount(preview.subtotal, activeCurrency)
                      : formatAmount(effectiveAmount * quantity, activeCurrency)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    {'ⓘ '}
                    {preview && preview.tax_rate
                      ? `${preview.tax_rate.display_name}${preview.tax_rate.percentage !== null ? ` ${preview.tax_rate.percentage}%` : ''}`
                      : 'Tax'}
                  </span>
                  <span className="font-medium text-gray-900">
                    {preview && preview.tax_amount > 0
                      ? formatAmount(preview.tax_amount, activeCurrency)
                      : '—'}
                  </span>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold text-gray-900">
                        Total
                        {recurringInterval
                          ? ` ${intervalLabel(recurringInterval, recurringIntervalCount)}`
                          : ''}
                      </span>
                      {recurringInterval && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Billed at the start of the period
                        </p>
                      )}
                    </div>
                    <span className="text-base font-semibold text-gray-900">
                      {preview
                        ? formatAmount(preview.total, activeCurrency)
                        : formatAmount(effectiveAmount * quantity, activeCurrency)}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
