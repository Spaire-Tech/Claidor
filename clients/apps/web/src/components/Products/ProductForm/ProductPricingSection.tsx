'use client'

import CreateMeterModalContent from '@/components/Meter/CreateMeterModalContent'
import MeterSelector from '@/components/Meter/MeterSelector'
import SetupWithClaudeModalContent from '@/components/Meter/SetupWithClaudeModalContent'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { SpinnerNoMargin } from '@/components/Shared/Spinner'
import { TrialConfigurationForm } from '@/components/TrialConfiguration/TrialConfigurationForm'
import { useMeters } from '@/hooks/queries/meters'
import {
  isLegacyRecurringPrice,
  isMeteredPrice,
  isStaticPrice,
} from '@/utils/product'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import { enums, schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import MoneyInput from '@spaire/ui/components/atoms/MoneyInput'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import ShadowBox from '@spaire/ui/components/atoms/ShadowBox'
import { Tabs, TabsList, TabsTrigger } from '@spaire/ui/components/atoms/Tabs'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { Label } from '@spaire/ui/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@spaire/ui/components/ui/radio-group'
import { PlusIcon } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'
import { Section } from '../../Layout/Section'
import { ProductFormType } from './ProductForm'
import UnitAmountInput from './UnitAmountInput'

type ProductPrice = schemas['ProductPrice']
type ProductPriceCreate = schemas['ProductCreate']['prices'][number]

// Price can be either a create schema or an existing price reference
type AnyPrice = NonNullable<ProductFormType['prices']>[number]
type PriceEntry = { price: AnyPrice; index: number }

// Type guard to check if price has currency (is a full price, not just an id reference)
const hasPriceCurrency = (
  price: AnyPrice,
): price is AnyPrice & { price_currency: string } => {
  return 'price_currency' in price && typeof price.price_currency === 'string'
}

// Helper to group prices by currency
const groupPricesByCurrency = (
  prices: ProductFormType['prices'],
): Map<string, PriceEntry[]> => {
  const grouped = new Map<string, PriceEntry[]>()
  if (!prices) return grouped
  for (let index = 0; index < prices.length; index++) {
    const price = prices[index]
    if (hasPriceCurrency(price)) {
      const currency = price.price_currency || 'usd'
      if (!grouped.has(currency)) {
        grouped.set(currency, [])
      }
      grouped.get(currency)!.push({ price, index })
    }
  }
  return grouped
}

// Get currencies that are currently in use
const getActiveCurrencies = (prices: ProductFormType['prices']): string[] => {
  const currencies = new Set<string>()
  if (!prices) return []
  for (const price of prices) {
    if (hasPriceCurrency(price)) {
      currencies.add(price.price_currency || 'usd')
    }
  }
  return Array.from(currencies)
}

export interface ProductPriceFixedItemProps {
  index: number
  currency: string
  currencyControl?: React.ReactNode
}

export const ProductPriceFixedItem: React.FC<ProductPriceFixedItemProps> = ({
  index,
  currency,
  currencyControl,
}) => {
  const { control, setValue } = useFormContext<ProductFormType>()

  return (
    <>
      <FormField
        control={control}
        name={`prices.${index}.price_amount`}
        rules={{
          required: 'This field is required',
          min: { value: 50, message: 'Price must be greater than 0.5' },
        }}
        render={({ field }) => {
          return (
            <FormItem className="grow">
              <div className="flex items-center gap-2">
                <FormControl>
                  <div ref={field.ref} tabIndex={-1} className="flex-1">
                    <MoneyInput
                      name={field.name}
                      currency={currency}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        setValue(`prices.${index}.id`, '')
                      }}
                      placeholder={0}
                    />
                  </div>
                </FormControl>
                {currencyControl && (
                  <div className="shrink-0">{currencyControl}</div>
                )}
              </div>
              <FormMessage />
            </FormItem>
          )
        }}
      />
    </>
  )
}

export interface ProductPriceCustomItemProps {
  index: number
  currency: string
  currencyControl?: React.ReactNode
}

