import { schemas } from '@spaire/client'
import { Status } from '@spaire/ui/components/atoms/Status'
import { twMerge } from 'tailwind-merge'

const OrderStatusColors = {
  paid: 'bg-emerald-100 text-emerald-500 ',
  pending:
    'bg-yellow-100 text-yellow-500 ',
  refunded:
    'bg-blue-100 text-blue-500 ',
  partially_refunded:
    'bg-blue-100 text-blue-500 ',
} as const

export const OrderStatus = ({
  status,
}: {
  status: schemas['Order']['status']
}) => {
  return (
    <Status
      status={status.split('_').join(' ')}
      className={twMerge(OrderStatusColors[status], 'capitalize')}
    />
  )
}
