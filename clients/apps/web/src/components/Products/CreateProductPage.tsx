import { Upload } from '@/components/FileUpload/Upload'
import {
  useBenefits,
  useCreateProduct,
  useUpdateProductBenefits,
} from '@/hooks/queries'
import { setProductValidationErrors } from '@/utils/api/errors'
import {
  ProductEditOrCreateForm,
  productToCreateForm,
  SUBTITLE_METADATA_KEY,
} from '@/utils/product'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { Form } from '@spaire/ui/components/ui/form'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { DashboardBody } from '../Layout/DashboardLayout'
import { InlineModalHeader } from '../Modal/InlineModal'
import { toast } from '../Toast/use-toast'
import { getStatusRedirect } from '../Toast/utils'
import { Benefits } from './Benefits/Benefits'
import ProductForm from './ProductForm/ProductForm'

const reuploadMedia = async (
  media: schemas['ProductMediaFileRead'],
  organization: schemas['Organization'],
): Promise<schemas['ProductMediaFileRead']> => {
  const response = await fetch(media.public_url)
  const blob = await response.blob()
  const file = new File([blob], media.name, { type: media.mime_type })

  return new Promise((resolve, reject) => {
    const upload = new Upload({
      organization,
      service: 'product_media',
      file,
      onFileProcessing: () => {},
      onFileCreate: () => {},
      onFileUploadProgress: () => {},
      onFileUploaded: (response) =>
        resolve(response as schemas['ProductMediaFileRead']),
    })
    upload.run().catch(reject)
  })
}

export interface CreateProductPageProps {
  organization: schemas['Organization']
  sourceProduct?: schemas['Product']
  panelMode?: boolean
  /** Render without DashboardBody — used in split-screen layout */
  splitMode?: boolean
  onClose?: () => void
  onPriceChange?: (price: {
    amount: number | null
    currency: string
    recurringInterval: string | null
    recurringIntervalCount: number | null
    allPrices: { currency: string; amount: number | null; amountType: string }[]
  }) => void
}