export const ProductPriceCustomItem: React.FC<ProductPriceCustomItemProps> = ({
  index,
  currency,
  currencyControl,
}) => {
  const { control, setValue, getValues } = useFormContext<ProductFormType>()

  const validatePWYWAmount = (
    value: number | null | undefined,
  ): string | true => {
    if (value == null) {
      return 'This field is required'
    }

    if (value === 0 || value >= 50) {
      return true
    }

    return 'Must be 0 (for free) or at least 0.50'
  }

  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {currencyControl && <div>{currencyControl}</div>}
      <div className="flex flex-row gap-4 gap-x-6">
        <FormField
          control={control}
          name={`prices.${index}.minimum_amount`}
          rules={{
            validate: validatePWYWAmount,
          }}
          render={({ field }) => {
            return (
              <FormItem className="flex flex-1 flex-col gap-0.5">
                <FormLabel>Minimum amount</FormLabel>
                <FormControl>
                  <div ref={field.ref} tabIndex={-1}>
                    <MoneyInput
                      name={field.name}
                      currency={currency}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        setValue(`prices.${index}.id`, '')
                      }}
                      placeholder={1000}
                    />
                  </div>
                </FormControl>
                <FormDescription className="text-muted-foreground text-xs">
                  Set to 0 to allow free contributions
                </FormDescription>
                <FormMessage />
              </FormItem>
            )
          }}
        />
        <FormField
          control={control}
          name={`prices.${index}.preset_amount`}
          rules={{
            deps: [`prices.${index}.minimum_amount`],
            validate: (value: number | null | undefined): string | true => {
              const pwywResult = validatePWYWAmount(value)

              if (pwywResult !== true) {
                return pwywResult
              }

              const minimumAmount = getValues(`prices.${index}.minimum_amount`)

              if (
                value != null &&
                minimumAmount != null &&
                value < minimumAmount
              ) {
                return 'Suggested amount cannot be less than minimum amount'
              }

              return true
            },
            max: {
              value: 1_000_000,
              message: 'Price cannot be greater than 10,000',
            },
          }}
          render={({ field }) => {
            return (
              <FormItem className="flex flex-1 flex-col gap-0.5">
                <FormLabel>Suggested amount</FormLabel>
                <FormControl>
                  <div ref={field.ref} tabIndex={-1}>
                    <MoneyInput
                      name={field.name}
                      currency={currency}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        setValue(`prices.${index}.id`, '')
                      }}
                      placeholder={5000}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )
          }}
        />
      </div>
    </div>
  )
}

export interface ProductPriceSeatBasedItemProps {
  index: number
  currency: string
  currencyControl?: React.ReactNode
}

export const ProductPriceSeatBasedItem: React.FC<
  ProductPriceSeatBasedItemProps
