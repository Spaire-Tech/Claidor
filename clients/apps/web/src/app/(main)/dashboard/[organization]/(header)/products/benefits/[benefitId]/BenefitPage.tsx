'use client'

import { BenefitPage } from '@/components/Benefit/BenefitPage'
import { LicenseKeysPage } from '@/components/Benefit/LicenseKeysPage'
import UpdateBenefitModalContent from '@/components/Benefit/UpdateBenefitModalContent'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { useToast } from '@/components/Toast/use-toast'
import { useDeleteBenefit } from '@/hooks/queries'
import { usePushRouteWithoutCache } from '@/utils/router'
import { schemas } from '@spaire/client'
import React, { useCallback } from 'react'

interface ClientPageProps {
  organization: schemas['Organization']
  benefit: schemas['Benefit']
}

const ClientPage: React.FC<ClientPageProps> = ({
  organization,
  benefit,
}: ClientPageProps) => {
  const pushRouteWithoutCache = usePushRouteWithoutCache()
  const { toast } = useToast()

  const { isShown: isEditShown, show: showEdit, hide: hideEdit } = useModal()
  const { isShown: isDeleteShown, hide: hideDelete } = useModal()

  const deleteBenefit = useDeleteBenefit(organization.id)

  const handleDeleteBenefit = useCallback(() => {
    deleteBenefit.mutateAsync({ id: benefit.id }).then(({ error }) => {
      if (error) {
        toast({
          title: 'Benefit Deletion Failed',
          description: `Error deleting benefit ${benefit.description}: ${error.detail}`,
        })
        return
      }
      toast({
        title: 'Benefit Deleted',
        description: `Benefit ${benefit.description} successfully deleted`,
      })
      pushRouteWithoutCache(`/dashboard/${organization.slug}/products/benefits`)
    })
  }, [deleteBenefit, benefit, toast, organization, pushRouteWithoutCache])

  return (
    <DashboardBody>
      <div className="flex flex-col gap-8">
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
        title={`Delete "${benefit?.description}"`}
        description="Deleting a benefit will remove it from every product & revoke it for existing customers. Are you sure?"
        onConfirm={handleDeleteBenefit}
        destructiveText="Yes, delete"
        destructive
      />
    </DashboardBody>
  )
}

export default ClientPage
