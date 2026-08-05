'use client'

import { BenefitPage } from '@/components/Benefit/BenefitPage'
import { LicenseKeysPage } from '@/components/Benefit/LicenseKeysPage'
import UpdateBenefitModalContent from '@/components/Benefit/UpdateBenefitModalContent'
import {
  benefitsDisplayNames,
  resolveBenefitIcon,
} from '@/components/Benefit/utils'
import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { InlineModal } from '@/components/Modal/InlineModal'
import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { SpinnerNoMargin } from '@/components/Shared/Spinner'
import { useToast } from '@/components/Toast/use-toast'
import { useBenefit, useDeleteBenefit } from '@/hooks/queries'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { useCallback } from 'react'

interface BenefitDetailPanelProps {
  benefitId: string
  organization: schemas['Organization']
  onClose: () => void
}

export const BenefitDetailPanel = ({
  benefitId,
  organization,
  onClose,
}: BenefitDetailPanelProps) => {
  const { data: benefit, isLoading } = useBenefit(benefitId)

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Benefit</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <SpinnerNoMargin />
        </div>
      </div>
    )
  }

  if (!benefit) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Benefit</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <p className=" text-gray-500">
            Benefit not found
          </p>
        </div>
      </div>
    )
  }

  return (
    <BenefitDetailPanelContent
      benefit={benefit}
      organization={organization}
      onClose={onClose}
    />
  )
}

const BenefitDetailPanelContent = ({
  benefit,
  organization,
  onClose,
}: {
  benefit: schemas['Benefit']
  organization: schemas['Organization']
  onClose: () => void
}) => {
  const { toast } = useToast()

  const {
    isShown: isEditShown,
    show: showEdit,
    hide: hideEdit,
  } = useModal()

  const {
    isShown: isDeleteShown,
    show: showDelete,
    hide: hideDelete,
  } = useModal()

  const deleteBenefit = useDeleteBenefit(organization.id)

  const handleDeleteBenefit = useCallback(() => {
    deleteBenefit.mutateAsync({ id: benefit.id }).then(({ error }) => {
      if (error) {
        toast({
          title: 'Deletion Failed',
          description: `Error: ${error.detail}`,
        })
        return
      }
      toast({
        title: 'Benefit Deleted',
        description: `${benefit.description} was deleted.`,
      })
      onClose()
    })
  }, [deleteBenefit, benefit, toast, onClose])

  const copyBenefitId = async () => {
    try {
      await navigator.clipboard.writeText(benefit.id)
      toast({
        title: 'ID Copied',
        description: 'Benefit ID copied to clipboard.',
      })
    } catch {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy benefit ID.',
      })
    }
  }

  return (
    <div className="flex h-full flex-col">
      <InlineModalHeader hide={onClose}>
        <div className="flex flex-row items-center gap-3">
          <span className=" flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
            {resolveBenefitIcon(benefit.type, 'h-4 w-4')}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {(benefit.description?.length ?? 0) > 0
                ? benefit.description
                : '—'}
            </span>
            <span className=" text-xs text-gray-500">
              {benefitsDisplayNames[benefit.type]}
            </span>
          </div>
        </div>
      </InlineModalHeader>

      <div className="flex flex-row items-center justify-end border-b border-gray-200 px-8 py-3">
        <div className="flex flex-row items-center gap-2">
          <Button size="sm" onClick={showEdit}>
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
              <DropdownMenuItem onClick={copyBenefitId}>
                Copy ID
              </DropdownMenuItem>
              {benefit.deletable && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={showDelete}>
                    Delete benefit
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {benefit.type === 'license_keys' ? (
          <LicenseKeysPage organization={organization} benefit={benefit} />
        ) : (
          <BenefitPage benefit={benefit} organization={organization} />
        )}
      </div>

      <InlineModal
        isShown={isEditShown}
        hide={hideEdit}
        modalContent={
          <UpdateBenefitModalContent
            organization={organization}
            benefit={benefit}
            hideModal={hideEdit}
          />
        }
      />
      <ConfirmModal
        isShown={isDeleteShown}
        hide={hideDelete}
        title={`Delete "${benefit.description}"`}
        description="Deleting a benefit will remove it from every product & revoke it for existing customers. Are you sure?"
        onConfirm={handleDeleteBenefit}
        destructiveText="Yes, delete"
        destructive
      />
    </div>
  )
}