> = ({ index, currency, currencyControl }) => {
  const { control, setValue, watch } = useFormContext<ProductFormType>()
  const { fields, append, remove } = useFieldArray({
    control,
    name: `prices.${index}.seat_tiers.tiers` as const,
  })

  const tiers = watch(`prices.${index}.seat_tiers.tiers`)

  const addTier = useCallback(() => {
    const lastTier = tiers?.[tiers.length - 1]
    const minSeats = lastTier?.max_seats ? lastTier.max_seats + 1 : 1

    // Update the current last tier to have a specific max_seats value
    if (tiers && tiers.length > 0) {
      const lastTierIndex = tiers.length - 1
      setValue(
        `prices.${index}.seat_tiers.tiers.${lastTierIndex}.max_seats`,
        minSeats - 1,
        { shouldValidate: true },
      )
    }

    // Add the new tier with max_seats: null (unlimited)
    // The LAST tier should ALWAYS have null max_seats
    append({
      min_seats: minSeats,
      max_seats: null,
      price_per_seat: 0,
    })
    setValue(`prices.${index}.id`, '')
  }, [tiers, append, setValue, index])

  const removeTier = useCallback(
    (tierIndex: number) => {
      remove(tierIndex)
      setValue(`prices.${index}.id`, '')

      // If only one tier remains after removal, set its max_seats to null (unlimited)
      if (tiers && tiers.length === 2) {
        // After removal there will be 1 tier left
        const remainingTierIndex = tierIndex === 0 ? 1 : 0
        setValue(
          `prices.${index}.seat_tiers.tiers.${remainingTierIndex}.max_seats`,
          null,
          { shouldValidate: true },
        )
      }
    },
    [remove, setValue, index, tiers],
  )

  const hasSingleTier = fields.length === 1

  const getTierTitle = (
    tierIndex: number,
    tier: { min_seats?: number; max_seats?: number | null } | undefined,
  ) => {
    if (!tier) return `Tier ${tierIndex + 1}`

    const isLast = tierIndex === fields.length - 1
    const range = isLast
      ? `${tier.min_seats}+ seats`
      : `${tier.min_seats}–${tier.max_seats || tier.min_seats} seats`

    return `Tier ${tierIndex + 1} (${range})`
  }

  return (
    <div className="flex flex-col gap-3">
      {currencyControl && <div>{currencyControl}</div>}
      {fields.map((field, tierIndex) => {
        const isLast = tierIndex === fields.length - 1
        const isFirst = tierIndex === 0
        const currentTier = tiers?.[tierIndex]

        return (
          <div
            key={field.id}
            className=" group relative rounded-2xl border border-gray-200 bg-white"
            role="group"
            aria-labelledby={`tier-title-${index}-${tierIndex}`}
          >
            <div className="flex items-center justify-between p-4">
              <span
                id={`tier-title-${index}-${tierIndex}`}
                className="text-sm font-medium text-gray-900"
              >
                {getTierTitle(tierIndex, currentTier)}
              </span>
              {!isFirst && (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className=" -mr-2 h-7 w-7 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-gray-600"
                  onClick={() => removeTier(tierIndex)}
                  aria-label={`Remove ${getTierTitle(tierIndex, currentTier)}`}
                >
                  <CloseOutlined className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 px-4 pb-4">
              <FormField
                control={control}
                name={
                  `prices.${index}.seat_tiers.tiers.${tierIndex}.min_seats` as const
                }
                rules={{
                  required: 'Required',
                  min: { value: 1, message: 'Must be at least 1' },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className=" text-xs text-gray-600">
                      From
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        min={1}
                        disabled={!isFirst}
                        onChange={(e) => {
                          field.onChange(parseInt(e.target.value) || 1)
                          setValue(`prices.${index}.id`, '')
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={
                  `prices.${index}.seat_tiers.tiers.${tierIndex}.max_seats` as const
                }
                rules={{
                  validate: (value) => {
                    if (isLast) return true // Last tier is always unlimited (null)

                    const minSeats = tiers?.[tierIndex]?.min_seats

                    // max_seats must exist for non-last tiers
                    if (value === null || value === undefined) {
                      return 'Max seats is required'
                    }

                    // max_seats must be >= min_seats
                    if (minSeats && value < minSeats) {
                      return `Max seats must be at least ${minSeats}`
                    }

                    return true
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className=" text-xs text-gray-600">
                      To
                    </FormLabel>
                    <FormControl>
                      {isLast ? (
                        <div className="  flex h-9 w-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 px-2.5 text-sm font-medium text-gray-500">
                          ∞
                        </div>
                      ) : (
                        <Input
                          {...field}
                          value={field.value ?? ''}
                          type="number"
                          min={tiers?.[tierIndex]?.min_seats ?? 1}
                          onChange={(e) => {
                            const value = e.target.value
                              ? parseInt(e.target.value)
                              : null
                            field.onChange(value)
                            setValue(`prices.${index}.id`, '')

                            // Update next tier's min_seats immediately
                            if (
                              value &&
                              tiers &&
                              tierIndex < tiers.length - 1
                            ) {
                              setValue(
                                `prices.${index}.seat_tiers.tiers.${tierIndex + 1}.min_seats`,
                                value + 1,
                                { shouldValidate: true },
                              )
                            }
                          }}
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name={
                  `prices.${index}.seat_tiers.tiers.${tierIndex}.price_per_seat` as const
                }
                rules={{
                  required: 'This field is required',
                  min: {
                    value: 0,
                    message: 'Price must be greater than or equal to 0',
                  },
                }}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className=" text-xs text-gray-600">
                      Price per seat
                    </FormLabel>
                    <FormControl>
                      <div ref={field.ref} tabIndex={-1}>
                        <MoneyInput
                          name={field.name}
                          currency={currency}
                          value={field.value}
                          onChange={(v) => {
                            field.onChange(v)
                            setValue(`prices.${index}.id`, '')
                          }}
                          placeholder={1000}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        )
      })}

      <FormField
        control={control}
        name={`prices.${index}.seat_tiers.tiers` as const}
        render={() => (
          <FormItem>
            <FormMessage />
          </FormItem>
        )}
      />

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addTier}
        className="self-start"
      >
        {hasSingleTier ? 'Add Volume Tier' : 'Add Another Tier'}
      </Button>
    </div>
  )
}

export interface ProductPriceMeteredUnitItemProps {
  organization: schemas['Organization']
  index: number
  currency: string
  currencyControl?: React.ReactNode
}

export const ProductPriceMeteredUnitItem: React.FC<
  ProductPriceMeteredUnitItemProps
> = ({ organization, index, currency, currencyControl }) => {
  const { control, setValue } = useFormContext<ProductFormType>()

  const { data: meters } = useMeters(organization.id, {
    sorting: ['name'],
    limit: 30,
    is_archived: false,
  })

  const {
    isShown: isCreateMeterModalShown,
    show: showCreateMeterModal,
    hide: hideCreateMeterModal,
  } = useModal(false)

  const {
    isShown: isClaudeModalShown,
    show: showClaudeModal,
    hide: hideClaudeModal,
  } = useModal(false)

  const onSelectMeter = useCallback(
    (meter: schemas['Meter']) => {
      setValue(`prices.${index}.meter_id`, meter.id)
      setValue(`prices.${index}.id`, '')
    },
    [setValue, index],
  )

  if (!meters) {
    return (
      <div className="flex w-full items-center justify-center py-4">
        <SpinnerNoMargin />
      </div>
    )
  }

  return (
    <>
      {currencyControl && <div className="mb-1">{currencyControl}</div>}
      {meters.items.length === 0 ? (
        <div className="flex flex-col gap-y-2">
          <Button
            onClick={(e) => {
              e.preventDefault()
              showClaudeModal()
            }}
            size="sm"
          >
            Set up with Claude
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault()
              showCreateMeterModal()
            }}
            size="sm"
            variant="ghost"
          >
            Create Manually
          </Button>
        </div>
      ) : (
        <>
          <FormField
            control={control}
            name={`prices.${index}.meter_id`}
            rules={{
              required: 'This field is required',
            }}
            render={({ field }) => {
              return (
                <FormItem>
                  <div className="flex flex-row items-center justify-between gap-x-2">
                    <FormLabel>Meter</FormLabel>
                    <div className="flex items-center gap-x-2">
                      <button
                        type="button"
                        className="flex flex-row items-center gap-x-1 text-sm font-medium text-blue-500 hover:text-blue-600 "
                        onClick={(e) => {
                          e.preventDefault()
                          showClaudeModal()
                        }}
                      >
                        Set up with Claude
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        className="flex flex-row items-center gap-x-1 text-sm font-medium text-gray-500"
                        onClick={(e) => {
                          e.preventDefault()
                          showCreateMeterModal()
                        }}
                      >
                        <PlusIcon className="h-4 w-4" />
                        Add Meter
                      </button>
                    </div>
                  </div>
                  <FormControl>
                    <MeterSelector
                      organizationId={organization.id}
                      value={field.value || null}
                      onChange={(meterId) => {
                        field.onChange(meterId ?? '')
                        setValue(`prices.${index}.id`, '')
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )
            }}
          />
          <FormField
            control={control}
            name={`prices.${index}.unit_amount`}
            rules={{
              min: 0,
              required: 'This field is required',
            }}
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Amount per unit</FormLabel>
                  <FormControl>
                    <UnitAmountInput
                      {...field}
                      name={field.name}
                      currency={currency}
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v)
                        setValue(`prices.${index}.id`, '')
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )
            }}
          />
          <FormField
            control={control}
            name={`prices.${index}.cap_amount`}
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Cap amount</FormLabel>
                  <FormControl>
                    <MoneyInput
                      {...field}
                      name={field.name}
                      currency={currency}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v)
                        setValue(`prices.${index}.id`, '')
                      }}
                      placeholder={10000}
                    />
                  </FormControl>
                  <FormDescription>
                    Optional maximum amount that can be charged, regardless of
                    the number of units consumed.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )
            }}
          />
        </>
      )}
      <InlineModal
        isShown={isCreateMeterModalShown}
        hide={hideCreateMeterModal}
        modalContent={
          <CreateMeterModalContent
            organization={organization}
            onSelectMeter={onSelectMeter}
            hideModal={hideCreateMeterModal}
          />
        }
      />
      <InlineModal
        isShown={isClaudeModalShown}
        hide={hideClaudeModal}
        modalContent={
          <SetupWithClaudeModalContent hideModal={hideClaudeModal} />
        }
      />
    </>
  )
}

