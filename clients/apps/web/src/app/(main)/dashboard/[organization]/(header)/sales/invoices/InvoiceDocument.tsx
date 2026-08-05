'use client'

import { formatCurrency } from '@spaire/currency'
import { format } from 'date-fns'

export interface InvoiceDocumentData {
  invoiceNumber?: string
  status?: string
  issueDate?: Date | string | null
  dueDate?: Date | string | null
  currency: string
  customerName?: string
  customerEmail?: string
  customerAddress?: {
    line1?: string | null
    line2?: string | null
    city?: string | null
    state?: string | null
    postalCode?: string | null
    country?: string | null
  } | null
  onBehalfOfLabel?: string
  organizationName?: string
  organizationLogoUrl?: string
  showLogo?: boolean
  showMorAttribution?: boolean
  sellerName?: string
  sellerAddress?: string
  sellerAdditionalInfo?: string
  lineItems: Array<{
    description: string
    quantity: number
    unitAmount: number
  }>
  subtotalAmount: number
  discountAmount: number
  discountLabel?: string
  taxAmount: number
  totalAmount: number
  memo?: string
  poNumber?: string
  checkoutLink?: string | null
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '—'
  try {
    const date = typeof d === 'string' ? new Date(d) : d
    return format(date, 'MMMM d, yyyy')
  } catch {
    return '—'
  }
}

function formatAddress(addr: InvoiceDocumentData['customerAddress']): string[] {
  if (!addr) return []
  const lines: string[] = []
  if (addr.line1) lines.push(addr.line1)
  if (addr.line2) lines.push(addr.line2)
  const cityLine = [addr.city, addr.state, addr.postalCode]
    .filter(Boolean)
    .join(', ')
  if (cityLine) lines.push(cityLine)
  if (addr.country) lines.push(addr.country)
  return lines
}

