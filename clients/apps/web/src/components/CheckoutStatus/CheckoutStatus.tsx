import {
  CheckoutStatusDisplayColor,
  CheckoutStatusDisplayTitle,
} from '@/utils/checkout'
import { schemas } from '@claidor/client'
import { Status } from '@claidor/ui/components/atoms/Status'
import { twMerge } from 'tailwind-merge'

const CheckoutStatus = ({
  checkout: { status },
}: {
  checkout: schemas['Checkout']
}) => {
  return (
    <Status
      className={twMerge(CheckoutStatusDisplayColor[status], 'w-fit')}
      status={CheckoutStatusDisplayTitle[status]}
    />
  )
}

export default CheckoutStatus
