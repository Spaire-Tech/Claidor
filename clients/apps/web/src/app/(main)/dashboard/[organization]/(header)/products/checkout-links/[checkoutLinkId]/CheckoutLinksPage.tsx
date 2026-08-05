'use client'

import { CheckoutLinkPage } from '@/components/CheckoutLinks/CheckoutLinkPage'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { useModal } from '@/components/Modal/useModal'
import { toast } from '@/components/Toast/use-toast'
import { useDeleteCheckoutLink } from '@/hooks/queries'
import { usePushRouteWithoutCache } from '@/utils/router'
import { schemas } from '@spaire/client'
import React from 'react'

interface ClientPageProps {
  organization: schemas['Organization']
  checkoutLink: schemas['CheckoutLink']
}

const ClientPage: React.FC<ClientPageProps> = ({
  organization,
  checkoutLink,
}) => {
  const pushRouteWithoutCache = usePushRouteWithoutCache()

  const { mutateAsync: deleteCheckoutLink, isPending: isDeletePending } =
    useDeleteCheckoutLink()

  const {
    isShown: isDeleteModalShown,
    show: showDeleteModal,
    hide: hideDeleteModal,
  } = useModal()

  const onDelete = async () => {
    await deleteCheckoutLink(checkoutLink).then(({ error }) => {
      if (error) {
        toast({
          title: 'Checkout Link Deletion Failed',
          description: `Error deleting checkout link: ${error.detail}`,
        })
        return
      }

      toast({
        title: 'Checkout Link Deleted',
        description: `${
          checkoutLink?.label ? checkoutLink.label : 'Unlabeled'
        } Checkout Link was deleted successfully`,
      })

      pushRouteWithoutCache(
        `/dashboard/${organization.slug}/products/checkout-links`,
      )
    })
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-8">
        <CheckoutLinkPage checkoutLink={checkoutLink} />
      </div>
      <ConfirmModal
        title="Confirm Deletion of Checkout Link"
        description="It will cause 404 responses in case the link is still in use anywhere."
        onConfirm={onDelete}
        isShown={isDeleteModalShown}
        hide={hideDeleteModal}
        confirmPrompt={checkoutLink.label ?? ''}
        destructiveText="Delete"
        destructive
      />
    </DashboardBody>
  )
}

export default ClientPage
