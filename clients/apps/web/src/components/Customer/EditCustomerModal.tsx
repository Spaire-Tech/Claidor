import revalidate from '@/app/actions'
import { useUpdateCustomer } from '@/hooks/queries'
import { setValidationErrors } from '@/utils/api/errors'
import { enums, isValidationError, schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import CountryPicker from '@spaire/ui/components/atoms/CountryPicker'
import CountryStatePicker from '@spaire/ui/components/atoms/CountryStatePicker'
import Input from '@spaire/ui/components/atoms/Input'
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from '../Toast/use-toast'
import { CustomerMetadataForm } from './CustomerMetadataForm'

export type CustomerUpdateForm = Omit<
  schemas['CustomerUpdate'],
  'metadata' | 'billing_address'
> & {
  metadata: { key: string; value: string | number | boolean }[]
  first_name?: string
  last_name?: string
  billing_address?: {
    line1?: string | null
    line2?: string | null
    postal_code?: string | null
    city?: string | null
    state?: string | null
    country?: string
  } | null
}

export const EditCustomerModal = ({
  customer,
  onClose,
}: {
  customer: schemas['Customer']
  onClose: () => void
}) => {
  const nameParts = customer.name?.split(' ') ?? []
  const initialFirstName = nameParts.slice(0, -1).join(' ') || customer.name || ''
  const initialLastName = nameParts.length > 1 ? nameParts[nameParts.length - 1] : ''

  const form = useForm<CustomerUpdateForm>({
    defaultValues: {
      type: customer.type ?? 'individual',
      first_name: initialFirstName,
      last_name: initialLastName,
      name: customer.name || '',
      email: customer.email || '',
      external_id: customer.external_id || '',
      billing_address: customer.billing_address
        ? {
            line1: customer.billing_address.line1,
            line2: customer.billing_address.line2,
            postal_code: customer.billing_address.postal_code,
            city: customer.billing_address.city,
            state: customer.billing_address.state,
            country: customer.billing_address.country,
          }
        : undefined,
      metadata: Object.entries(customer.metadata).map(([key, value]) => ({
        key,
        value,
      })),
    },
  })

  const updateCustomer = useUpdateCustomer(
    customer.id,
    customer.organization_id,
  )

  const type = useWatch({ control: form.control, name: 'type' })
  const firstName = useWatch({ control: form.control, name: 'first_name' })
  const lastName = useWatch({ control: form.control, name: 'last_name' })
  const country = useWatch({
    control: form.control,
    name: 'billing_address.country',
  })

  const isCompany = type === 'team'

  useEffect(() => {
    if (isCompany) return
    const composed = [firstName, lastName].filter(Boolean).join(' ')
    if (composed) {
      form.setValue('name', composed)
    }
  }, [firstName, lastName, isCompany, form])

  const handleUpdateCustomer = (customerUpdate: CustomerUpdateForm) => {
    const { first_name, last_name, billing_address, ...rest } = customerUpdate
    const data = {
      ...rest,
      name:
        rest.name ||
        [first_name, last_name].filter(Boolean).join(' ') ||
        undefined,
      billing_address:
        billing_address?.country
          ? (billing_address as schemas['AddressInput'])
          : undefined,
      metadata: customerUpdate.metadata?.reduce(
        (acc, { key, value }) => ({ ...acc, [key]: value }),
        {},
      ),
    }

    updateCustomer.mutateAsync(data).then(({ error }) => {
      if (error) {
        if (error.detail)
          if (isValidationError(error.detail)) {
            setValidationErrors(error.detail, form.setError)
          } else {
            toast({
              title: 'Customer Update Failed',
              description: `Error updating customer ${customer.email}: ${error.detail}`,
            })
          }
        return
      }

      toast({
        title: 'Customer Updated',
        description: `Customer ${customer.email} updated successfully`,
      })
      revalidate(`customer:${customer.id}`)
      onClose()
    })
  }

  const isTeam = customer.type === 'team'

  return (
    <div className="flex flex-col gap-8 overflow-y-auto px-8 py-12">
      <div className="flex flex-row items-center gap-x-4">
        <h2 className="text-xl">Edit Customer</h2>
      </div>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleUpdateCustomer)}
          className="flex flex-col gap-8"
        >
          {/* Customer Information */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-gray-500">
              Customer Information
            </h3>
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value ?? 'individual'}
                    disabled={isTeam}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="individual">Individual</SelectItem>
                      <SelectItem value="team">Company</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isCompany ? (
              <FormField
                control={form.control}
                name="first_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registered Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input {...field} value={field.value || ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display Name</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              rules={{
                required: 'Email is required',
                pattern: {
                  value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                  message: 'Invalid email address',
                },
              }}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Billing Address */}
          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-medium text-gray-500">
              Billing Address
            </h3>
            <FormField
              control={form.control}
              name="billing_address.line1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Line 1</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Street address"
                      autoComplete="billing address-line1"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billing_address.line2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Line 2</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      placeholder="Apt, suite, etc. (optional)"
                      autoComplete="billing address-line2"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="billing_address.city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        autoComplete="billing address-level2"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="billing_address.postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Postal Code</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        autoComplete="billing postal-code"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="billing_address.country"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Country</FormLabel>
                  <FormControl>
                    <CountryPicker
                      autoComplete="billing country"
                      value={field.value || undefined}
                      onChange={field.onChange}
                      allowedCountries={enums.addressInputCountryValues}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="billing_address.state"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>State / Province</FormLabel>
                  <FormControl>
                    <CountryStatePicker
                      autoComplete="billing address-level1"
                      country={country}
                      value={field.value || ''}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* External ID */}
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="external_id"
              disabled={!!customer.external_id}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>External ID</FormLabel>
                  <FormDescription>
                    An optional ID of the customer in your system. Once set, it
                    can&apos;t be updated.
                  </FormDescription>
                  <FormControl>
                    <Input {...field} value={field.value || ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Metadata */}
          <FormField
            control={form.control}
            name="metadata"
            render={() => <CustomerMetadataForm />}
          />

          <Button
            type="submit"
            className="self-start"
            loading={updateCustomer.isPending}
          >
            Save Customer
          </Button>
        </form>
      </Form>
    </div>
  )
}
