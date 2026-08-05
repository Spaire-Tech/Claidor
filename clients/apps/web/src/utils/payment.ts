import { schemas } from '@spaire/client'

export const PaymentStatusDisplayTitle: Record<
  schemas['PaymentStatus'],
  string
> = {
  succeeded: 'Succeeded',
  pending: 'Pending',
  failed: 'Failed',
}

export const PaymentStatusDisplayColor: Record<
  schemas['PaymentStatus'],
  string
> = {
  succeeded: 'bg-emerald-100 text-emerald-500',
  pending: 'bg-yellow-100 text-yellow-500',
  failed: 'bg-red-100 text-red-500',
}

export const isCardPayment = (
  payment: schemas['Payment'],
): payment is schemas['CardPayment'] => payment.method === 'card'