export const CreateProductPage = ({
  organization,
  sourceProduct,
  panelMode,
  splitMode,
  onClose,
  onPriceChange,
}: CreateProductPageProps) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Same-origin path the caller wants us to bounce back to after a
  // successful create (e.g. the Space editor's "+ Add to Space" flow).
  const rawReturnTo = searchParams?.get('returnTo') ?? null
  const returnTo =
    rawReturnTo && rawReturnTo.startsWith('/') ? rawReturnTo : null
  const [isSubmitting, setIsSubmitting] = useState(false)
  const benefitsQuery = useBenefits(organization.id, {
    limit: 200,
  })
  const organizationBenefits = useMemo(
    () => benefitsQuery.data?.items ?? [],
    [benefitsQuery],
  )
  const totalBenefitCount = benefitsQuery.data?.pagination?.total_count ?? 0

  // Store full benefit objects instead of just IDs to avoid lookup issues
  const [enabledBenefits, setEnabledBenefits] = useState<schemas['Benefit'][]>(
    sourceProduct?.benefits ?? [],
  )

  // Derive IDs from the benefit objects
  const enabledBenefitIds = useMemo(
    () => enabledBenefits.map((b) => b.id),
    [enabledBenefits],
  )

  const getDefaultValues = () => {
    if (sourceProduct) {
      return productToCreateForm(sourceProduct)
    }

    return {
      recurring_interval: null,
      visibility: 'public' as const,
      prices: [
        {
          amount_type: 'fixed' as const,
          price_amount: 0,
          price_currency: organization.default_presentment_currency,
        },
      ],
      medias: [],
      full_medias: [],
      organization_id: organization.id,
      metadata: [],
    }
  }

  const form = useForm<ProductEditOrCreateForm>({
    defaultValues: getDefaultValues(),
  })
  const { handleSubmit, setError, control } = form

  // Notify parent of price changes for the preview panel
  const watchedPrices = useWatch({ control, name: 'prices' })
  const watchedInterval = useWatch({ control, name: 'recurring_interval' })
  const watchedIntervalCount = useWatch({
    control,
    name: 'recurring_interval_count',
  })
  useEffect(() => {
    if (!onPriceChange) return

    // Build per-currency price map (fixed + seat_based)
    const currencyMap = new Map<string, { amount: number | null; amountType: string }>()
    for (const p of watchedPrices ?? []) {
      if (!('price_currency' in p)) continue
      const cur = (p as any).price_currency as string
      const amountType = (p as any).amount_type as string
      let amount: number | null = null
      if (amountType === 'fixed') {
        amount = (p as any).price_amount ?? null
      } else if (amountType === 'seat_based') {
        amount = (p as any).seat_tiers?.tiers?.[0]?.price_per_seat ?? null
      } else if (amountType === 'custom') {
        amount = (p as any).minimum_amount ?? null
      }
      if (!currencyMap.has(cur) || amount !== null) {
        currencyMap.set(cur, { amount, amountType })
      }
    }

    const allPrices = Array.from(currencyMap.entries()).map(([currency, v]) => ({
      currency,
      amount: v.amount,
      amountType: v.amountType,
    }))
    const first = allPrices[0]
    onPriceChange({
      amount: first?.amount ?? null,
      currency: first?.currency ?? organization.default_presentment_currency,
      recurringInterval: watchedInterval ?? null,
      recurringIntervalCount: watchedIntervalCount ?? null,
      allPrices,
    })
  }, [
    watchedPrices,
    watchedInterval,
    watchedIntervalCount,
    onPriceChange,
    organization.default_presentment_currency,
  ])

  const createProduct = useCreateProduct(organization)
  const updateBenefits = useUpdateProductBenefits(organization)

  const onSubmit = useCallback(
    async (productCreate: ProductEditOrCreateForm) => {
      setIsSubmitting(true)
      try {
        const { full_medias, metadata, subtitle, ...productCreateRest } =
          productCreate

        // When duplicating, re-upload medias to create new files
        let mediaIds = full_medias.map((media) => media.id)
        if (sourceProduct && full_medias.length > 0) {
          const reuploadedMedias = await Promise.all(
            full_medias.map((media) => reuploadMedia(media, organization)),
          )
          mediaIds = reuploadedMedias.map((media) => media.id)
        }

        // Validate all prices (including unmounted currency tabs not checked by react-hook-form)
        const invalidFixedPrice = productCreateRest.prices.some(
          (price: any) => price.amount_type === 'fixed' && (price.price_amount ?? 0) < 50,
        )
        if (invalidFixedPrice) {
          toast({
            title: 'Invalid price',
            description: 'All prices must be at least $0.50. Check all currency tabs.',
          })
          return
        }

        const metadataObject = metadata.reduce(
          (acc, { key, value }) => ({ ...acc, [key]: value }),
          {} as Record<string, string | number | boolean>,
        )
        // Persist the byline as a reserved metadata key (no dedicated column).
        if (typeof subtitle === 'string' && subtitle.trim()) {
          metadataObject[SUBTITLE_METADATA_KEY] = subtitle.trim()
        }

        const { data: product, error } = await createProduct.mutateAsync({
          ...productCreateRest,
          medias: mediaIds,
          metadata: metadataObject,
        } as schemas['ProductCreate'])

        if (error) {
          if (error.detail) {
            setProductValidationErrors(error.detail, setError)
          }
          const msg = Array.isArray(error.detail) && error.detail.length > 0
            ? error.detail[0].msg
            : 'Failed to create product. Please check the form for errors.'
          toast({ title: 'Error', description: msg })
          return
        }

        await updateBenefits.mutateAsync({
          id: product.id,
          body: {
            benefits: enabledBenefitIds,
          },
        })

        if (onClose) {
          toast({
            title: 'Product Created',
            description: `${product.name} was created successfully`,
          })
          onClose()
        } else {
          const destination = returnTo ?? `/dashboard/${organization.slug}/products`
          router.push(
            getStatusRedirect(
              destination,
              'Product Created',
              `Product ${product.name} was created successfully`,
            ),
          )
        }
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      organization,
      sourceProduct,
      enabledBenefitIds,
      createProduct,
      updateBenefits,
      setError,
      router,
    ],
  )

  const onSelectBenefit = useCallback((benefit: schemas['Benefit']) => {
    setEnabledBenefits((benefits) => [...benefits, benefit])
  }, [])

  const onRemoveBenefit = useCallback((benefit: schemas['Benefit']) => {
    setEnabledBenefits((benefits) =>
      benefits.filter((b) => b.id !== benefit.id),
    )
  }, [])

  const onReorderBenefits = useCallback((benefits: schemas['Benefit'][]) => {
    setEnabledBenefits(benefits)
  }, [])

  const formContent = (
    <>
      <div className=" flex flex-col divide-y divide-gray-200 rounded-4xl border border-gray-200">
        <Form {...form}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-y-6"
          >
            <ProductForm
              organization={organization}
              update={false}
              benefitsSlot={
                <Benefits
                  organization={organization}
                  benefits={organizationBenefits}
                  totalBenefitCount={totalBenefitCount}
                  selectedBenefits={enabledBenefits}
                  onSelectBenefit={onSelectBenefit}
                  onRemoveBenefit={onRemoveBenefit}
                  onReorderBenefits={onReorderBenefits}
                />
              }
            />
          </form>
        </Form>
      </div>
      <div className="flex flex-row items-center gap-2 pb-12">
        <Button
          onClick={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
        >
          Publish product
        </Button>
      </div>
    </>
  )

  if (panelMode) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose ?? (() => {})}>
          <span>{sourceProduct ? 'Duplicate Product' : 'New Product'}</span>
        </InlineModalHeader>
        <div className="flex flex-col gap-8 overflow-y-auto px-8 pb-8">
          {formContent}
        </div>
      </div>
    )
  }

  if (splitMode) {
    return (
      <div className="flex flex-col gap-8 px-8 py-8">
        <h1 className="text-xl font-semibold text-gray-900">
          {sourceProduct ? 'Duplicate Product' : 'New Product'}
        </h1>
        {formContent}
      </div>
    )
  }

  return (
    <DashboardBody
      title={sourceProduct ? 'Duplicate Product' : 'New Product'}
      wrapperClassName="max-w-(--breakpoint-md)!"
      className="gap-y-16"
    >
      {formContent}
    </DashboardBody>
  )
}