const InvoiceDocument: React.FC<{
  data: InvoiceDocumentData
  isPreview?: boolean
}> = ({ data, isPreview }) => {
  const fmt = (cents: number) => formatCurrency('accounting')(cents, data.currency)
  const currency = data.currency.toUpperCase()
  const sellerName = data.sellerName || 'Spaire, Inc.'
  const onBehalf = data.onBehalfOfLabel || data.organizationName || sellerName

  const headingItems: Array<{ label: string; value: string }> = [
    { label: 'Invoice number', value: data.invoiceNumber || 'DRAFT' },
    { label: 'Date of issue', value: fmtDate(data.issueDate ?? new Date()) },
  ]
  if (data.dueDate) {
    headingItems.push({ label: 'Date due', value: fmtDate(data.dueDate) })
  }
  if (data.onBehalfOfLabel) {
    headingItems.push({ label: 'On behalf of', value: data.onBehalfOfLabel })
  }

  const dueLine = data.dueDate
    ? `${fmt(data.totalAmount)} due ${fmtDate(data.dueDate)}`
    : `${fmt(data.totalAmount)} ${currency}`

  const customerAddressLines = formatAddress(data.customerAddress)

  // Footer summary line
  const footerAmount = `${fmt(data.totalAmount)} ${currency}`
  const footerSummary = data.dueDate
    ? `${data.invoiceNumber || 'DRAFT'} \u00b7 ${footerAmount} due ${fmtDate(data.dueDate)}`
    : `${data.invoiceNumber || 'DRAFT'} \u00b7 ${footerAmount}`

  return (
    <div className="bg-white text-black" style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: '10px', lineHeight: 1.5 }}>
      {isPreview && (
        <div className="border-b border-dashed border-gray-300 bg-gray-50 px-6 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            Invoice Preview
          </span>
        </div>
      )}

      {/* Page container with letter-size aspect ratio */}
      <div className="relative flex flex-col" style={{ padding: '40px', minHeight: isPreview ? '680px' : '792px' }}>
        {/* Main content */}
        <div className="flex-1">
          {/* Header: Title + Logo */}
          <div className="flex items-start justify-between">
            <h1 style={{ fontSize: '18px', fontWeight: 700 }}>Invoice</h1>
            {data.showLogo !== false && data.organizationLogoUrl ? (
              <div className="flex flex-col items-center">
                <img
                  src={data.organizationLogoUrl}
                  alt={data.organizationName ?? 'Logo'}
                  className="rounded object-cover"
                  style={{ width: '48px', height: '48px' }}
                />
                {data.showMorAttribution !== false && (
                  <span className="mt-1 text-center" style={{ fontSize: '6px', color: '#646464' }}>
                    via spaire
                  </span>
                )}
              </div>
            ) : (
              <div style={{ width: '48px' }} />
            )}
          </div>

          {/* Heading Items */}
          <div className="mt-4 flex flex-col gap-0.5">
            {headingItems.map((item) => (
              <div key={item.label} className="flex gap-2" style={{ fontSize: '10px' }}>
                <span style={{ fontWeight: 700, width: '100px', flexShrink: 0 }}>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Addresses */}
          <div className="mt-6 grid grid-cols-2 gap-8" style={{ fontSize: '10px' }}>
            {/* Seller */}
            <div>
              <p style={{ fontWeight: 700 }}>{sellerName}</p>
              {data.sellerAddress && (
                <p style={{ whiteSpace: 'pre-line' }}>{data.sellerAddress}</p>
              )}
              {data.sellerAdditionalInfo && (
                <p>{data.sellerAdditionalInfo}</p>
              )}
            </div>
            {/* Customer */}
            <div>
              <p style={{ fontWeight: 700 }}>Bill to</p>
              {data.customerName ? (
                <>
                  <p style={{ fontWeight: 700 }}>{data.customerName}</p>
                  {customerAddressLines.length > 0 && (
                    <div>
                      {customerAddressLines.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))}
                    </div>
                  )}
                  {data.customerEmail && !data.customerName.includes('@') && (
                    <p>{data.customerEmail}</p>
                  )}
                </>
              ) : (
                <p style={{ color: '#999' }}>Example Customer</p>
              )}
            </div>
          </div>

          {/* Amount Due Headline */}
          <div className="mt-6">
            <p style={{ fontSize: '14px', fontWeight: 700 }}>{dueLine}</p>
            {data.checkoutLink && (
              <p className="mt-1" style={{ fontSize: '10px', color: '#2563eb' }}>
                Pay online
              </p>
            )}
          </div>

          {/* Items Table */}
          <div className="mt-4">
            <div
              className="grid border-b pb-1"
              style={{
                gridTemplateColumns: '1fr 60px 80px 80px',
                fontSize: '8px',
                color: '#000',
                fontWeight: 600,
                letterSpacing: '0.02em',
                borderColor: '#dcdcdc',
              }}
            >
              <span>Description</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
            </div>

            {data.lineItems.length === 0 ? (
              <div className="py-6 text-center" style={{ color: '#aaa', fontSize: '10px' }}>
                No items yet
              </div>
            ) : (
              data.lineItems.map((item, i) => (
                <div
                  key={i}
                  className="grid border-b py-1.5"
                  style={{
                    gridTemplateColumns: '1fr 60px 80px 80px',
                    fontSize: '10px',
                    borderColor: '#dcdcdc',
                  }}
                >
                  <span>{item.description || '—'}</span>
                  <span className="text-right">{item.quantity.toLocaleString('en-US')}</span>
                  <span className="text-right">{fmt(item.unitAmount)}</span>
                  <span className="text-right">{fmt(item.unitAmount * item.quantity)}</span>
                </div>
              ))
            )}
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="flex flex-col gap-1" style={{ width: '180px', fontSize: '10px' }}>
              <div className="flex justify-between">
                <span style={{ fontWeight: 700 }}>Subtotal</span>
                <span>{fmt(data.subtotalAmount)}</span>
              </div>
              {data.discountAmount > 0 && (
                <div className="flex justify-between">
                  <span style={{ fontWeight: 700 }}>{data.discountLabel ?? 'Discount'}</span>
                  <span>-{fmt(data.discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ fontWeight: 700 }}>Sales Tax</span>
                <span>{data.taxAmount > 0 ? fmt(data.taxAmount) : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ fontWeight: 700 }}>Total</span>
                <span>{fmt(data.totalAmount)}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span style={{ fontWeight: 700 }}>Amount due</span>
                <span style={{ fontWeight: 700 }}>{fmt(data.totalAmount)} {currency}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {data.memo && (
            <div className="mt-6" style={{ fontSize: '10px' }}>
              <p>{data.memo}</p>
            </div>
          )}
        </div>

        {/* Footer — pinned to bottom */}
        <div className="mt-auto pt-6">
          {/* Separator + legal text below */}
          <div style={{ borderTop: '1px solid #dcdcdc', paddingTop: '10px' }}>
            <div style={{ fontSize: '8px', color: '#646464', textAlign: 'center' }}>
              <p>
                This invoice is issued by Spaire, Inc. on behalf of Spairehq. Spaire, Inc. acts as the Merchant of Record for this transaction. &copy; 2026 Spaire, Inc. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InvoiceDocument
