'use client'

import { useCheckoutConfirmedRedirect } from '@/hooks/checkout'
import { usePostHog } from '@/hooks/posthog'
import { useOrganizationPaymentStatus } from '@/hooks/queries/org'
import { getServerURL } from '@/utils/api'
import { hasMarkdown, markdownOptions } from '@/utils/markdown'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import {
  CheckoutForm,
  CheckoutHeroPrice,
  CheckoutPricingBreakdown,
  CheckoutProductSwitcher,
  CheckoutPWYWForm,
  CheckoutSeatSelector,
} from '@spaire/checkout/components'
import {
  enrichCheckout,
  hasProductCheckout,
  type ProductCheckoutPublic,
} from '@spaire/checkout/guards'
import { useCheckoutFulfillmentListener } from '@spaire/checkout/hooks'
import { useCheckout, useCheckoutForm } from '@spaire/checkout/providers'
import type { CheckoutConfirmStripe } from '@spaire/sdk/models/components/checkoutconfirmstripe'
import type { CheckoutPublicConfirmed } from '@spaire/sdk/models/components/checkoutpublicconfirmed'
import type { CheckoutUpdatePublic } from '@spaire/sdk/models/components/checkoutupdatepublic'
import { ProductPriceCustom } from '@spaire/sdk/models/components/productpricecustom.js'
import { ExpiredCheckoutError } from '@spaire/sdk/models/errors/expiredcheckouterror'
import Alert from '@spaire/ui/components/atoms/Alert'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import ShadowBox from '@spaire/ui/components/atoms/ShadowBox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@spaire/ui/components/ui/dialog'
import { getThemePreset } from '@spaire/ui/hooks/theming'
import type { Stripe, StripeElements } from '@stripe/stripe-js'
import Markdown from 'markdown-to-jsx'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Slideshow } from '../Products/Slideshow'
import { CheckoutDiscountInput } from './CheckoutDiscountInput'

