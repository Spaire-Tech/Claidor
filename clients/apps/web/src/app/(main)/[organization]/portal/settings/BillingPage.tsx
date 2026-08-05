'use client'

import revalidate from '@/app/actions'
import { AddPaymentMethodModal } from '@/components/CustomerPortal/AddPaymentMethodModal'
import { Modal } from '@/components/Modal'
import { useModal } from '@/components/Modal/useModal'
import {
  useCustomerPaymentMethods,
  useDeleteCustomerPaymentMethod,
} from '@/hooks/queries'
import { createClientSideAPI } from '@/utils/client'
import { schemas } from '@spaire/client'
import { getThemePreset } from '@spaire/ui/hooks/theming'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import * as React from 'react'
import { ArrowIcon, DownloadIcon, PlusIcon } from '../_components/icons'
import { usePortalTheme } from '../usePortalTheme'

interface SetupIntentParams {
  setup_intent_client_secret: string
  setup_intent: string
}

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

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null
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

const brandClass = (brand: string): string => {
  const b = brand.toLowerCase()
  if (b.includes('visa')) return 'sp-pm-brand is-visa'
  if (b.includes('master')) return 'sp-pm-brand is-mc'
  if (b.includes('amex') || b.includes('american')) return 'sp-pm-brand is-amex'
  return 'sp-pm-brand'
}

const brandLabel = (brand: string): string => {
  const b = brand.toLowerCase()
  if (b.includes('visa')) return 'VISA'
  if (b.includes('master')) return 'MC'
  if (b.includes('amex') || b.includes('american')) return 'AMEX'
  return brand.slice(0, 4).toUpperCase()
}

const PaymentMethodCard = ({
  method,
  isPrimary,
  onRemove,
  busy,
}: {
  method: schemas['CustomerPaymentMethod']
  isPrimary: boolean
  onRemove: () => void
  busy: boolean
}) => {
  if (method.type !== 'card') {
    return (
      <div className="sp-pm">
        <div className="sp-pm-row">
          <div className="sp-pm-brand">{method.type.toUpperCase()}</div>
          <div>
            <div className="sp-pm-title">
              {method.type}
              {isPrimary && <span className="sp-pm-primary">Primary</span>}
            </div>
            <div className="sp-pm-meta">Connected payment method</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="sp-btn is-ghost"
            onClick={onRemove}
            disabled={busy}
            style={{
              padding: '7px 12px',
              fontSize: 12.5,
              color: 'var(--sp-muted)',
            }}
          >
            Remove
          </button>
        </div>
      </div>
    )
  }

  const card = method as schemas['PaymentMethodCard']
  const meta = card.method_metadata
  const expMonth = String(meta.exp_month).padStart(2, '0')
  const expYear = String(meta.exp_year).slice(-2)
  const brand = meta.brand || 'card'

  return (
    <div className="sp-pm">
      <div className="sp-pm-row">
        <div className={brandClass(brand)} aria-hidden>
          {brandLabel(brand)}
        </div>
        <div>
          <div className="sp-pm-title">
            <span style={{ textTransform: 'capitalize' }}>{brand}</span> ending
            in {meta.last4}
            {isPrimary && <span className="sp-pm-primary">Primary</span>}
          </div>
          <div className="sp-pm-meta">
            Expires {expMonth}/{expYear}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="sp-btn is-ghost"
          onClick={onRemove}
          disabled={busy || isPrimary}
          title={
            isPrimary
              ? 'Add another card before removing your primary method'
              : undefined
          }
          style={{
            padding: '7px 12px',
            fontSize: 12.5,
            color: 'var(--sp-muted)',
          }}
        >
          Remove
        </button>
      </div>
    </div>
  )
}

