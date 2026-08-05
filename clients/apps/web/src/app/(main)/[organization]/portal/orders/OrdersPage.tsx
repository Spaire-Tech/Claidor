'use client'

import { Pagination } from '@/components/CustomerPortal/Pagination'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import * as React from 'react'
import { ChevronIcon, DownloadIcon, ExternalIcon } from '../_components/icons'
import { PortalSheet } from '../_components/PortalSheet'
import { useMediaMax } from '../_components/useMediaMax'
import { usePortalTheme } from '../usePortalTheme'

const PAGE_SIZE = 20

type StatusKind = 'paid' | 'refunded' | 'pending' | 'canceled'

const formatCurrency = (amountCents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(amountCents / 100)
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`
  }
}

const formatDate = (iso: string): string => {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

const statusKind = (order: schemas['CustomerOrder']): StatusKind => {
  if (
    order.refunded_amount > 0 &&
    order.refunded_amount >= order.total_amount
  ) {
    return 'refunded'
  }
  if (order.status === 'paid') return 'paid'
  if (order.status === 'pending') return 'pending'
  if (order.status === 'partially_refunded') return 'refunded'
  if (order.status === 'refunded') return 'refunded'
  return 'pending'
}

const statusLabel = (kind: StatusKind): string => {
  if (kind === 'paid') return 'Paid'
  if (kind === 'refunded') return 'Refunded'
  if (kind === 'pending') return 'Pending'
  return 'Canceled'
}

const StatusPill = ({ kind }: { kind: StatusKind }) => (
  <span className={`sp-pill is-${kind}`}>{statusLabel(kind)}</span>
)

const billingLabel = (order: schemas['CustomerOrder']): string => {
  switch (order.billing_reason) {
    case 'purchase':
      return 'One-time payment'
    case 'subscription_create':
      return 'Subscription started'
    case 'subscription_cycle':
      return 'Subscription renewal'
    case 'subscription_update':
      return 'Plan change'
    default:
      return 'Payment'
  }
}

// Line items + actions for one order — rendered inline in the desktop
// accordion and inside a bottom sheet on mobile.
const OrderDetailBody = ({
  order,
  orderHref,
  totalLabel,
}: {
  order: schemas['CustomerOrder']
  orderHref: string
  totalLabel: string
}) => (
  <>
    <table className="sp-table">
      <thead>
        <tr>
          <th>Item</th>
          <th style={{ width: 140 }}>Reason</th>
          <th style={{ width: 100, textAlign: 'right' }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {(order.items ?? []).map((item) => (
          <tr key={item.id}>
            <td>{item.label}</td>
            <td>
              <span className="sp-tag">
                {item.proration ? 'Proration' : 'Charge'}
              </span>
            </td>
            <td
              style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 500,
              }}
            >
              {formatCurrency(item.amount, order.currency)}
            </td>
          </tr>
        ))}
        {order.discount_amount > 0 && (
          <tr>
            <td>Discount</td>
            <td>
              <span className="sp-tag">Adjustment</span>
            </td>
            <td
              style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              −{formatCurrency(order.discount_amount, order.currency)}
            </td>
          </tr>
        )}
        {order.tax_amount > 0 && (
          <tr>
            <td>Tax</td>
            <td>
              <span className="sp-tag">VAT/Sales tax</span>
            </td>
            <td
              style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {formatCurrency(order.tax_amount, order.currency)}
            </td>
          </tr>
        )}
        {order.refunded_amount > 0 && (
          <tr>
            <td>Refunded</td>
            <td>
              <span className="sp-tag">Refund</span>
            </td>
            <td
              style={{
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--sp-muted)',
              }}
            >
              −{formatCurrency(order.refunded_amount, order.currency)}
            </td>
          </tr>
        )}
        <tr>
          <td colSpan={2}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                color: 'var(--sp-muted)',
                fontSize: 13,
              }}
            >
              Total
            </div>
          </td>
          <td
            style={{
              textAlign: 'right',
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {totalLabel}
          </td>
        </tr>
      </tbody>
    </table>
    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
      {order.is_invoice_generated && (
        <Link
          href={orderHref}
          className="sp-btn is-ghost"
          style={{ padding: '8px 14px', fontSize: 12.5 }}
        >
          <DownloadIcon size={13} /> Invoice
        </Link>
      )}
      <Link
        href={orderHref}
        className="sp-btn is-ghost"
        style={{ padding: '8px 14px', fontSize: 12.5 }}
      >
        <ExternalIcon size={12} /> View order
      </Link>
    </div>
  </>
)

const OrderRow = ({
  order,
  organizationSlug,
  searchString,
  isOpen,
  onToggle,
  isMobile,
  dark,
}: {
  order: schemas['CustomerOrder']
  organizationSlug: string
  searchString: string
  isOpen: boolean
  onToggle: () => void
  isMobile: boolean
  dark: boolean
}) => {
  const kind = statusKind(order)
  const isRefunded = kind === 'refunded'
  const itemCount = order.items?.length ?? 0
  const totalLabel = formatCurrency(order.total_amount, order.currency)
  const orderHref =
    `/${organizationSlug}/portal/orders/${order.id}` +
    (searchString ? `?${searchString}` : '')

  return (
    <div className="sp-order-row">
      <button
        type="button"
        className="sp-order-summary"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <div>
          <div className="sp-order-id">{order.invoice_number || order.id}</div>
          <div className="sp-order-sub">
            {itemCount === 0
              ? order.description
              : `${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
          </div>
        </div>
        <div className="sp-order-cell sp-hide-mobile">
          {formatDate(order.created_at)}
        </div>
        <div className="sp-order-cell sp-hide-mobile">
          {billingLabel(order)}
        </div>
        <span className="sp-hide-mobile">
          <StatusPill kind={kind} />
        </span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            justifyContent: 'flex-end',
            minWidth: 120,
          }}
        >
          <div
            className={'sp-order-total' + (isRefunded ? ' is-refunded' : '')}
          >
            {totalLabel}
          </div>
          <span
            style={{
              color: 'var(--sp-muted)',
              display: 'grid',
              placeItems: 'center',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform .2s',
            }}
            aria-hidden
          >
            <ChevronIcon size={14} />
          </span>
        </div>
      </button>

      {isOpen && !isMobile && (
        <div className="sp-order-detail sp-fade-in">
          <OrderDetailBody
            order={order}
            orderHref={orderHref}
            totalLabel={totalLabel}
          />
        </div>
      )}
      {isMobile && (
        <PortalSheet
          open={isOpen}
          onClose={onToggle}
          title={order.invoice_number || 'Order'}
          dark={dark}
        >
          {/* Date / reason / status are hidden from the collapsed row on
              mobile — surface them here instead. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              padding: '6px 12px 2px',
              fontSize: 13,
              color: 'var(--sp-muted)',
            }}
          >
            <span>{formatDate(order.created_at)}</span>
            <span>·</span>
            <span>{billingLabel(order)}</span>
            <StatusPill kind={kind} />
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <OrderDetailBody
              order={order}
              orderHref={orderHref}
              totalLabel={totalLabel}
            />
          </div>
        </PortalSheet>
      )}
    </div>
  )
}

const OrdersBody = ({
  orders,
  organizationSlug,
}: {
  orders: schemas['CustomerOrder'][]
  organizationSlug: string
}) => {
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const token =
    searchParams.get('customer_session_token') ??
    searchParams.get('member_session_token') ??
    ''
  const isMobile = useMediaMax(720)
  const { dark } = usePortalTheme(organizationSlug, token)
  const [openId, setOpenId] = React.useState<string | null>(
    orders[0]?.id ?? null,
  )
  const [page, setPage] = React.useState(1)

  // The first order starts expanded on desktop as a preview. On mobile the
  // detail is a bottom sheet, and popping one open on page load would be
  // hostile — clear the auto-selection once we know we're on a phone (unless
  // the customer already tapped a row themselves).
  const interactedRef = React.useRef(false)
  React.useEffect(() => {
    if (isMobile && !interactedRef.current) {
      setOpenId(null)
    }
  }, [isMobile])

  const totalPages = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const pageOrders = orders.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const lifetime = orders
    .filter((o) => o.status === 'paid')
    .reduce((sum, o) => sum + (o.total_amount - (o.refunded_amount ?? 0)), 0)
  const lifetimeCurrency = orders[0]?.currency ?? 'usd'

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Orders</h1>
          <p className="sp-page-sub">
            {orders.length === 0
              ? 'Your purchases will show up here.'
              : `${orders.length} order${orders.length === 1 ? '' : 's'} · ${formatCurrency(lifetime, lifetimeCurrency)} lifetime`}
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-title">No orders yet</div>
          <div style={{ fontSize: 13 }}>
            Purchases and renewals will appear here.
          </div>
        </div>
      ) : (
        <div className="sp-orders">
          {pageOrders.map((order) => (
            <OrderRow
              key={order.id}
              order={order}
              organizationSlug={organizationSlug}
              searchString={searchString}
              isOpen={openId === order.id}
              onToggle={() => {
                interactedRef.current = true
                setOpenId(openId === order.id ? null : order.id)
              }}
              isMobile={isMobile}
              dark={dark}
            />
          ))}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                marginTop: 16,
              }}
            >
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ClientPage = ({
  organization,
  orders,
}: {
  organization: schemas['CustomerOrganization']
  orders: schemas['ListResource_CustomerOrder_']
  customerSessionToken: string
}) => {
  return (
    <NuqsAdapter>
      <OrdersBody
        orders={orders.items ?? []}
        organizationSlug={organization.slug}
      />
    </NuqsAdapter>
  )
}

export default ClientPage