const TruncatedDescription = ({
  description,
  productName,
}: {
  description: string
  productName: string
}) => {
  const textRef = useRef<HTMLDivElement>(null)
  const [isClamped, setIsClamped] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const el = textRef.current
    if (!el) return
    requestAnimationFrame(() => {
      setIsClamped(el.scrollHeight > el.clientHeight)
    })
  }, [description])

  return (
    <>
      <div className="flex flex-col gap-y-1">
        <div
          ref={textRef}
          className="prose prose-headings:text-xs prose-p:text-xs prose-ul:text-xs prose-ol:text-xs  line-clamp-2 max-w-none text-left text-xs text-gray-600"
        >
          <Markdown options={markdownOptions}>{description}</Markdown>
        </div>
        {isClamped && (
          <button
            onClick={() => setIsModalOpen(true)}
            className=" cursor-pointer self-start text-xs text-gray-500 hover:text-gray-700"
          >
            Read more
          </button>
        )}
      </div>
      {isModalOpen && (
        <Dialog open onOpenChange={(open) => !open && setIsModalOpen(false)}>
          <DialogContent className=" max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{productName}</DialogTitle>
              <DialogDescription className="sr-only">
                Product description
              </DialogDescription>
            </DialogHeader>
            <div className="prose prose-headings:mt-4 prose-headings:font-medium prose-headings:text-black prose-h1:text-xl prose-h2:text-lg prose-h3:text-md   p-2 leading-normal text-gray-800">
              <Markdown options={markdownOptions}>{description}</Markdown>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

export interface CheckoutProps {
  embed?: boolean
  theme?: 'light' | 'dark'
  locale?: string
  preview?: boolean
  showLogo?: boolean
  showMedia?: boolean
  showDescription?: boolean
}

const Checkout = ({
  embed: _embed,
  theme: _theme,
  locale: localeProp,
  preview = false,
  showLogo = true,
  showMedia = true,
  showDescription = true,
}: CheckoutProps) => {
  const { client } = useCheckout()
  const {
    checkout,
    form,
    update: _update,
    confirm: _confirm,
    loading: confirmLoading,
    loadingLabel,
    isUpdatePending,
  } = useCheckoutForm()
  const embed = _embed === true
  const theme = _theme || 'light'
  const posthog = usePostHog()

  const openedTrackedRef = useRef(false)
  useEffect(() => {
    if (openedTrackedRef.current) return
    openedTrackedRef.current = true

    const cookies = document.cookie.split(';')
    const distinctIdCookie = cookies.find((c) =>
      c.trim().startsWith('polar_distinct_id='),
    )
    const distinctId = distinctIdCookie?.split('=')[1]?.trim()

    fetch(
      getServerURL(`/v1/checkouts/client/${checkout.clientSecret}/opened`),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distinct_id: distinctId }),
      },
    ).catch(() => {
      // Silently ignore - don't affect checkout experience
    })
  }, [checkout.clientSecret])

  const themePreset = getThemePreset(checkout.organization.slug, theme)
  const enrichedCheckout = enrichCheckout(checkout)

  // Check organization payment readiness (account verification only for checkout)
  const { data: paymentStatus } = useOrganizationPaymentStatus(
    checkout.organization.id,
    true,
    true,
  )

  const isPaymentReady = paymentStatus?.payment_ready ?? true
  const isPaymentRequired = checkout.isPaymentRequired
  const shouldBlockCheckout = !isPaymentReady && isPaymentRequired && !preview

  useEffect(() => {
    if (shouldBlockCheckout && paymentStatus) {
      posthog.capture('storefront:subscriptions:payment_not_ready:view', {
        organization_slug: checkout.organization.slug,
        organization_status: paymentStatus?.organization_status,
        product_id: checkout.productId,
      })
    }
  }, [
    paymentStatus,
    shouldBlockCheckout,
    checkout.organization.slug,
    paymentStatus?.organization_status,
    checkout.productId,
    posthog,
  ])

  const PaymentNotReadyBanner = () => {
    if (!shouldBlockCheckout || preview) return null

    const isDenied = paymentStatus?.organization_status === 'denied'

    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800  ">
        <span className="font-medium">Payments are currently unavailable. </span>
        {isDenied
          ? `${checkout.organization.name} doesn't allow payments.`
          : `${checkout.organization.name} needs to complete their payment setup. You can still test with free products or 100% discount orders.`}
      </div>
    )
  }

  const [fullLoading, setFullLoading] = useState(false)
  const loading = useMemo(
    () => confirmLoading || fullLoading,
    [confirmLoading, fullLoading],
  )
  const [listenFulfillment, fullfillmentLabel] = useCheckoutFulfillmentListener(
    client,
    checkout,
  )
  const label = useMemo(
    () => fullfillmentLabel || loadingLabel,
    [fullfillmentLabel, loadingLabel],
  )
  const checkoutConfirmedRedirect = useCheckoutConfirmedRedirect(
    embed,
    theme,
    listenFulfillment,
  )

  const update = useCallback(
    async (data: CheckoutUpdatePublic) => {
      try {
        return await _update(data)
      } catch (error) {
        if (error instanceof ExpiredCheckoutError) {
          window.location.reload()
        }
        throw error
      }
    },
    [_update],
  )

  const confirm = useCallback(
    async (
      data: CheckoutConfirmStripe,
      stripe: Stripe | null,
      elements: StripeElements | null,
    ) => {
      setFullLoading(true)
      let confirmedCheckout: CheckoutPublicConfirmed
      try {
        confirmedCheckout = await _confirm(data, stripe, elements)
      } catch (error) {
        if (error instanceof ExpiredCheckoutError) {
          window.location.reload()
        }
        setFullLoading(false)
        throw error
      }

      await checkoutConfirmedRedirect(
        checkout,
        confirmedCheckout.customerSessionToken,
      )

      return confirmedCheckout
    },
    [_confirm, checkout, checkoutConfirmedRedirect],
  )

  if (embed) {
    return (
      <ShadowBox className=" flex flex-col gap-y-12 divide-gray-200 overflow-hidden rounded-3xl md:bg-white">
        <PaymentNotReadyBanner />
        {enrichedCheckout && (
          <>
            <CheckoutProductSwitcher
              checkout={enrichedCheckout}
              update={
                update as (
                  data: CheckoutUpdatePublic,
                ) => Promise<ProductCheckoutPublic>
              }
              themePreset={themePreset}
            />
            {enrichedCheckout.productPrice?.amountType === 'custom' && (
              <CheckoutPWYWForm
                checkout={enrichedCheckout}
                update={update}
                productPrice={enrichedCheckout.productPrice as ProductPriceCustom}
                themePreset={themePreset}
              />
            )}
          </>
        )}
        <CheckoutForm
          form={form}
          checkout={checkout}
          update={update}
          confirm={confirm}
          loading={loading}
          loadingLabel={label}
          theme={theme}
          themePreset={themePreset}
          disabled={shouldBlockCheckout}
          isUpdatePending={isUpdatePending}
          locale={localeProp ?? checkout.locale ?? undefined}
        />
      </ShadowBox>
    )
  }

  const hasMedia =
    !!enrichedCheckout &&
    enrichedCheckout.product.medias.length > 0 &&
    showMedia

  const orgHeader = (
    <div className="flex flex-row items-center gap-x-4">
      {checkout.returnUrl && (
        <Link
          href={checkout.returnUrl}
          className=" text-gray-600"
        >
          <ArrowBackOutlined fontSize="small" />
        </Link>
      )}
      <div className="flex flex-row items-center gap-x-2">
        {showLogo && (
          <Avatar
            avatar_url={checkout.organization.avatarUrl}
            name={checkout.organization.name}
            className="h-6 w-6"
          />
        )}
        <span className="text-sm">
          {checkout.organization.name}
        </span>
      </div>
    </div>
  )

  return (
    <div className="md:grid md:min-h-screen md:grid-cols-2">
      <div className="md:flex md:justify-end">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-y-8 px-4 py-6 md:mx-0 md:py-12 md:pr-12 md:pl-4">
          {orgHeader}
          <div className="flex flex-col gap-y-8 md:sticky md:top-8">
            {enrichedCheckout && (
              <>
                {/* Name + price + all pricing details first */}
                <div className="flex flex-col gap-y-4">
                  <span className="text-lg font-semibold text-gray-900">
                    {enrichedCheckout.product.name}
                  </span>
                  <span className="text-3xl font-medium">
                    <CheckoutHeroPrice checkout={enrichedCheckout} />
                  </span>
                </div>
                <CheckoutProductSwitcher
                  checkout={enrichedCheckout}
                  update={
                    update as (
                      data: CheckoutUpdatePublic,
                    ) => Promise<ProductCheckoutPublic>
                  }
                  themePreset={themePreset}
                />
                {enrichedCheckout.productPrice?.amountType === 'custom' && (
                  <CheckoutPWYWForm
                    checkout={enrichedCheckout}
                    update={update}
                    productPrice={enrichedCheckout.productPrice as ProductPriceCustom}
                    themePreset={themePreset}
                  />
                )}
                {!enrichedCheckout.isFreeProductPrice && (
                  <div className="flex flex-col gap-4 text-sm">
                    {enrichedCheckout.productPrice?.amountType === 'seat_based' && (
                      <CheckoutSeatSelector
                        checkout={enrichedCheckout}
                        update={
                          update as (
                            data: CheckoutUpdatePublic,
                          ) => Promise<ProductCheckoutPublic>
                        }
                      />
                    )}
                    <CheckoutPricingBreakdown checkout={enrichedCheckout} />
                    <CheckoutDiscountInput
                      checkout={enrichedCheckout}
                      update={update}
                      collapsible
                    />
                  </div>
                )}

                {/* Media carousel — just above description */}
                {hasMedia && (
                  <div className="overflow-hidden rounded-2xl border border-gray-200">
                    <Slideshow
                      images={enrichedCheckout.product.medias.map(
                        (m) => m.publicUrl,
                      )}
                    />
                  </div>
                )}

                {/* Plain-text description */}
                {enrichedCheckout.product.description &&
                  !hasMarkdown(enrichedCheckout.product.description) &&
                  showDescription && (
                    <TruncatedDescription
                      description={enrichedCheckout.product.description}
                      productName={enrichedCheckout.product.name}
                    />
                  )}

                {/* Markdown description */}
                {enrichedCheckout.product.description &&
                  hasMarkdown(enrichedCheckout.product.description) && (
                    <div
                      id="description"
                      className="prose prose-headings:mt-4 prose-headings:font-medium prose-headings:text-black prose-h1:text-xl prose-h2:text-lg prose-h3:text-md   leading-normal text-gray-800"
                    >
                      <Markdown options={markdownOptions}>
                        {enrichedCheckout.product.description}
                      </Markdown>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      </div>
      <div className=" md:bg-white">
        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-y-8 px-4 py-6 md:mx-0 md:py-12 md:pr-4 md:pl-12">
          <PaymentNotReadyBanner />
          <CheckoutForm
            form={form}
            checkout={checkout}
            update={update}
            confirm={confirm}
            loading={loading}
            loadingLabel={label}
            theme={theme}
            themePreset={themePreset}
            disabled={shouldBlockCheckout}
            isUpdatePending={isUpdatePending}
            locale={localeProp ?? checkout.locale ?? undefined}
            hidePricingBreakdown
          />
        </div>
      </div>
    </div>
  )
}

export default Checkout
