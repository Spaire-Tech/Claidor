'use client'

import InvoiceDocument, {
  type InvoiceDocumentData,
} from '@/app/(main)/dashboard/[organization]/(header)/sales/invoices/InvoiceDocument'
import { useCustomer } from '@/hooks/queries'
import { schemas } from '@spaire/client'
import { format } from 'date-fns'
import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import type { InvoiceFormValues } from './InvoiceForm'
import { computeDiscountCents } from './InvoiceForm'

interface InvoicePreviewPanelProps {
  organization: schemas['Organization']
  showLogo: boolean
  showMorAttribution: boolean
  selectedDiscount: schemas['Discount'] | null
  selectedCheckoutLink: schemas['CheckoutLink'] | null
}

export const InvoicePreviewPanel = ({
  organization,
  showLogo,
  showMorAttribution,
  selectedDiscount,
  selectedCheckoutLink,
}: InvoicePreviewPanelProps) => {
  const { control } = useFormContext<InvoiceFormValues>()

  const customerId = useWatch({ control, name: 'customer_id' })
  const currency = useWatch({ control, name: 'currency' })
  const lineItems = useWatch({ control, name: 'line_items' })
  const dueDate = useWatch({ control, name: 'due_date' })
  const memo = useWatch({ control, name: 'memo' })
  const poNumber = useWatch({ control, name: 'po_number' })
  const onBehalfOfLabel = useWatch({ control, name: 'on_behalf_of_label' })
  const billingLine1 = useWatch({ control, name: 'billing_line1' })
  const billingLine2 = useWatch({ control, name: 'billing_line2' })
  const billingCity = useWatch({ control, name: 'billing_city' })
  const billingState = useWatch({ control, name: 'billing_state' })
  const billingPostalCode = useWatch({ control, name: 'billing_postal_code' })
  const billingCountry = useWatch({ control, name: 'billing_country' })

  const { data: selectedCustomer } = useCustomer(customerId || null)

  const previewData = useMemo((): InvoiceDocumentData => {
    const items = (lineItems ?? []).map((item) => ({
      description: item.description || '',
      quantity: Number(item.quantity) || 1,
      unitAmount: Math.round((parseFloat(item.unit_amount) || 0) * 100),
    }))

    const subtotalAmount = items.reduce(
      (sum, item) => sum + item.unitAmount * item.quantity,
      0,
    )

    const discountAmount = selectedDiscount
      ? computeDiscountCents(selectedDiscount, subtotalAmount)
      : 0

    const totalAmount = Math.max(0, subtotalAmount - discountAmount)

    const hasAddress = billingLine1 || billingCity || billingCountry
    const customerAddress = hasAddress
      ? {
          line1: billingLine1 || null,
          line2: billingLine2 || null,
          city: billingCity || null,
          state: billingState || null,
          postalCode: billingPostalCode || null,
          country: billingCountry || null,
        }
      : null

    // Default due date to today if not set (like Stripe preview)
    const defaultDueDate = format(new Date(), 'yyyy-MM-dd')

    return {
      invoiceNumber: 'DRAFT',
      status: 'draft',
      issueDate: new Date(),
      dueDate: dueDate || defaultDueDate,
      currency: currency || 'usd',
      customerName: selectedCustomer
        ? (selectedCustomer as any).name ?? (selectedCustomer as any).email
        : undefined,
      customerEmail: selectedCustomer
        ? (selectedCustomer as any).email
        : undefined,
      customerAddress,
      onBehalfOfLabel: onBehalfOfLabel || undefined,
      organizationName: organization.name,
      organizationLogoUrl: organization.avatar_url ?? undefined,
      showLogo,
      showMorAttribution,
      sellerName: 'Spaire, Inc.',
      sellerAddress: '1111B S Governors Ave\n# 47283\nDover, US-DE 19904\nUnited States',
      sellerAdditionalInfo: 'support@spairehq.com',
      lineItems: items,
      subtotalAmount,
      discountAmount,
      discountLabel: selectedDiscount?.name ?? undefined,
      taxAmount: 0,
      totalAmount,
      memo: memo || undefined,
      poNumber: poNumber || undefined,
      checkoutLink: selectedCheckoutLink?.url ?? null,
    }
  }, [
    lineItems,
    currency,
    dueDate,
    memo,
    poNumber,
    onBehalfOfLabel,
    billingLine1,
    billingLine2,
    billingCity,
    billingState,
    billingPostalCode,
    billingCountry,
    selectedCustomer,
    selectedDiscount,
    selectedCheckoutLink,
    organization,
    showLogo,
    showMorAttribution,
  ])

  return (
    <div className="flex h-full flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-2.5 ">
        <span className="text-sm font-medium">Preview</span>
      </div>

      {/* Preview area — white paper on gray background */}
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
        <div className="w-full max-w-[560px] rounded-sm shadow-lg">
          <InvoiceDocument data={previewData} isPreview />
        </div>
      </div>
    </div>
  )
}
