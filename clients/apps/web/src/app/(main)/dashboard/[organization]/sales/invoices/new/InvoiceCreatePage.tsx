'use client'

import {
  InvoiceFormContent,
  useInvoiceForm,
} from '@/components/Invoices/InvoiceForm'
import { InvoicePreviewPanel } from '@/components/Invoices/InvoicePreviewPanel'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import { schemas } from '@spaire/client'
import {
  Form,
} from '@spaire/ui/components/ui/form'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Switch from '@spaire/ui/components/atoms/Switch'

export const InvoiceCreatePage = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const router = useRouter()
  const [showLogo, setShowLogo] = useState(true)
  const [showMorAttribution, setShowMorAttribution] = useState(true)

  const handleClose = (invoiceId?: string) => {
    if (invoiceId) {
      router.push(
        `/dashboard/${organization.slug}/invoices/${invoiceId}`,
      )
    }
  }

  const {
    form,
    isSubmitting,
    selectedDiscount,
    setSelectedDiscount,
    selectedCheckoutLink,
    setSelectedCheckoutLink,
    onSubmit,
    handleSubmit,
  } = useInvoiceForm(organization, handleClose, { showLogo, showMorAttribution })

  return (
    <Form {...form}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        {/* Left panel — form */}
        <div className="flex w-full md:w-1/2 shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white ">
          <div className="border-b border-gray-200 px-6 py-4">
            <Link
              href={`/dashboard/${organization.slug}/invoices`}
              className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black "
            >
              <ArrowBackOutlined fontSize="small" />
              <span>Back to Invoices</span>
            </Link>
          </div>
          <div className="flex flex-col gap-6 overflow-y-auto px-8 py-8">
            <h1 className="text-xl font-semibold text-gray-900">
              Create Invoice
            </h1>

            {/* Display toggles */}
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Display Options
              </p>
              <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                <label className="flex cursor-pointer items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-700">
                    Show organization logo
                  </span>
                  <Switch
                    checked={showLogo}
                    onCheckedChange={setShowLogo}
                  />
                </label>
                <label className="flex cursor-pointer items-center justify-between px-4 py-3">
                  <span className="text-sm text-gray-700">
                    Show &ldquo;via Spaire&rdquo; attribution
                  </span>
                  <Switch
                    checked={showMorAttribution}
                    onCheckedChange={setShowMorAttribution}
                  />
                </label>
              </div>
            </div>

            <InvoiceFormContent
              organization={organization}
              isSubmitting={isSubmitting}
              selectedDiscount={selectedDiscount}
              setSelectedDiscount={setSelectedDiscount}
              selectedCheckoutLink={selectedCheckoutLink}
              setSelectedCheckoutLink={setSelectedCheckoutLink}
              onSubmit={handleSubmit(onSubmit)}
            />
          </div>
        </div>

        {/* Right panel — live preview */}
        <div className="hidden md:flex flex-1 flex-col overflow-hidden">
          <InvoicePreviewPanel
            organization={organization}
            showLogo={showLogo}
            showMorAttribution={showMorAttribution}
            selectedDiscount={selectedDiscount}
            selectedCheckoutLink={selectedCheckoutLink}
          />
        </div>
      </div>
    </Form>
  )
}
