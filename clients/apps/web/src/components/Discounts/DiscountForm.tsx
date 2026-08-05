import AutorenewOutlined from '@mui/icons-material/AutorenewOutlined'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@spaire/ui/components/atoms/Accordion'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import MoneyInput from '@spaire/ui/components/atoms/MoneyInput'
import PercentageInput from '@spaire/ui/components/atoms/PercentageInput'
import { schemas } from '@spaire/client'
import DateTimePicker from '@spaire/ui/components/atoms/DateTimePicker'
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
import React, { useCallback, useMemo } from 'react'
import { useFormContext } from 'react-hook-form'
import ProductSelect from '../Products/ProductSelect'

interface DiscountFormProps {
  organization: schemas['Organization']
  update: boolean
  redemptionsCount?: number
}

const DiscountForm: React.FC<DiscountFormProps> = ({
  organization,
  update,
  redemptionsCount,
}) => {
  const { control, watch, setValue } = useFormContext<
    (schemas['DiscountCreate'] | schemas['DiscountUpdate']) & {
      products: { id: string }[]
    }
  >()
  const type = watch('type') as schemas['DiscountType']
  const duration = watch('duration') as schemas['DiscountDuration']

  const now = useMemo(() => new Date(), [])
  const startsAt = watch('starts_at')
  const endsAt = watch('ends_at')

  const canUpdateAmount =
    redemptionsCount === undefined || redemptionsCount === 0

  const generateDiscountCode = useCallback(() => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
    const length = 8
    let code = ''
    const charactersLength = characters.length
    for (let i = 0; i < length; i++) {
      code += characters.charAt(Math.floor(Math.random() * charactersLength))
    }
    setValue('code', code)
  }, [setValue])

  return (
    <>
      <FormField
        control={control}
        name="name"
        rules={{
          minLength: {
            value: 1,
            message: 'This field must not be empty',
          },
          required: 'This field is required',
        }}
        render={({ field }) => {
          return (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
              <FormDescription>
                Displayed to the customer when they apply the discount.
              </FormDescription>
            </FormItem>
          )
        }}
      />
      <FormField
        control={control}
        name="code"
        render={({ field }) => {
          return (
            <FormItem>
              <FormLabel>Code</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input {...field} value={field.value || ''} />
                  <div className="absolute inset-y-0 right-1 z-10 flex items-center">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={generateDiscountCode}
                    >
                      <AutorenewOutlined fontSize="small" />
                    </Button>
                  </div>
                </div>
              </FormControl>
              <FormMessage />
              <FormDescription>
                Optional code (case insensitive) that the customer can use to
                apply the discount. If left empty, the discount can only be
                applied through a Checkout Link or the API.
              </FormDescription>
            </FormItem>
          )
        }}
      />
      {!update && (
        <FormItem>
          <FormLabel>Discount type</FormLabel>
          <RadioGroup
            value={type}
            onValueChange={(value: string) =>
              setValue('type', value as schemas['DiscountType'])
            }
            className="grid grid-cols-2 gap-4"
          >
            {[
              {
                value: 'percentage',
                title: 'Percentage off',
                description: 'Reduce the price by a percentage.',
              },
              {
                value: 'fixed',
                title: 'Fixed amount',
                description: 'Reduce the price by a set amount.',
              },
            ].map((option) => (
              <Label
                key={option.value}
                htmlFor={`discount-type-${option.value}`}
                className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors ${
                  type === option.value
                    ? ' bg-gray-50'
                    : '    border-gray-100 text-gray-500 hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2.5 font-medium">
                  <RadioGroupItem
                    value={option.value}
                    id={`discount-type-${option.value}`}
                  />
                  {option.title}
                </div>
                <p className=" text-sm text-gray-500">
                  {option.description}
                </p>
              </Label>
            ))}
          </RadioGroup>
        </FormItem>
      )}

      {type === 'percentage' && (
        <FormField
          control={control}
          name="basis_points"
          shouldUnregister={type !== 'percentage'}
          rules={{
            required: 'This field is required',
            min: { value: 1, message: 'This field must be at least 0.01%' },
            max: {
              value: 10000,
              message: 'This field must be at most 100%',
            },
          }}
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>Percentage</FormLabel>
                <FormControl>
                  <PercentageInput
                    {...field}
                    value={field.value || undefined}
                    placeholder={1000}
                    disabled={!canUpdateAmount}
                  />
                </FormControl>
                {!canUpdateAmount && (
                  <FormDescription>
                    The percentage cannot be changed once the discount has been
                    redeemed by a customer.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )
          }}
        />
      )}

      {type === 'fixed' && (
        <FormField
          control={control}
          name="amount"
          shouldUnregister={type !== 'fixed'}
          rules={{
            required: 'This field is required',
            min: { value: 1, message: 'This field must be at least 1' },
          }}
          render={({ field }) => {
            return (
              <FormItem>
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <MoneyInput
                    {...field}
                    value={field.value || undefined}
                    placeholder={1000}
                    disabled={!canUpdateAmount}
                    currency={organization.default_presentment_currency}
                  />
                </FormControl>
                {!canUpdateAmount && (
                  <FormDescription>
                    The amount cannot be changed once the discount has been
                    redeemed by a customer.
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )
          }}
        />
      )}

      <Accordion type="single" collapsible className="flex flex-col gap-y-6">
        <AccordionItem
          value="form-input-options"
          className=" rounded-xl border border-gray-200 px-4"
        >
          <AccordionTrigger className="hover:no-underline">
            Recurring options
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-y-6">
            <FormField
              control={control}
              name="duration"
              rules={{
                required: 'This field is required',
              }}
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Duration</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        disabled={update}
                        className="grid grid-cols-3 gap-4"
                      >
                        {[
                          {
                            value: 'once',
                            title: 'Once',
                            description: 'Applies to the first payment only.',
                          },
                          {
                            value: 'repeating',
                            title: 'Repeating',
                            description: 'Applies for a set number of months.',
                          },
                          {
                            value: 'forever',
                            title: 'Forever',
                            description: 'Applies to all future payments.',
                          },
                        ].map((option) => (
                          <Label
                            key={option.value}
                            htmlFor={`duration-${option.value}`}
                            className={`flex flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors ${
                              update
                                ? 'cursor-not-allowed opacity-50'
                                : 'cursor-pointer'
                            } ${
                              field.value === option.value
                                ? ' bg-gray-50'
                                : '    border-gray-100 text-gray-500 hover:border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 font-medium">
                              <RadioGroupItem
                                value={option.value}
                                id={`duration-${option.value}`}
                                disabled={update}
                              />
                              {option.title}
                            </div>
                            <p className=" text-sm text-gray-500">
                              {option.description}
                            </p>
                          </Label>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            {duration === 'repeating' && (
              <FormField
                control={control}
                name="duration_in_months"
                shouldUnregister={duration !== 'repeating'}
                rules={{
                  required: 'This field is required',
                  min: {
                    value: 1,
                    message: 'This field must be at least 1',
                  },
                }}
                defaultValue={1}
                render={({ field }) => {
                  return (
                    <FormItem>
                      <FormLabel>Number of months</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value || undefined}
                          type="number"
                          min={1}
                        />
                      </FormControl>
                      <FormMessage />
                      <FormDescription>
                        The discount will be applied the first{' '}
                        {Number.parseInt(field.value as unknown as string) === 1
                          ? 'month'
                          : `${field.value} months`}
                        .
                      </FormDescription>
                    </FormItem>
                  )
                }}
              />
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Accordion type="single" collapsible className="flex flex-col gap-y-6">
        <AccordionItem
          value="form-input-options"
          className=" rounded-xl border border-gray-200 px-4"
        >
          <AccordionTrigger className="hover:no-underline">
            Restrictions
          </AccordionTrigger>
          <AccordionContent className="flex flex-col gap-y-6">
            <FormField
              control={control}
              name="products"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Products</FormLabel>
                    <FormControl>
                      <ProductSelect
                        organization={organization}
                        value={field.value || []}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      Only the selected products will be eligible for the
                      discount.
                    </FormDescription>
                  </FormItem>
                )
              }}
            />
            <FormField
              control={control}
              name="starts_at"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Starts at</FormLabel>
                    <DateTimePicker
                      value={field.value || undefined}
                      onChange={(value) => {
                        field.onChange(value || null)
                      }}
                      disabled={[
                        { before: now },
                        ...(endsAt ? [{ after: new Date(endsAt) }] : []),
                      ]}
                    />
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={control}
              name="ends_at"
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Ends at</FormLabel>
                    <DateTimePicker
                      value={field.value || undefined}
                      onChange={(value) => {
                        field.onChange(value || null)
                      }}
                      disabled={{
                        before: startsAt ? new Date(startsAt) : now,
                      }}
                    />
                    <FormMessage />
                  </FormItem>
                )
              }}
            />
            <FormField
              control={control}
              name="max_redemptions"
              rules={{
                min: { value: 1, message: 'This field must be at least 1' },
              }}
              render={({ field }) => {
                return (
                  <FormItem>
                    <FormLabel>Maximum number of redemptions</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          field.onChange(
                            value === '' ? null : parseInt(value, 10),
                          )
                        }}
                        min={1}
                      />
                    </FormControl>
                    <FormMessage />
                    <FormDescription>
                      Limit applies across all customers, not per customer.
                    </FormDescription>
                  </FormItem>
                )
              }}
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  )
}

export default DiscountForm
