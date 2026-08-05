'use client'

import {
  useCreateCheckoutLink,
  useSelectedProducts,
  useUpdateCheckoutLink,
} from '@/hooks/queries'
import {
  normalizeValidationErrors,
  setValidationErrors,
} from '@/utils/api/errors'
import ClearOutlined from '@mui/icons-material/ClearOutlined'
import { isValidationError, schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import Switch from '@spaire/ui/components/atoms/Switch'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { useCallback, useEffect, useMemo } from 'react'
import { SubmitHandler, useFieldArray, useForm } from 'react-hook-form'
import ProductSelect from '../Products/ProductSelect'
import { toast } from '../Toast/use-toast'
import { TrialConfigurationForm } from '../TrialConfiguration/TrialConfigurationForm'

type CheckoutLinkCreateForm = Omit<
  schemas['CheckoutLinkCreateProducts'],
  'payment_processor' | 'metadata'
> & {
  metadata: { key: string; value: string | number | boolean }[]
  show_logo: boolean
  show_media: boolean
  show_description: boolean
}

export interface CheckoutLinkFormProps {
  organization: schemas['Organization']
  checkoutLink?: schemas['CheckoutLink']
  productIds?: string[]
  onClose: (checkoutLink: schemas['CheckoutLink']) => void
  onProductsChange?: (productIds: string[]) => void
  onDisplaySettingsChange?: (settings: {
    showLogo: boolean
    showMedia: boolean
    showDescription: boolean
  }) => void
}

export const CheckoutLinkForm = ({
  organization,
  checkoutLink,
  onClose,
  productIds,
  onProductsChange,
  onDisplaySettingsChange,
}: CheckoutLinkFormProps) => {
  const defaultValues = useMemo<CheckoutLinkCreateForm>(() => {
    if (checkoutLink) {
      const meta = checkoutLink.metadata ?? {}
      return {
        ...checkoutLink,
        label: checkoutLink.label ?? null,
        metadata: Object.entries(meta)
          .filter(
            ([key]) =>
              !['show_logo', 'show_media', 'show_description'].includes(key),
          )
          .map(([key, value]) => ({ key, value })),
        products: checkoutLink.products.map(({ id }) => id),
        allow_discount_codes: checkoutLink.allow_discount_codes ?? true,
        require_billing_address: checkoutLink.require_billing_address ?? false,
        success_url: checkoutLink.success_url ?? '',
        discount_id: checkoutLink.discount_id ?? '',
        show_logo: (meta.show_logo as boolean) ?? true,
        show_media: (meta.show_media as boolean) ?? true,
        show_description: (meta.show_description as boolean) ?? true,
      }
    }

    return {
      label: null,
      metadata: [],
      products: productIds ?? [],
      allow_discount_codes: true,
      require_billing_address: false,
      success_url: '',
      discount_id: '',
      show_logo: true,
      show_media: true,
      show_description: true,
    }
  }, [checkoutLink, productIds])

  const form = useForm<CheckoutLinkCreateForm>({ defaultValues })
  const { control, handleSubmit, setError, reset, watch } = form
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'metadata',
    rules: { maxLength: 50 },
  })

  const selectedProductIds = watch('products') || []
  const { data: selectedProducts } = useSelectedProducts(selectedProductIds)

  const hasRecurringProducts = useMemo(
    () => selectedProducts?.some((p) => p.is_recurring) ?? false,
    [selectedProducts],
  )

  const selectedProductIdsJson = JSON.stringify(selectedProductIds)
  useEffect(() => {
    onProductsChange?.(selectedProductIds)
    // Auto-fill label from first product name when creating a new link
    if (!checkoutLink && selectedProducts && selectedProducts.length > 0) {
      const currentLabel = form.getValues('label')
      if (!currentLabel) {
        form.setValue('label', selectedProducts[0].name)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductIdsJson, selectedProducts])

  const showLogoValue = watch('show_logo')
  const showMediaValue = watch('show_media')
  const showDescriptionValue = watch('show_description')
  useEffect(() => {
    onDisplaySettingsChange?.({
      showLogo: showLogoValue,
      showMedia: showMediaValue,
      showDescription: showDescriptionValue,
    })
  }, [showLogoValue, showMediaValue, showDescriptionValue]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!checkoutLink) return
    reset(defaultValues)
  }, [checkoutLink, reset, defaultValues])

  const { mutateAsync: createCheckoutLink, isPending: isCreatePending } =
    useCreateCheckoutLink()
  const { mutateAsync: updateCheckoutLink, isPending: isUpdatePending } =
    useUpdateCheckoutLink()

  const handleValidationError = useCallback(
    (data: CheckoutLinkCreateForm, errors: schemas['ValidationError'][]) => {
      const discriminators = [
        'CheckoutLinkCreateProducts',
        'RequestValidationError',
      ]
      const normalizedErrors = normalizeValidationErrors(errors)
      const filteredErrors = checkoutLink
        ? normalizedErrors
        : normalizedErrors.filter((error) =>
            discriminators.includes(error.loc[1] as string),
          )
      setValidationErrors(filteredErrors, setError, 1, discriminators)
      filteredErrors.forEach((error) => {
        let loc = error.loc.slice(1)
        if (loc.length > 0 && discriminators.includes(loc[0] as string)) {
          loc = loc.slice(1)
        }
        if (loc[0] === 'metadata') {
          const metadataKey = loc[1]
          const metadataIndex = data.metadata.findIndex(
            ({ key }) => key === metadataKey,
          )
          if (metadataIndex > -1) {
            const field = loc[2] === '[key]' ? 'key' : 'value'
            setError(`metadata.${metadataIndex}.${field}`, {
              message: error.msg,
            })
          }
        }
      })
    },
    [checkoutLink, setError],
  )

  const onSubmit: SubmitHandler<CheckoutLinkCreateForm> = useCallback(
    async (data) => {
      const {
        show_logo,
        show_media,
        show_description,
        metadata: metadataFields,
        ...rest
      } = data

      const body: schemas['CheckoutLinkCreateProducts'] = {
        payment_processor: 'stripe',
        ...rest,
        discount_id: rest.discount_id || null,
        success_url: rest.success_url || null,
        metadata: {
          show_logo,
          show_media,
          show_description,
          ...metadataFields.reduce(
            (acc, { key, value }) => ({ ...acc, [key]: value }),
            {} as Record<string, string | number | boolean>,
          ),
        },
      }

      let newCheckoutLink: schemas['CheckoutLink']

      if (checkoutLink) {
        const { data: updatedCheckoutLink, error } = await updateCheckoutLink({
          id: checkoutLink.id,
          body,
        })
        if (error) {
          if (isValidationError(error.detail)) {
            handleValidationError(data, error.detail)
          } else {
            setError('root', { message: error.detail })
          }
          return
        }
        newCheckoutLink = updatedCheckoutLink
        toast({
          title: 'Payment Link Updated',
          description: `${newCheckoutLink.label ?? 'Unlabeled'} Payment Link was updated successfully`,
        })
      } else {
        const { data: createdCheckoutLink, error } =
          await createCheckoutLink(body)
        if (error) {
          if (isValidationError(error.detail)) {
            handleValidationError(data, error.detail)
          } else {
            setError('root', { message: error.detail })
          }
          return
        }
        newCheckoutLink = createdCheckoutLink
        toast({
          title: 'Payment Link Created',
          description: `${newCheckoutLink.label ?? 'Unlabeled'} Payment Link was created successfully`,
        })
      }

      onClose(newCheckoutLink)
    },
    [
      onClose,
      checkoutLink,
      createCheckoutLink,
      updateCheckoutLink,
      setError,
      handleValidationError,
    ],
  )

  return (
    <Form {...form}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-8">
        {/* Product */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">Product</h2>
          <FormField
            control={control}
            name="products"
            rules={{
              validate: (value) =>
                value.length < 1 ? 'At least one product is required' : true,
            }}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <ProductSelect
                    organization={organization}
                    value={field.value || []}
                    onChange={field.onChange}
                    emptyLabel="Add a product…"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Toggle rows */}
        <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
          <ToggleRow
            label="Show organization logo"
            control={control}
            name="show_logo"
          />
          <ToggleRow
            label="Show product media"
            control={control}
            name="show_media"
          />
          <ToggleRow
            label="Show product description"
            control={control}
            name="show_description"
          />
          <ToggleRow
            label="Accept discount codes"
            control={control}
            name="allow_discount_codes"
          />
          <ToggleRow
            label="Collect billing address"
            control={control}
            name="require_billing_address"
          />
        </div>

        {/* Trial period (conditional) */}
        {hasRecurringProducts && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold">
              Trial period
            </h2>
            <TrialConfigurationForm bottomText="Overrides the trial configuration set on individual products." />
          </div>
        )}

        {/* Redirect URL */}
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold">
            Redirect URL
          </h2>
          <FormField
            control={control}
            name="success_url"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    placeholder="https://example.com/success"
                    {...field}
                    value={field.value || ''}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Custom data */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">
              Custom data
            </h2>
            <button
              type="button"
              onClick={() => append({ key: '', value: '' })}
              className="text-xs text-gray-500 transition-opacity hover:opacity-60"
            >
              + Add field
            </button>
          </div>
          {fields.length > 0 && (
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="flex flex-row items-center gap-2"
                >
                  <FormField
                    control={control}
                    name={`metadata.${index}.key`}
                    render={({ field }) => (
                      <div className="flex flex-1 flex-col gap-y-1">
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value || ''}
                            placeholder="Key"
                          />
                        </FormControl>
                        <FormMessage />
                      </div>
                    )}
                  />
                  <FormField
                    control={control}
                    name={`metadata.${index}.value`}
                    render={({ field }) => (
                      <div className="flex flex-1 flex-col gap-y-1">
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value.toString() || ''}
                            placeholder="Value"
                          />
                        </FormControl>
                        <FormMessage />
                      </div>
                    )}
                  />
                  <Button
                    className="border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100"
                    size="icon"
                    variant="secondary"
                    type="button"
                    onClick={() => remove(index)}
                  >
                    <ClearOutlined fontSize="inherit" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <Button
          className="self-start"
          type="submit"
          loading={isCreatePending || isUpdatePending}
        >
          {checkoutLink ? 'Save Link' : 'Create Link'}
        </Button>
      </form>
    </Form>
  )
}

// Reusable toggle row component
function ToggleRow({
  label,
  control,
  name,
}: {
  label: string
  control: ReturnType<typeof useForm<CheckoutLinkCreateForm>>['control']
  name: keyof CheckoutLinkCreateForm
}) {
  return (
    <FormField
      control={control}
      name={name as any}
      render={({ field }) => (
        <FormItem>
          <div className=" flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-gray-50">
            <span className="text-sm">{label}</span>
            <FormControl>
              <Switch
                checked={!!field.value}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </div>
        </FormItem>
      )}
    />
  )
}