interface ProductPriceItemProps {
  organization: schemas['Organization']
  index: number
  currency: string
  onRemove: (index: number) => void
  onAmountTypeChange: (
    index: number,
    amountType: ProductPriceCreate['amount_type'],
  ) => void
  canRemove: boolean
  currencyControl?: React.ReactNode
  // Optional whitelist of price amount types to render as radio options.
  // Used by the course wizard to hide "Pay what you want" and "Per seat".
  allowedAmountTypes?: ProductPriceCreate['amount_type'][]
}

const ProductPriceItem: React.FC<ProductPriceItemProps> = ({
  organization,
  index,
  currency,
  onRemove,
  onAmountTypeChange,
  canRemove,
  currencyControl,
  allowedAmountTypes,
}) => {
  const { register, control, watch } = useFormContext<ProductFormType>()
  const amountType = watch(`prices.${index}.amount_type`)
  const recurringInterval = watch('recurring_interval')

  const prices = watch('prices')
  // Find static price index within the same currency
  const pricesForCurrency = (prices || []).filter(
    (p) => hasPriceCurrency(p) && p.price_currency === currency,
  )
  const staticPriceForCurrency = pricesForCurrency.find((p) =>
    isStaticPrice(p as ProductPrice),
  )
  const currentPrice = prices?.[index]
  const isCurrentPriceStatic =
    currentPrice && isStaticPrice(currentPrice as ProductPrice)
  const hasOtherStaticPrice = staticPriceForCurrency && !isCurrentPriceStatic

  const priceTypeOptions = (
    [
      {
        value: 'fixed',
        title: 'Fixed price',
        description: 'Charge a set amount',
      },
      {
        value: 'free',
        title: 'Free',
        description: 'No charge. Give it away.',
      },
      {
        value: 'custom',
        title: 'Pay what you want',
        description: 'Let buyers choose their price',
      },
      {
        value: 'seat_based',
        title: 'Per seat',
        description: 'Price scales with seats or licenses',
      },
      ...(recurringInterval !== null
        ? [
            {
              value: 'metered_unit',
              title: 'Usage-based',
              description: 'Charge based on consumption',
            },
          ]
        : []),
    ] as const
  ).filter((opt) =>
    allowedAmountTypes
      ? allowedAmountTypes.includes(
          opt.value as ProductPriceCreate['amount_type'],
        )
      : true,
  )

  return (
    <div className="flex flex-col gap-6">
      <input type="hidden" {...register(`prices.${index}.id`)} />
      <FormField
        control={control}
        name={`prices.${index}.amount_type`}
        rules={{
          required: 'Please select a price type',
        }}
        render={({ field }) => {
          return (
            <FormItem>
              <div className="@container">
                <RadioGroup
                  value={field.value ?? ''}
                  onValueChange={(v) => {
                    if (hasOtherStaticPrice) return
                    field.onChange(v)
                    onAmountTypeChange(
                      index,
                      v as ProductPriceCreate['amount_type'],
                    )
                  }}
                  className="grid grid-cols-2 gap-4"
                >
                  {priceTypeOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`price-type-${index}-${option.value}`}
                      className={twMerge(
                        'flex flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors',
                        hasOtherStaticPrice
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer',
                        field.value === option.value
                          ? ' bg-gray-50'
                          : '    border-gray-100 text-gray-500 hover:border-gray-200',
                      )}
                    >
                      <div className="flex items-center gap-2.5 font-medium">
                        <RadioGroupItem
                          value={option.value}
                          id={`price-type-${index}-${option.value}`}
                          disabled={!!hasOtherStaticPrice}
                          ref={field.ref}
                        />
                        {option.title}
                      </div>
                      <p className=" text-sm text-gray-500">
                        {option.description}
                      </p>
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <FormMessage />
            </FormItem>
          )
        }}
      />
      {amountType && amountType !== 'free' && (
        <div className=" flex flex-col gap-3 rounded-2xl border border-gray-200 p-4">
          {amountType === 'fixed' && (
            <ProductPriceFixedItem
              index={index}
              currency={currency}
              currencyControl={currencyControl}
            />
          )}
          {amountType === 'custom' && (
            <ProductPriceCustomItem index={index} currency={currency} currencyControl={currencyControl} />
          )}
          {amountType === 'seat_based' && (
            <ProductPriceSeatBasedItem index={index} currency={currency} currencyControl={currencyControl} />
          )}
          {amountType === 'metered_unit' && (
            <ProductPriceMeteredUnitItem
              organization={organization}
              index={index}
              currency={currency}
              currencyControl={currencyControl}
            />
          )}
        </div>
      )}
      {canRemove && (
        <Button
          size="sm"
          variant="secondary"
          className="self-start"
          type="button"
          onClick={() => onRemove(index)}
        >
          Remove price
        </Button>
      )}
    </div>
  )
}

