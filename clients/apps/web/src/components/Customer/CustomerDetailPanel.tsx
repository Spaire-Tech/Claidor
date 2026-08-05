'use client'

import { useCustomer } from '@/hooks/queries'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import { SpinnerNoMargin } from '../Shared/Spinner'
import { CustomerPage } from './CustomerPage'
import { InlineModalHeader } from '../Modal/InlineModal'
import DateRangePicker from '../Metrics/DateRangePicker'
import IntervalPicker, { getNextValidInterval } from '../Metrics/IntervalPicker'
import { useDateRange } from '@/utils/date'
import { endOfToday, startOfDay } from 'date-fns'
import { parseAsStringLiteral, useQueryState } from 'nuqs'
import { useCallback, useEffect } from 'react'
import { EditCustomerModal } from './EditCustomerModal'
import { ConfirmModal } from '../Modal/ConfirmModal'
import { InlineModal } from '../Modal/InlineModal'
import { useModal } from '../Modal/useModal'
import { toast } from '../Toast/use-toast'
import { useSafeCopy } from '@/hooks/clipboard'
import { useDeleteCustomer } from '@/hooks/queries'
import { api } from '@/utils/client'
import { CONFIG } from '@/utils/config'
import MoreVert from '@mui/icons-material/MoreVert'
import Button from '@spaire/ui/components/atoms/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'

interface CustomerDetailPanelProps {
  customerId: string
  organization: schemas['Organization']
  onClose: () => void
}

export const CustomerDetailPanel = ({
  customerId,
  organization,
  onClose,
}: CustomerDetailPanelProps) => {
  const { data: customer, isLoading } = useCustomer(customerId)

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Customer</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <SpinnerNoMargin />
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Customer</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <p className=" text-gray-500">Customer not found</p>
        </div>
      </div>
    )
  }

  return (
    <CustomerDetailPanelContent
      customer={customer}
      organization={organization}
      onClose={onClose}
    />
  )
}

const CustomerDetailPanelContent = ({
  customer,
  organization,
  onClose,
}: {
  customer: schemas['Customer']
  organization: schemas['Organization']
  onClose: () => void
}) => {
  const { startDate, endDate, setStartDate, setEndDate } = useDateRange({
    defaultStartDate: startOfDay(new Date(customer.created_at)),
    defaultEndDate: endOfToday(),
  })

  const [interval, setInterval] = useQueryState(
    'interval',
    parseAsStringLiteral([
      'hour',
      'day',
      'week',
      'month',
      'year',
    ] as schemas['TimeInterval'][]).withDefault(
      getNextValidInterval('day', startDate, endDate),
    ),
  )

  const {
    show: showEditModal,
    hide: hideEditModal,
    isShown: isEditOpen,
  } = useModal()

  const {
    show: showDeleteModal,
    hide: hideDeleteModal,
    isShown: isDeleteOpen,
  } = useModal()

  const safeCopy = useSafeCopy(toast)

  const createCustomerSession = useCallback(async () => {
    const { data: session, error } = await api.POST('/v1/customer-sessions/', {
      body: { customer_id: customer.id },
    })
    if (error) {
      toast({ title: 'Error', description: 'Could not create portal link.' })
      return
    }
    const link = `${CONFIG.FRONTEND_BASE_URL}/${organization.slug}/portal?customer_session_token=${session.token}`
    await safeCopy(link)
    toast({ title: 'Copied', description: 'Customer Portal link copied.' })
  }, [safeCopy, customer, organization])

  const deleteCustomer = useDeleteCustomer(customer.id, customer.organization_id)

  const onDeleteCustomer = useCallback(async () => {
    deleteCustomer.mutateAsync().then((response) => {
      if (response.error) {
        toast({ title: 'Delete Failed', description: `Error: ${response.error.detail}` })
        return
      }
      toast({ title: 'Customer Deleted', description: `${customer.email} deleted.` })
      onClose()
    })
  }, [deleteCustomer, customer.email, onClose])

  const onDateChange = useCallback(
    (date: { from: Date; to: Date }) => {
      const validInterval = getNextValidInterval(interval, date.from, date.to)
      setStartDate(date.from)
      setEndDate(date.to)
      if (validInterval !== interval) setInterval(validInterval)
    },
    [interval, setStartDate, setEndDate, setInterval],
  )

  useEffect(() => {
    if (customer) {
      const customerCreatedAt = startOfDay(new Date(customer.created_at))
      const now = endOfToday()
      setStartDate(customerCreatedAt)
      setEndDate(now)
      setInterval((prev) => getNextValidInterval(prev, customerCreatedAt, now))
    }
  }, [customer.id, setStartDate, setEndDate, setInterval])

  return (
    <div className="flex h-full flex-col">
      <InlineModalHeader hide={onClose}>
        <div className="flex flex-row items-center gap-3">
          <Avatar
            avatar_url={customer.avatar_url}
            name={customer.name || customer.email}
            className="h-8 w-8"
          />
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {(customer.name?.length ?? 0) > 0 ? customer.name : customer.email}
            </span>
            {(customer.name?.length ?? 0) > 0 && (
              <span className=" text-xs text-gray-500">
                {customer.email}
              </span>
            )}
          </div>
        </div>
      </InlineModalHeader>

      <div className="flex flex-row items-center gap-2 border-b border-gray-200 px-8 py-3">
        <div className="flex flex-1 flex-row items-center gap-2">
          <IntervalPicker
            interval={interval}
            onChange={setInterval}
            startDate={startDate}
            endDate={endDate}
          />
          <DateRangePicker
            date={
              startDate && endDate ? { from: startDate, to: endDate } : undefined
            }
            onDateChange={onDateChange}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="default" className="size-8" variant="secondary">
              <MoreVert fontSize="small" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={createCustomerSession}>
              Copy Customer Portal
            </DropdownMenuItem>
            <DropdownMenuItem>
              <a href={`mailto:${customer.email}`}>Contact Customer</a>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={showEditModal}>
              Edit Customer
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem destructive onClick={showDeleteModal}>
              Delete Customer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <CustomerPage
          key={customer.id}
          customer={customer}
          organization={organization}
          dateRange={{ startDate, endDate }}
          interval={interval}
        />
      </div>

      <InlineModal
        isShown={isEditOpen}
        hide={hideEditModal}
        modalContent={
          <EditCustomerModal customer={customer} onClose={hideEditModal} />
        }
      />
      <ConfirmModal
        isShown={isDeleteOpen}
        hide={hideDeleteModal}
        title={`Delete "${customer.email}"?`}
        body={
          <div className=" flex flex-col gap-y-2 text-sm leading-relaxed text-gray-500">
            <p>This action cannot be undone and will immediately:</p>
            <ol className="list-inside list-disc pl-4">
              <li>Cancel any active subscriptions</li>
              <li>Revoke all benefits</li>
              <li>Clear any external_id</li>
            </ol>
            <p>Historic orders and subscriptions will be retained.</p>
          </div>
        }
        onConfirm={onDeleteCustomer}
        confirmPrompt={customer.email}
        destructiveText="Delete"
        destructive
      />
    </div>
  )
}
