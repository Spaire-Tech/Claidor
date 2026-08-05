'use client'

import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { SpinnerNoMargin } from '@/components/Shared/Spinner'
import { useToast } from '@/components/Toast/use-toast'
import { useMeter, useUpdateMeter } from '@/hooks/queries/meters'
import { apiErrorToast } from '@/utils/api/errors'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { Status } from '@spaire/ui/components/atoms/Status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { useCallback } from 'react'
import { MeterPage } from './MeterPage'

interface MeterDetailPanelProps {
  meterId: string
  organization: schemas['Organization']
  onClose: () => void
}

export const MeterDetailPanel = ({
  meterId,
  organization,
  onClose,
}: MeterDetailPanelProps) => {
  const { data: meter, isLoading } = useMeter(meterId)

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Meter</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <SpinnerNoMargin />
        </div>
      </div>
    )
  }

  if (!meter) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Meter</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <p className=" text-gray-500">Meter not found</p>
        </div>
      </div>
    )
  }

  return (
    <MeterDetailPanelContent
      meter={meter}
      organization={organization}
      onClose={onClose}
    />
  )
}

const MeterDetailPanelContent = ({
  meter,
  organization,
  onClose,
}: {
  meter: schemas['Meter']
  organization: schemas['Organization']
  onClose: () => void
}) => {
  const { toast } = useToast()

  const {
    isShown: isEditMeterModalShown,
    show: showEditMeterModal,
    hide: hideEditMeterModal,
  } = useModal()

  const updateMeter = useUpdateMeter(meter.id)

  const handleArchiveMeter = useCallback(async () => {
    const isArchiving = !meter.archived_at
    const { error } = await updateMeter.mutateAsync({
      is_archived: isArchiving,
    })

    if (error) {
      apiErrorToast(error, toast)
      return
    }

    toast({
      title: `Meter ${isArchiving ? 'archived' : 'unarchived'}`,
      description: `${meter.name} has been ${isArchiving ? 'archived' : 'unarchived'} successfully.`,
    })

    if (isArchiving) {
      onClose()
    }
  }, [updateMeter, toast, meter, onClose])

  return (
    <div className="flex h-full flex-col">
      <InlineModalHeader hide={onClose}>
        <div className="flex flex-col gap-y-1">
          <span className="text-sm font-medium">{meter.name}</span>
          <div className="flex flex-row items-center gap-x-2">
            <Status
              className="bg-emerald-50 text-xs text-emerald-500 capitalize "
              status={`${meter.aggregation.func}`}
            />
            {meter.archived_at && (
              <Status
                className="bg-red-50 text-xs text-red-500 "
                status="Archived"
              />
            )}
          </div>
        </div>
      </InlineModalHeader>

      <div className="flex flex-row items-center justify-end border-b border-gray-200 px-8 py-3">
        <div className="flex flex-row items-center gap-2">
          <Button size="sm" onClick={showEditMeterModal}>
            Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none" asChild>
              <Button size="icon" variant="secondary">
                <MoreVertOutlined fontSize="inherit" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className=" bg-gray-50 shadow-lg"
            >
              <DropdownMenuItem
                destructive={!meter.archived_at}
                onClick={handleArchiveMeter}
              >
                {meter.archived_at ? 'Unarchive' : 'Archive'} meter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <MeterPage
          meter={meter}
          organization={organization}
          isEditMeterModalShown={isEditMeterModalShown}
          hideEditMeterModal={hideEditMeterModal}
        />
      </div>
    </div>
  )
}
