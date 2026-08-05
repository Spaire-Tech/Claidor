'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { DownloadInvoiceDashboard } from '@/components/Orders/DownloadInvoice'
import { DetailRow } from '@/components/Shared/DetailRow'
import { toast } from '@/components/Toast/use-toast'
import {
  useClientInvoice,
  useFinalizeClientInvoice,
  useMarkClientInvoicePaid,
  useSendClientInvoice,
  useVoidClientInvoice,
} from '@/hooks/queries/client_invoices'
import { useCustomer } from '@/hooks/queries/customers'
import { api } from '@/utils/client'
import { schemas, unwrap } from '@spaire/client'
import { formatCurrency } from '@spaire/currency'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Button from '@spaire/ui/components/atoms/Button'
import FormattedDateTime from '@spaire/ui/components/atoms/FormattedDateTime'
import ShadowBox from '@spaire/ui/components/atoms/ShadowBox'
import { Status } from '@spaire/ui/components/atoms/Status'
import { Separator } from '@radix-ui/react-dropdown-menu'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import React, { useState } from 'react'
import { twMerge } from 'tailwind-merge'

interface InvoicePageProps {
  organization: schemas['Organization']
  invoiceId: string
  panelMode?: boolean
  onClose?: () => void
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-yellow-100 text-yellow-500',
  open: 'bg-blue-100 text-blue-500',
  paid: 'bg-emerald-100 text-emerald-500',
  void: 'bg-gray-100 text-gray-500',
  uncollectible: 'bg-red-100 text-red-500',
}

// Simple customer sidebar — just the essentials for invoice context
const InvoiceCustomerSidebar = ({
  customer,
  organization,
}: {
  customer: schemas['Customer']
  organization: schemas['Organization']
}) => {
  const addr = customer.billing_address
  return (
    <div className="flex flex-col gap-3">
      <ShadowBox className=" flex flex-col gap-4 border-gray-200 bg-white p-6 md:shadow-xs lg:rounded-2xl">
        <Link
          href={`/dashboard/${organization.slug}/customers/${customer.id}`}
          className="flex items-center gap-3"
        >
          <Avatar
            avatar_url={customer.avatar_url}
            name={customer.name || customer.email}
            className="size-10 text-sm"
          />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {customer.name || '—'}
            </p>
            <p className=" truncate text-sm text-gray-500">
              {customer.email}
            </p>
          </div>
        </Link>
      </ShadowBox>

      {addr && (
        <ShadowBox className=" flex flex-col gap-3 border-gray-200 bg-white p-6 md:shadow-xs lg:rounded-2xl">
          <p className=" text-xs font-semibold uppercase tracking-wide text-gray-400">
            Billing Address
          </p>
          <div className="flex flex-col gap-0.5 text-sm">
            {addr.line1 && <span>{addr.line1}</span>}
            {addr.line2 && <span>{addr.line2}</span>}
            <span>
              {[addr.city, addr.state, addr.postal_code]
                .filter(Boolean)
                .join(', ')}
            </span>
            {addr.country && <span>{addr.country}</span>}
          </div>
        </ShadowBox>
      )}
    </div>
  )
}

