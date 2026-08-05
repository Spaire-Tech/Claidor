'use client'

import { useUpdateOrganization } from '@/hooks/queries'
import { useAutoSave } from '@/hooks/useAutoSave'
import { setValidationErrors } from '@/utils/api/errors'
import { enums, isValidationError, schemas } from '@spaire/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import React from 'react'
import { useForm } from 'react-hook-form'
import { CURRENCIES } from './currencies'
import { SettingsGroup, SettingsGroupItem } from './SettingsGroup'

type PresentmentCurrency = schemas['PresentmentCurrency']
type TaxBehaviorOption = schemas['TaxBehaviorOption']

const TAX_BEHAVIOR_LABELS: Record<TaxBehaviorOption, string> = {
  location: 'Based on customer location',
  inclusive: 'Tax inclusive (price includes tax)',
  exclusive: 'Tax exclusive (tax added on top)',
}

interface OrganizationPaymentSettingsProps {
  organization: schemas['Organization']
}

type FormSchema = Pick<
  schemas['OrganizationUpdate'],
  'default_presentment_currency' | 'default_tax_behavior'
>

const OrganizationPaymentSettings: React.FC<
  OrganizationPaymentSettingsProps
> = ({ organization }) => {
  const form = useForm<FormSchema>({
    defaultValues: {
      default_presentment_currency:
        (organization.default_presentment_currency as PresentmentCurrency) ??
        'usd',
      default_tax_behavior:
        (organization.default_tax_behavior as TaxBehaviorOption) ?? 'location',
    },
  })
  const { control, setError, reset } = form

  const updateOrganization = useUpdateOrganization()
  const onSave = async (body: FormSchema) => {
    const { data, error } = await updateOrganization.mutateAsync({
      id: organization.id,
      body,
    })

    if (error) {
      if (isValidationError(error.detail)) {
        setValidationErrors(error.detail, setError)
      } else {
        setError('root', { message: error.detail })
      }
      return
    }

    reset({
      ...data,
      default_presentment_currency:
        data.default_presentment_currency as PresentmentCurrency,
      default_tax_behavior:
        (data.default_tax_behavior as TaxBehaviorOption) ??
        body.default_tax_behavior ??
        'location',
    })
  }

  useAutoSave({
    form,
    onSave,
    delay: 200,
  })

  return (
    <Form {...form}>
      <form onSubmit={(e) => e.preventDefault()}>
        <SettingsGroup>
          <SettingsGroupItem
            title="Default payment currency"
            description="The default currency for products and checkout. Used as fallback if the customer's local currency is not available or defined on a product."
          >
            <FormField
              control={control}
              name="default_presentment_currency"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Select
                      value={field.value ?? 'usd'}
                      onValueChange={(v) =>
                        field.onChange(v as PresentmentCurrency)
                      }
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue>
                          {(() => {
                            const c = CURRENCIES.find(
                              (c) => c.code === field.value,
                            )
                            return c
                              ? `${c.flag} ${c.label}`
                              : (field.value ?? 'usd').toUpperCase()
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {c.flag} {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsGroupItem>
          <SettingsGroupItem
            title="Default tax behavior"
            description="Controls how tax is applied to product prices. Inclusive means the displayed price already includes tax. Exclusive means tax is added on top. 'Based on customer location' uses regional conventions automatically."
          >
            <FormField
              control={control}
              name="default_tax_behavior"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Select
                      value={field.value ?? 'location'}
                      onValueChange={(v) =>
                        field.onChange(v as TaxBehaviorOption)
                      }
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue>
                          {TAX_BEHAVIOR_LABELS[
                            (field.value as TaxBehaviorOption) ?? 'location'
                          ]}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {enums.taxBehaviorOptionValues.map((v) => (
                          <SelectItem key={v} value={v}>
                            {TAX_BEHAVIOR_LABELS[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </SettingsGroupItem>
        </SettingsGroup>
      </form>
    </Form>
  )
}

export default OrganizationPaymentSettings