const BillingBody = ({
  organization,
  customerSessionToken,
  customer,
  subscriptions,
  orders,
  setupIntentParams,
}: {
  organization: schemas['CustomerOrganization']
  customerSessionToken: string
  customer: schemas['CustomerPortalCustomer'] | null
  subscriptions: schemas['CustomerSubscription'][]
  orders: schemas['CustomerOrder'][]
  setupIntentParams?: SetupIntentParams
}) => {
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const buildHref = (path: string) =>
    searchString ? `${path}?${searchString}` : path

  const router = useRouter()
  const { dark } = usePortalTheme(organization.slug, customerSessionToken)
  // Match the embedded Stripe form to the portal's resolved theme instead of
  // forcing light.
  const themePreset = getThemePreset(organization.slug, dark ? 'dark' : 'light')

  const api = React.useMemo(
    () => createClientSideAPI(customerSessionToken),
    [customerSessionToken],
  )

  const { data: paymentMethods } = useCustomerPaymentMethods(api)
  const deletePaymentMethod = useDeleteCustomerPaymentMethod(api)

  // Add-card uses Stripe's setup-intent flow. If Stripe redirected back with
  // `setup_intent*` params, the modal opens automatically and completes the
  // confirmation; otherwise the customer opens it from the "Add card" button.
  const {
    isShown: isAddCardOpen,
    show: showAddCard,
    hide: hideAddCard,
  } = useModal(setupIntentParams !== undefined)

  const defaultPaymentMethodId = customer?.default_payment_method_id

  const headlineSubscription =
    subscriptions.find(
      (s) => s.status === 'active' || s.status === 'trialing',
    ) ?? null

  const planTitle = headlineSubscription
    ? `${formatCurrency(headlineSubscription.amount, headlineSubscription.currency)} / ${headlineSubscription.recurring_interval}`
    : null
  const planRenews = headlineSubscription?.current_period_end
    ? formatDate(headlineSubscription.current_period_end)
    : null

  const handleRemove = async (id: string) => {
    if (
      !window.confirm(
        'Remove this payment method? You can add it back at any time.',
      )
    ) {
      return
    }
    try {
      await deletePaymentMethod.mutateAsync(id)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  const handleCardAdded = () => {
    // The add/confirm mutations already invalidate the payment-methods query;
    // refresh the server components so the customer's default method updates.
    revalidate('customer_portal')
    router.refresh()
    hideAddCard()
  }

  const invoiceOrders = orders.slice(0, 12)

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Billing</h1>
          <p className="sp-page-sub">Plan, payment methods, and invoices</p>
        </div>
      </div>

      <div className="sp-plan-card">
        <div>
          <div className="sp-plan-eyebrow">Current plan</div>
          <div className="sp-plan-title">
            {headlineSubscription ? planTitle : 'No active subscription'}
          </div>
          <div className="sp-plan-meta">
            {headlineSubscription
              ? planRenews
                ? `Renews ${planRenews}`
                : 'Active'
              : 'You currently don’t have a recurring plan.'}
          </div>
        </div>
        <div className="sp-plan-actions">
          {headlineSubscription && (
            <Link
              href={buildHref(
                `/${organization.slug}/portal/subscriptions/${headlineSubscription.id}`,
              )}
              className="sp-btn-dark-ghost"
            >
              Manage plan
            </Link>
          )}
          <Link
            href={buildHref(`/${organization.slug}/portal/orders`)}
            className="sp-btn-light"
          >
            View orders
          </Link>
        </div>
      </div>

      <div className="sp-sec-head">
        <h2 className="sp-sec-title">Payment methods</h2>
        <button type="button" className="sp-link" onClick={showAddCard}>
          <PlusIcon size={13} /> Add card
        </button>
      </div>
      <div className="sp-pm-grid">
        {(paymentMethods?.items ?? []).map((m) => (
          <PaymentMethodCard
            key={m.id}
            method={m}
            isPrimary={m.id === defaultPaymentMethodId}
            onRemove={() => handleRemove(m.id)}
            busy={deletePaymentMethod.isPending}
          />
        ))}
        {(!paymentMethods || paymentMethods.items.length === 0) && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: 32,
              textAlign: 'center',
              border: '1px dashed var(--sp-line)',
              borderRadius: 'var(--sp-radius)',
              color: 'var(--sp-muted)',
              fontSize: 13.5,
            }}
          >
            No payment methods on file.
          </div>
        )}
      </div>

      <div className="sp-sec-head">
        <h2 className="sp-sec-title">Invoice history</h2>
        <span style={{ fontSize: 13, color: 'var(--sp-muted)' }}>
          {invoiceOrders.length} invoice
          {invoiceOrders.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="sp-inv">
        <div className="sp-inv-head">
          <div>Invoice</div>
          <div>Date</div>
          <div>Description</div>
          <div style={{ textAlign: 'right' }}>Amount</div>
          <div />
        </div>
        {invoiceOrders.length === 0 && (
          <div
            style={{
              padding: 32,
              textAlign: 'center',
              color: 'var(--sp-muted)',
              fontSize: 13.5,
            }}
          >
            No invoices yet.
          </div>
        )}
        {invoiceOrders.map((order) => {
          const isRefunded =
            order.refunded_amount > 0 &&
            order.refunded_amount >= order.total_amount
          return (
            <div key={order.id} className="sp-inv-row">
              <div style={{ fontWeight: 500, color: 'var(--sp-ink)' }}>
                {order.invoice_number || order.id.slice(0, 8)}
              </div>
              <div style={{ color: 'var(--sp-ink-2)' }}>
                {formatDate(order.created_at)}
              </div>
              <div
                style={{
                  color: 'var(--sp-ink-2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {order.description}
                </span>
                {isRefunded && (
                  <span className="sp-pill is-refunded">Refunded</span>
                )}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  color: isRefunded ? 'var(--sp-muted)' : 'var(--sp-ink)',
                  textDecoration: isRefunded ? 'line-through' : 'none',
                }}
              >
                {formatCurrency(order.total_amount, order.currency)}
              </div>
              <Link
                href={buildHref(
                  `/${organization.slug}/portal/orders/${order.id}`,
                )}
                className="sp-iconbtn"
                title="View invoice"
                style={{ width: 32, height: 32 }}
              >
                <DownloadIcon size={14} />
              </Link>
            </div>
          )
        })}
      </div>

      {!headlineSubscription && orders.length > 0 && (
        <div className="sp-lib">
          <div>
            <div className="sp-lib-eyebrow">Looking for more?</div>
            <div className="sp-lib-title">Browse {organization.name}</div>
            <div className="sp-lib-meta">
              See what new masterclasses and products are available.
            </div>
          </div>
          <Link href={`/${organization.slug}`} className="sp-btn is-ghost">
            Visit storefront <ArrowIcon size={13} />
          </Link>
        </div>
      )}

      <Modal
        title="Add payment method"
        isShown={isAddCardOpen}
        hide={hideAddCard}
        wrapperClassName={'spaire-portal' + (dark ? ' sp-dark' : '')}
        modalContent={
          <AddPaymentMethodModal
            api={api}
            onPaymentMethodAdded={handleCardAdded}
            setupIntentParams={setupIntentParams}
            hide={hideAddCard}
            themePreset={themePreset}
          />
        }
      />
    </div>
  )
}

const BillingPage = ({
  organization,
  customerSessionToken,
  customer,
  subscriptions,
  orders,
  setupIntentParams,
}: {
  organization: schemas['CustomerOrganization']
  customerSessionToken: string
  customer: schemas['CustomerPortalCustomer'] | null
  subscriptions: schemas['CustomerSubscription'][]
  orders: schemas['CustomerOrder'][]
  setupIntentParams?: SetupIntentParams
}) => {
  return (
    <NuqsAdapter>
      <BillingBody
        organization={organization}
        customerSessionToken={customerSessionToken}
        customer={customer}
        subscriptions={subscriptions}
        orders={orders}
        setupIntentParams={setupIntentParams}
      />
    </NuqsAdapter>
  )
}

export default BillingPage