const InvoicePage: React.FC<InvoicePageProps> = ({
  organization,
  invoiceId,
  panelMode = false,
  onClose,
}) => {
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const { data: invoice, isLoading, refetch } = useClientInvoice(invoiceId)
  const { data: customer } = useCustomer(
    invoice ? invoice.customer_id.toString() : null,
  )
  const { data: linkedOrder } = useQuery({
    queryKey: ['orders', { id: invoice?.order_id }],
    queryFn: () =>
      unwrap(
        api.GET('/v1/orders/{id}', {
          params: { path: { id: invoice!.order_id! } },
        }),
      ),
    enabled: !!invoice?.order_id,
  })

  const sendInvoice = useSendClientInvoice(invoiceId)
  const voidInvoice = useVoidClientInvoice(invoiceId)
  const finalizeInvoice = useFinalizeClientInvoice(invoiceId)
  const markPaid = useMarkClientInvoicePaid(invoiceId)

  if (isLoading || !invoice) {
    if (panelMode) {
      return (
        <div className="flex h-full flex-col">
          <InlineModalHeader hide={onClose ?? (() => {})}>
            <span>Invoice</span>
          </InlineModalHeader>
          <div className="p-8">
            <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        </div>
      )
    }
    return (
      <DashboardBody title="Invoice" wrapperClassName="max-w-(--breakpoint-lg)!">
        <div className="h-96 animate-pulse rounded-2xl bg-gray-100" />
      </DashboardBody>
    )
  }

  const handleSend = async () => {
    try {
      await sendInvoice.mutateAsync()
      toast({ title: 'Invoice sent successfully' })
    } catch (err: any) {
      toast({
        title: 'Failed to send invoice',
        description: err?.detail ?? String(err),
      })
    }
  }

  const handleDownload = async () => {
    const pdfUrl = `${process.env.NEXT_PUBLIC_API_URL}/v1/client-invoices/${invoice.id}/pdf`
    if (invoice.status !== 'draft') {
      window.open(pdfUrl, '_blank', 'noopener')
      return
    }
    // Draft — finalize first so amounts are locked, then open our PDF
    setIsDownloading(true)
    try {
      await finalizeInvoice.mutateAsync()
      window.open(pdfUrl, '_blank', 'noopener')
    } catch (err: any) {
      toast({
        title: 'Failed to generate invoice',
        description: err?.detail ?? String(err),
      })
    } finally {
      setIsDownloading(false)
    }
  }

  const handleVoid = async () => {
    if (!confirmVoid) {
      setConfirmVoid(true)
      return
    }
    try {
      await voidInvoice.mutateAsync()
      toast({ title: 'Invoice voided' })
      setConfirmVoid(false)
    } catch (err: any) {
      toast({
        title: 'Failed to void invoice',
        description: err?.detail ?? String(err),
      })
      setConfirmVoid(false)
    }
  }

  const isDraft = invoice.status === 'draft'
  const isOpen = invoice.status === 'open'
  const isPaid = invoice.status === 'paid'
  const isVoid = invoice.status === 'void'
  const isVoidable = isDraft || isOpen
  const canSend = isDraft || isOpen
  const canMarkPaid = isDraft || isOpen

  const handleMarkPaid = async () => {
    try {
      await markPaid.mutateAsync()
      toast({ title: 'Invoice marked as paid' })
    } catch (err: any) {
      toast({
        title: 'Failed to mark invoice as paid',
        description: err?.detail ?? String(err),
      })
    }
  }

  const fmt = (cents: number) =>
    formatCurrency('accounting')(cents, invoice.currency)

  const actionButtons = (
    <div className="flex items-center gap-2 flex-wrap">
      {canSend && (
        <Button loading={sendInvoice.isPending} onClick={handleSend}>
          Send Invoice
        </Button>
      )}
      {canMarkPaid && (
        <Button
          variant="secondary"
          loading={markPaid.isPending}
          onClick={handleMarkPaid}
          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50  "
        >
          Mark as Paid
        </Button>
      )}
      {!isVoid && (
        isPaid && linkedOrder ? (
          <DownloadInvoiceDashboard
            order={linkedOrder}
            organization={organization}
            onInvoiceGenerated={refetch}
          />
        ) : (
          <Button
            variant="secondary"
            loading={isDownloading || finalizeInvoice.isPending}
            onClick={handleDownload}
          >
            Download Invoice
          </Button>
        )
      )}
      {isVoidable && (
        <Button
          variant="secondary"
          loading={voidInvoice.isPending}
          onClick={handleVoid}
          className={
            confirmVoid
              ? 'border-red-300 text-red-600 hover:bg-red-50  '
              : ' text-gray-500'
          }
        >
          {confirmVoid ? 'Confirm void?' : 'Void'}
        </Button>
      )}
    </div>
  )

  if (panelMode) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose ?? (() => {})}>
          <div className="flex items-center gap-3">
            <span>Invoice</span>
            <Status
              status={invoice.status}
              className={twMerge(STATUS_COLOR[invoice.status], 'capitalize')}
            />
          </div>
        </InlineModalHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-8 pb-8">
          {actionButtons}
          <ShadowBox className=" flex flex-col divide-y divide-gray-200 border-gray-200 bg-transparent p-0 md:rounded-3xl!">
            <div className="flex flex-col gap-6 p-4 md:p-8">
              <div className="flex flex-col gap-1">
                <DetailRow label="Invoice ID" value={invoice.id.slice(0, 8).toUpperCase()} valueClassName="font-mono text-sm" />
                <DetailRow label="Invoice date" value={<FormattedDateTime dateStyle="medium" resolution="time" datetime={invoice.created_at} />} />
                {invoice.due_date && <DetailRow label="Due date" value={<FormattedDateTime dateStyle="medium" datetime={invoice.due_date} />} />}
                <DetailRow label="Status" value={<Status status={invoice.status} className={twMerge(STATUS_COLOR[invoice.status], 'w-fit capitalize')} />} />
                <DetailRow label="Currency" value={invoice.currency.toUpperCase()} />
                {invoice.po_number && <DetailRow label="PO number" value={invoice.po_number} />}
                {invoice.on_behalf_of_label && <DetailRow label="On behalf of" value={invoice.on_behalf_of_label} />}
                <Separator className=" my-4 h-px bg-gray-300" />
                <div className="flex flex-col gap-1 pb-4">
                  {invoice.line_items.map((item) => (
                    <DetailRow
                      key={item.id}
                      label={item.quantity > 1 ? `${item.description} × ${item.quantity}` : item.description}
                      value={fmt(item.unit_amount * item.quantity)}
                    />
                  ))}
                </div>
                <DetailRow label="Subtotal" value={fmt(invoice.subtotal_amount)} />
                <DetailRow label="Discount" value={invoice.discount_amount ? fmt(-invoice.discount_amount) : '—'} />
                <DetailRow label="Sales Tax" value={invoice.tax_amount > 0 ? fmt(invoice.tax_amount) : '—'} />
                <DetailRow label="Total" value={fmt(invoice.total_amount)} />
                {invoice.memo && (
                  <>
                    <Separator className=" my-4 h-px bg-gray-300" />
                    <DetailRow label="Note" value={invoice.memo} />
                  </>
                )}
                {linkedOrder?.invoice_number && (
                  <>
                    <Separator className=" my-4 h-px bg-gray-300" />
                    <DetailRow label="Invoice number" value={linkedOrder.invoice_number} />
                  </>
                )}
              </div>
            </div>
          </ShadowBox>
          {customer && (
            <InvoiceCustomerSidebar
              organization={organization}
              customer={customer as schemas['Customer']}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <DashboardBody
      title={
        <div className="flex flex-row items-center gap-4">
          <h2 className="text-xl font-normal">Invoice</h2>
          <Status
            status={invoice.status}
            className={twMerge(STATUS_COLOR[invoice.status], 'capitalize')}
          />
        </div>
      }
      header={actionButtons}
      className="gap-y-12"
      contextView={
        customer ? (
          <InvoiceCustomerSidebar
            organization={organization}
            customer={customer as schemas['Customer']}
          />
        ) : undefined
      }
      contextViewClassName="bg-transparent border-none rounded-none md:block hidden md:shadow-none"
    >
      <ShadowBox className=" flex flex-col divide-y divide-gray-200 border-gray-200 bg-transparent p-0 md:rounded-3xl!">
        <div className="flex flex-col gap-6 p-4 md:p-8">
          <div className="flex flex-col gap-1">
            <DetailRow
              label="Invoice ID"
              value={invoice.id.slice(0, 8).toUpperCase()}
              valueClassName="font-mono text-sm"
            />
            <DetailRow
              label="Invoice date"
              value={
                <FormattedDateTime
                  dateStyle="medium"
                  resolution="time"
                  datetime={invoice.created_at}
                />
              }
            />
            {invoice.due_date && (
              <DetailRow
                label="Due date"
                value={
                  <FormattedDateTime
                    dateStyle="medium"
                    datetime={invoice.due_date}
                  />
                }
              />
            )}
            <DetailRow
              label="Status"
              value={
                <Status
                  status={invoice.status}
                  className={twMerge(
                    STATUS_COLOR[invoice.status],
                    'w-fit capitalize',
                  )}
                />
              }
            />
            <DetailRow
              label="Currency"
              value={invoice.currency.toUpperCase()}
            />
            {invoice.po_number && (
              <DetailRow label="PO number" value={invoice.po_number} />
            )}
            {invoice.on_behalf_of_label && (
              <DetailRow
                label="On behalf of"
                value={invoice.on_behalf_of_label}
              />
            )}

            <Separator className=" my-4 h-px bg-gray-300" />

            {/* Line items */}
            <div className="flex flex-col gap-1 pb-4">
              {invoice.line_items.map((item) => (
                <DetailRow
                  key={item.id}
                  label={
                    item.quantity > 1
                      ? `${item.description} × ${item.quantity}`
                      : item.description
                  }
                  value={fmt(item.unit_amount * item.quantity)}
                />
              ))}
            </div>

            {/* Totals */}
            <DetailRow label="Subtotal" value={fmt(invoice.subtotal_amount)} />
            <DetailRow
              label="Discount"
              value={
                invoice.discount_amount ? fmt(-invoice.discount_amount) : '—'
              }
            />
            <DetailRow label="Sales Tax" value={invoice.tax_amount > 0 ? fmt(invoice.tax_amount) : '—'} />
            <DetailRow label="Total" value={fmt(invoice.total_amount)} />

            {/* Memo */}
            {invoice.memo && (
              <>
                <Separator className=" my-4 h-px bg-gray-300" />
                <DetailRow label="Note" value={invoice.memo} />
              </>
            )}

            {/* Invoice number from linked order (set after payment) */}
            {linkedOrder?.invoice_number && (
              <>
                <Separator className=" my-4 h-px bg-gray-300" />
                <DetailRow
                  label="Invoice number"
                  value={linkedOrder.invoice_number}
                />
              </>
            )}
          </div>
        </div>
      </ShadowBox>
    </DashboardBody>
  )
}

export default InvoicePage