interface CurrencyTabsProps {
  activeCurrencies: string[]
  selectedCurrency: string
  onSelectCurrency: (currency: string) => void
  onAddCurrency: (currency: string) => void
  onRemoveCurrency: (currency: string) => void
  defaultCurrency: string
}

const CurrencyTabs: React.FC<CurrencyTabsProps> = ({
  activeCurrencies,
  selectedCurrency,
  onSelectCurrency,
  onAddCurrency,
  onRemoveCurrency,
  defaultCurrency,
}) => {
  const availableCurrencies = enums.presentmentCurrencyValues.filter(
    (c: string) => !activeCurrencies.includes(c),
  )

  return (
    <div className="flex flex-row items-center gap-2">
      <Tabs value={selectedCurrency} onValueChange={onSelectCurrency}>
        <TabsList>
          {activeCurrencies.map((currency) => (
            <TabsTrigger
              key={currency}
              value={currency}
              className="flex h-8 items-center gap-1"
            >
              <span>{currency.toUpperCase()}</span>
              {currency !== defaultCurrency &&
                selectedCurrency === currency && (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveCurrency(currency)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        e.stopPropagation()
                        onRemoveCurrency(currency)
                      }
                    }}
                    className=" cursor-pointer text-gray-400 hover:text-gray-600"
                  >
                    <CloseOutlined className="h-3.5 w-3.5" />
                  </span>
                )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {availableCurrencies.length > 0 && (
        <Select onValueChange={onAddCurrency}>
          <SelectTrigger className="h-8 w-auto gap-1 border-none bg-transparent px-2 shadow-none">
            <PlusIcon className="h-3.5 w-3.5" />
            <span className="text-sm">Add Currency</span>
          </SelectTrigger>
          <SelectContent>
            {availableCurrencies.map((currency: string) => (
              <SelectItem key={currency} value={currency}>
                {currency.toUpperCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

export interface ProductPricingSectionProps {
  organization: schemas['Organization']
  className?: string
  update?: boolean
  compact?: boolean
  // Optional whitelist of price amount types to render. Defaults to all of
  // them (fixed / free / custom / seat_based / metered_unit). The course
  // wizard passes ['fixed', 'free'] to hide PWYW and Per-seat.
  allowedAmountTypes?: ProductPriceCreate['amount_type'][]
}

export const ProductPricingSection = ({
  organization,
  className,
  update,
  compact,
  allowedAmountTypes,
}: ProductPricingSectionProps) => {
  const { control, setValue, watch, getValues } =
    useFormContext<ProductFormType>()

  const pricesFieldArray = useFieldArray({
    control,
    name: 'prices',
  })

  const { fields: prices, append, remove, replace } = pricesFieldArray

  const defaultCurrency = organization.default_presentment_currency

  // Track selected currency tab
  const [selectedCurrency, setSelectedCurrency] =
    useState<string>(defaultCurrency)

  // Get active currencies from current prices
  const activeCurrencies = useMemo(() => {
    const currencies = getActiveCurrencies(prices as ProductFormType['prices'])
    // Ensure default currency is always first
    if (!currencies.includes(defaultCurrency)) {
      return [defaultCurrency, ...currencies]
    }
    return [defaultCurrency, ...currencies.filter((c) => c !== defaultCurrency)]
  }, [prices, defaultCurrency])

  // Ensure selected currency is valid - use a ref to avoid effect
  const validatedSelectedCurrency = activeCurrencies.includes(selectedCurrency)
    ? selectedCurrency
    : defaultCurrency

  const isLegacyRecurringProduct = useMemo(
    () => (prices as ProductPrice[]).some(isLegacyRecurringPrice),
    [prices],
  )

  const recurringInterval = watch('recurring_interval')
  const recurringIntervalCount = watch('recurring_interval_count')

  useEffect(() => {
    if (recurringInterval !== null) {
      if (!recurringIntervalCount) {
        setValue('recurring_interval_count', 1)
      }
      return
    }

    setValue('recurring_interval_count', null)
    const currentPrices = getValues('prices')
    if (!currentPrices) return
    const filteredPrices = currentPrices.filter(
      (price) => !isMeteredPrice(price as ProductPrice),
    )
    if (filteredPrices.length !== currentPrices.length) {
      replace(filteredPrices)
    }
  }, [recurringInterval, recurringIntervalCount, setValue, getValues, replace])

  const [productType, setProductType] = useState<'one_time' | 'recurring'>(
    recurringInterval === null ? 'one_time' : 'recurring',
  )

  useEffect(() => {
    if (productType === 'one_time') {
      setValue('recurring_interval', null)
    } else {
      if (recurringInterval === null) {
        setValue('recurring_interval', 'month')
      }

      if (!recurringIntervalCount) {
        setValue('recurring_interval_count', 1)
      }
    }
  }, [productType, recurringInterval, recurringIntervalCount, setValue])

  // Group prices by currency for display
  const pricesByCurrency = useMemo(
    () => groupPricesByCurrency(prices as ProductFormType['prices']),
    [prices],
  )

  // Get prices for the selected currency
  const pricesForSelectedCurrency = useMemo(
    () => pricesByCurrency.get(validatedSelectedCurrency) || [],
    [pricesByCurrency, validatedSelectedCurrency],
  )

  // Handle amount type change - sync across all currencies
  const handleAmountTypeChange = useCallback(
    (
      changedIndex: number,
      newAmountType: ProductPriceCreate['amount_type'],
    ) => {
      const currentPrices = getValues('prices')
      if (!currentPrices) return
      const changedPrice = currentPrices[changedIndex]
      if (!hasPriceCurrency(changedPrice)) return
      const changedCurrency = changedPrice.price_currency

      // Find corresponding prices in other currencies (same position within their currency group)
      const pricesByCurr = groupPricesByCurrency(currentPrices)
      const changedCurrencyPrices = pricesByCurr.get(changedCurrency) || []
      const positionInCurrency = changedCurrencyPrices.findIndex(
        (p) => p.index === changedIndex,
      )

      // Create new price template based on amount type
      const createPriceForCurrency = (currency: string): ProductPriceCreate => {
        const base = {
          price_currency: currency as schemas['PresentmentCurrency'],
        }
        if (newAmountType === 'fixed') {
          return { ...base, amount_type: 'fixed', price_amount: 0 }
        } else if (newAmountType === 'custom') {
          return { ...base, amount_type: 'custom', minimum_amount: 0 }
        } else if (newAmountType === 'free') {
          return { ...base, amount_type: 'free' }
        } else if (newAmountType === 'seat_based') {
          return {
            ...base,
            amount_type: 'seat_based',
            seat_tiers: {
              tiers: [{ min_seats: 1, max_seats: null, price_per_seat: 0 }],
            },
          }
        } else if (newAmountType === 'metered_unit') {
          return {
            ...base,
            amount_type: 'metered_unit',
            unit_amount: 0,
            meter_id: '',
          }
        }
        return { ...base, amount_type: 'free' }
      }

      // Update the changed price
      setValue(
        `prices.${changedIndex}`,
        createPriceForCurrency(changedCurrency),
      )
      setValue(`prices.${changedIndex}.id`, '')

      // Update corresponding prices in other currencies
      pricesByCurr.forEach((currencyPrices, currency) => {
        if (currency === changedCurrency) return
        if (positionInCurrency < currencyPrices.length) {
          const correspondingPrice = currencyPrices[positionInCurrency]
          setValue(
            `prices.${correspondingPrice.index}`,
            createPriceForCurrency(currency),
          )
          setValue(`prices.${correspondingPrice.index}.id`, '')
        }
      })
    },
    [getValues, setValue],
  )

  // Add a new currency - clone prices from default currency
  const handleAddCurrency = useCallback(
    (newCurrency: string) => {
      const currentPrices = getValues('prices')
      if (!currentPrices) return
      const defaultCurrencyPrices = currentPrices.filter(
        (p) => hasPriceCurrency(p) && p.price_currency === defaultCurrency,
      )

      // Clone each price from default currency to new currency
      defaultCurrencyPrices.forEach((price) => {
        if (!('amount_type' in price)) return

        let newPrice: ProductPriceCreate
        const baseCurrency = {
          price_currency: newCurrency as schemas['PresentmentCurrency'],
        }

        if (price.amount_type === 'fixed') {
          const sourceAmount = 'price_amount' in price ? (price.price_amount ?? 0) : 0
          newPrice = { ...baseCurrency, amount_type: 'fixed', price_amount: sourceAmount }
        } else if (price.amount_type === 'custom') {
          const sourceMin = 'minimum_amount' in price ? (price.minimum_amount ?? 0) : 0
          newPrice = {
            ...baseCurrency,
            amount_type: 'custom',
            minimum_amount: sourceMin,
          }
        } else if (price.amount_type === 'free') {
          newPrice = { ...baseCurrency, amount_type: 'free' }
        } else if (price.amount_type === 'seat_based') {
          const sourceTiers =
            'seat_tiers' in price && price.seat_tiers?.tiers
              ? price.seat_tiers.tiers
              : []
          const seatTiers = sourceTiers.map((t) => ({
            min_seats: t.min_seats,
            max_seats: t.max_seats ?? null,
            price_per_seat: 0,
          }))
          if (seatTiers.length === 0) {
            seatTiers.push({ min_seats: 1, max_seats: null, price_per_seat: 0 })
          }
          newPrice = {
            ...baseCurrency,
            amount_type: 'seat_based',
            seat_tiers: { tiers: seatTiers },
          }
        } else if (price.amount_type === 'metered_unit') {
          const meterId = 'meter_id' in price ? price.meter_id : ''
          newPrice = {
            ...baseCurrency,
            amount_type: 'metered_unit',
            unit_amount: 0,
            meter_id: meterId,
          }
        } else {
          newPrice = { ...baseCurrency, amount_type: 'free' }
        }

        append(newPrice)
      })

      setSelectedCurrency(newCurrency)
    },
    [getValues, defaultCurrency, append],
  )

  // Remove a currency - remove all prices for that currency
  const handleRemoveCurrency = useCallback(
    (currencyToRemove: string) => {
      if (currencyToRemove === defaultCurrency) return // Can't remove default

      const currentPrices = getValues('prices')
      if (!currentPrices) return
      const indicesToRemove = currentPrices
        .map((p, i) =>
          hasPriceCurrency(p) && p.price_currency === currencyToRemove ? i : -1,
        )
        .filter((i) => i !== -1)
        .reverse() // Remove from end to start to maintain indices

      indicesToRemove.forEach((i) => remove(i))
      setSelectedCurrency(defaultCurrency)
    },
    [getValues, defaultCurrency, remove],
  )

  // Add metered price for all currencies
  const handleAddMeteredPrice = useCallback(() => {
    activeCurrencies.forEach((currency) => {
      append({
        amount_type: 'metered_unit',
        price_currency: currency as schemas['PresentmentCurrency'],
        meter_id: '',
        unit_amount: 0,
      })
    })
  }, [activeCurrencies, append])

  // Handle removing a price - sync across currencies for metered prices
  const handleRemovePrice = useCallback(
    (indexToRemove: number) => {
      const currentPrices = getValues('prices')
      if (!currentPrices) return
      const priceToRemove = currentPrices[indexToRemove]

      // For metered prices, remove corresponding prices in other currencies
      if (isMeteredPrice(priceToRemove as ProductPrice)) {
        const meterId =
          'meter_id' in priceToRemove ? priceToRemove.meter_id : undefined

        // Find all metered prices with the same meter_id across currencies
        const indicesToRemove = currentPrices
          .map((p, i) =>
            'amount_type' in p &&
            p.amount_type === 'metered_unit' &&
            'meter_id' in p &&
            p.meter_id === meterId
              ? i
              : -1,
          )
          .filter((i) => i !== -1)
          .reverse()

        indicesToRemove.forEach((i) => remove(i))
      } else {
        remove(indexToRemove)
      }
    },
    [getValues, remove],
  )

  if (isLegacyRecurringProduct) {
    return (
      <Section
        title="Pricing"
        description="Set your billing cycle and pricing model"
        className={className}
        compact={compact}
      >
        <div className="prose  rounded-2xl bg-gray-100 p-6 text-sm text-gray-500">
          <p>
            This product uses a deprecated pricing model with both a monthly and
            yearly pricing.
          </p>
          <p>
            To better support future pricing model, the billing cycle is now set
            at the product level, meaning you need to create a separate product
            for each billing cycle.
          </p>
          <p>
            If you want to make any changes to the pricing model, you need to
            create a new product. Feel free to reach out to our support team if
            you need assistance.
          </p>
        </div>
      </Section>
    )
  }

  return (
    <Section
      title="Pricing"
      description="Set your billing cycle and pricing model"
      className={className}
      compact={compact}
    >
      <div className="flex w-full flex-col gap-10">
        <div className="@container">
          <RadioGroup
            value={productType}
            onValueChange={(v) => setProductType(v as 'one_time' | 'recurring')}
            className="grid grid-cols-2 gap-4"
          >
            {['one_time', 'recurring'].map((option) => (
              <Label
                key={option}
                htmlFor={`price-type-${option}`}
                className={`flex flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors not-aria-disabled:cursor-pointer ${
                  productType === option
                    ? ' bg-gray-50'
                    : '    border-gray-100 text-gray-500 not-aria-disabled:hover:border-gray-200'
                }`}
                aria-disabled={update}
              >
                <div>
                  <div className="flex items-center gap-2.5 font-medium">
                    <RadioGroupItem
                      value={option}
                      id={`price-type-${option}`}
                      disabled={update}
                    />
                    {option === 'one_time'
                      ? 'One-time purchase'
                      : 'Recurring subscription'}
                  </div>
                  {option === 'recurring' && productType === 'recurring' && (
                    <div className="mt-4 flex items-start gap-3 text-sm">
                      <span className="flex h-10 items-center">Every</span>
                      <FormField
                        control={control}
                        name="recurring_interval_count"
                        rules={{
                          required:
                            'This field is required when billing cycle is set',
                          min: {
                            value: 1,
                            message: 'Interval count must be at least 1',
                          },
                          max: {
                            value: 999,
                            message: 'Interval count cannot exceed 999',
                          },
                        }}
                        render={({ field }) => {
                          return (
                            <Input
                              type="text"
                              min="1"
                              max="999"
                              pattern="\d*"
                              defaultValue={field.value || 1}
                              onChange={(e) => {
                                const parsedValue = parseInt(e.target.value)
                                field.onChange(
                                  isNaN(parsedValue) ? '' : parsedValue,
                                )
                              }}
                              disabled={update}
                              className="min-w-12"
                            />
                          )
                        }}
                      />
                      <FormField
                        control={control}
                        name="recurring_interval"
                        render={({ field }) => {
                          return (
                            <FormItem>
                              <FormControl>
                                <div>
                                  <Select
                                    onValueChange={(value) =>
                                      field.onChange(value)
                                    }
                                    defaultValue={field.value ?? 'month'}
                                    disabled={update}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select a billing cycle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="day">
                                        day
                                        {recurringIntervalCount !== 1
                                          ? 's'
                                          : ''}
                                      </SelectItem>
                                      <SelectItem value="week">
                                        week
                                        {recurringIntervalCount !== 1
                                          ? 's'
                                          : ''}
                                      </SelectItem>
                                      <SelectItem value="month">
                                        month
                                        {recurringIntervalCount !== 1
                                          ? 's'
                                          : ''}
                                      </SelectItem>
                                      <SelectItem value="year">
                                        year
                                        {recurringIntervalCount !== 1
                                          ? 's'
                                          : ''}
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )
                        }}
                      />
                    </div>
                  )}
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        <hr className=" border-gray-200" />

        {/* Prices for selected currency — CurrencyTabs are inlined next to the price amount */}
        {pricesForSelectedCurrency.map(({ price, index }, position) => (
          <ProductPriceItem
            organization={organization}
            index={index}
            currency={validatedSelectedCurrency}
            onRemove={handleRemovePrice}
            onAmountTypeChange={handleAmountTypeChange}
            allowedAmountTypes={allowedAmountTypes}
            canRemove={
              isMeteredPrice(price as ProductPrice) &&
              pricesForSelectedCurrency.some(
                (p) => !isMeteredPrice(p.price as ProductPrice),
              )
            }
            key={`${selectedCurrency}-${index}`}
            currencyControl={
              position === 0 ? (
                <CurrencyTabs
                  activeCurrencies={activeCurrencies}
                  selectedCurrency={validatedSelectedCurrency}
                  onSelectCurrency={setSelectedCurrency}
                  onAddCurrency={handleAddCurrency}
                  onRemoveCurrency={handleRemoveCurrency}
                  defaultCurrency={defaultCurrency}
                />
              ) : undefined
            }
          />
        ))}

        {update && recurringInterval && (
          <ShadowBox className=" flex flex-col gap-2 rounded-2xl! border-none! p-4">
            <h3 className="text-sm font-medium">Updating pricing model</h3>
            <p className=" text-gray-5 00 text-sm">
              Changing pricing model on subscription products will only affect
              new customers. Current customers will keep their original pricing
              model.
            </p>
          </ShadowBox>
        )}

        {recurringInterval !== null && (
          <Button
            className="self-start"
            variant="secondary"
            onClick={handleAddMeteredPrice}
          >
            Add Additional Price
          </Button>
        )}
      </div>

      {recurringInterval && <TrialConfigurationForm />}
    </Section>
  )
}
