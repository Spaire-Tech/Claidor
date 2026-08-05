'use client'

import { useUpdateOrganization } from '@/hooks/queries'
import { useAutoSave } from '@/hooks/useAutoSave'
import { setValidationErrors } from '@/utils/api/errors'
import { isValidationError, schemas } from '@spaire/client'
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

interface OrganizationCurrencySettingsProps {
  organization: schemas['Organization']
}

type FormSchema = Pick<
  schemas['OrganizationUpdate'],
  'default_presentment_currency'
>

const OrganizationCurrencySettings: React.FC<
  OrganizationCurrencySettingsProps
> = ({ organization }) => {
  const form = useForm<FormSchema>({
    defaultValues: {
      default_presentment_currency:
        (organization.default_presentment_currency as PresentmentCurrency) ??
        'usd',
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
        </SettingsGroup>
      </form>
    </Form>
  )
}

export default OrganizationCurrencySettings
