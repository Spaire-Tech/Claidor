'use client'

import {
  useAssignSeat,
  useCustomerSeats,
  useResendSeatInvitation,
  useRevokeSeat,
} from '@/hooks/queries'
import { canRetryOrderPayment } from '@/utils/order'
import { validateEmail } from '@/utils/validation'
import { Client, schemas } from '@spaire/client'
import { formatCurrency } from '@spaire/currency'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { Status } from '@spaire/ui/components/atoms/Status'
import { ThemingPresetProps } from '@spaire/ui/hooks/theming'
import React, { useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { DownloadInvoicePortal } from '../Orders/DownloadInvoice'
import { DetailRow } from '../Shared/DetailRow'
import { toast } from '../Toast/use-toast'
import { CustomerPortalGrants } from './CustomerPortalGrants'
import { OrderPaymentRetryModal } from './OrderPaymentRetryModal'
import { SeatManagementTable } from './SeatManagementTable'

const statusColors = {
  paid: 'bg-emerald-100 text-emerald-500 ',
  pending:
    'bg-yellow-100 text-yellow-500 ',
  refunded:
    'bg-blue-100 text-blue-500 ',
  partially_refunded:
    'bg-blue-100 text-blue-500 ',
}

const CustomerPortalOrder = ({
  api,
  order,
  customerSessionToken,
  themingPreset,
  modalWrapperClassName,
}: {
  api: Client
  order: schemas['CustomerOrder']
  customerSessionToken: string
  themingPreset: ThemingPresetProps
  /** Theme scope for portaled modals (e.g. 'spaire-portal sp-dark'). */
  modalWrapperClassName?: string
}) => {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)

  const isPartiallyOrFullyRefunded = useMemo(() => {
    return order.status === 'partially_refunded' || order.status === 'refunded'
  }, [order])

  // Seats management
  const hasSeatBasedOrder = order.seats && order.seats > 0

  const { data: seatsData, isLoading: isLoadingSeats } = useCustomerSeats(
    api,
    hasSeatBasedOrder ? { orderId: order.id } : undefined,
  )
  const assignSeat = useAssignSeat(api)
  const revokeSeat = useRevokeSeat(api)
  const resendInvitation = useResendSeatInvitation(api)

  const [email, setEmail] = useState('')
  const [error, setError] = useState<string>()
  const [isSending, setIsSending] = useState(false)

  const handleAssignSeat = async () => {
    if (!email.trim()) {
      setError('Email is required')
      return
    }
    if (!validateEmail(email)) {
      setError('Invalid email format')
      return
    }

    setIsSending(true)
    setError(undefined)

    try {
      const result = await assignSeat.mutateAsync({
        order_id: order.id,
        email,
      })

      if (result.error) {
        const errorMessage =
          typeof result.error.detail === 'string'
            ? result.error.detail
            : 'Failed to assign seat'
        setError(errorMessage)
      } else {
        setEmail('')
      }
    } catch {
      setError('Failed to send invitation')
    } finally {
      setIsSending(false)
    }
  }

  const handleRevokeSeat = async (seatId: string) => {
    try {
      await revokeSeat.mutateAsync(seatId)
      toast({
        title: 'Seat revoked successfully',
        description: 'The seat has been revoked and is now available.',
      })
    } catch (error) {
      toast({
        title: 'Failed to revoke seat',
        description:
          error instanceof Error ? error.message : 'An error occurred.',
        variant: 'error',
      })
    }
  }

  const handleResendInvitation = async (seatId: string) => {
    try {
      await resendInvitation.mutateAsync(seatId)
      toast({
        title: 'Invitation resent',
        description: 'The invitation email has been sent again.',
      })
    } catch (error) {
      toast({
        title: 'Failed to resend invitation',
        description:
          error instanceof Error ? error.message : 'An error occurred.',
        variant: 'error',
      })
    }
  }

  const totalSeats = seatsData?.total_seats || 0
  const availableSeats = seatsData?.available_seats || 0
  const seats = seatsData?.seats || []

  return (
    <div className="flex h-full flex-col gap-12">
      <div className="flex w-full flex-col gap-8">
        <div className="flex flex-row flex-wrap gap-x-4">
          <h3 className="text-xl md:text-2xl">{order.description}</h3>
          <Status
            status={order.status.split('_').join(' ')}
            className={twMerge(statusColors[order.status], 'capitalize')}
          />

          {/* Retry button */}
          {canRetryOrderPayment(order) && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setIsPaymentModalOpen(true)}
            >
              Retry payment
            </Button>
          )}
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col">
            {order.product && (
              <DetailRow
                label="Product"
                value={<span>{order.product.name}</span>}
              />
            )}
            <DetailRow label="Invoice number" value={order.invoice_number} />
            <DetailRow
              label="Date"
              value={
                <span>{new Date(order.created_at).toLocaleDateString()}</span>
              }
            />
          </div>

          {order.items.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="text-lg">Order Items</h3>
              <div className="flex flex-col gap-4">
                {order.items.map((item) => (
                  <DetailRow
                    key={item.id}
                    label={item.label}
                    value={
                      <span>
                        {formatCurrency('accounting')(
                          item.amount,
                          order.currency,
                        )}
                      </span>
                    }
                    valueClassName="justify-end"
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col">
            <DetailRow
              label="Subtotal"
              value={
                <span>
                  {formatCurrency('accounting')(
                    order.subtotal_amount,
                    order.currency,
                  )}
                </span>
              }
              valueClassName="justify-end"
            />
            <DetailRow
              label="Discount"
              value={
                <span>
                  {order.discount_amount
                    ? formatCurrency('accounting')(
                        -order.discount_amount,
                        order.currency,
                      )
                    : '—'}
                </span>
              }
              valueClassName="justify-end"
            />
            <DetailRow
              label="Net amount"
              value={
                <span>
                  {formatCurrency('accounting')(
                    order.net_amount,
                    order.currency,
                  )}
                </span>
              }
              valueClassName="justify-end"
            />
            <DetailRow
              label="Tax"
              value={
                <span>
                  {formatCurrency('accounting')(
                    order.tax_amount,
                    order.currency,
                  )}
                </span>
              }
              valueClassName="justify-end"
            />
            <DetailRow
              label="Total"
              value={
                <span>
                  {formatCurrency('accounting')(
                    order.total_amount,
                    order.currency,
                  )}
                </span>
              }
              valueClassName="justify-end"
            />
            {order.applied_balance_amount !== 0 && (
              <>
                <DetailRow
                  label="Applied balance"
                  value={
                    <span>
                      {formatCurrency('accounting')(
                        order.applied_balance_amount,
                        order.currency,
                      )}
                    </span>
                  }
                  valueClassName="justify-end"
                />
                <DetailRow
                  label="To be paid"
                  value={
                    <span>
                      {formatCurrency('accounting')(
                        order.due_amount,
                        order.currency,
                      )}
                    </span>
                  }
                  valueClassName="justify-end"
                />
              </>
            )}

            {isPartiallyOrFullyRefunded && (
              <DetailRow
                label="Refunded amount"
                value={
                  <span>
                    {formatCurrency('accounting')(
                      order.refunded_amount,
                      order.currency,
                    )}
                  </span>
                }
                valueClassName="justify-end"
              />
            )}
          </div>
          {order.paid && (
            <div className="flex flex-col gap-2">
              <DownloadInvoicePortal
                customerSessionToken={customerSessionToken}
                order={order}
                onInvoiceGenerated={() => {}}
              />
            </div>
          )}
        </div>

        {hasSeatBasedOrder && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-y-2">
              <h3 className="text-lg">Seats</h3>
              <p className=" text-sm text-gray-500">
                {availableSeats} of {totalSeats} seats available
              </p>
            </div>
            <div className="flex flex-col gap-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                <div className="flex-1">
                  <Input
                    type="email"
                    placeholder="email@example.com"
                    value={email}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setEmail(e.target.value)
                      setError(undefined)
                    }}
                    disabled={isSending || availableSeats === 0}
                    onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') {
                        handleAssignSeat()
                      }
                    }}
                  />
                  {error && (
                    <p className=" mt-1 text-xs text-gray-500">
                      {error}
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleAssignSeat}
                  disabled={!email.trim() || availableSeats === 0 || isSending}
                  loading={isSending}
                >
                  Invite
                </Button>
              </div>
            </div>

            {!isLoadingSeats && seats.length > 0 && (
              <div className="flex flex-col gap-4">
                <h3 className="text-lg">Assigned Seats</h3>
                <SeatManagementTable
                  seats={seats}
                  onRevokeSeat={handleRevokeSeat}
                  onResendInvitation={handleResendInvitation}
                />
              </div>
            )}
          </div>
        )}

        <CustomerPortalGrants
          api={api}
          subscriptionId={order.subscription_id ?? undefined}
          orderId={order.id}
        />
      </div>

      {/* Payment Retry Modal */}
      <OrderPaymentRetryModal
        order={order}
        api={api}
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        themingPreset={themingPreset}
        wrapperClassName={modalWrapperClassName}
      />
    </div>
  )
}

export default CustomerPortalOrder
