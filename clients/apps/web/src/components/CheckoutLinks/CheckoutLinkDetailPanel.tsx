'use client'

import { CheckoutLinkPage } from '@/components/CheckoutLinks/CheckoutLinkPage'
import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { InlineModalHeader } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { SpinnerNoMargin } from '@/components/Shared/Spinner'
import { toast } from '@/components/Toast/use-toast'
import { useCheckoutLink, useDeleteCheckoutLink } from '@/hooks/queries'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'

interface CheckoutLinkDetailPanelProps {
  checkoutLinkId: string
  organization: schemas['Organization']
  onClose: () => void
}

export const CheckoutLinkDetailPanel = ({
  checkoutLinkId,
  organization,
  onClose,
}: CheckoutLinkDetailPanelProps) => {
  const { data: checkoutLink, isLoading } = useCheckoutLink(checkoutLinkId)

  if (isLoading) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Payment Link</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <SpinnerNoMargin />
        </div>
      </div>
    )
  }

  if (!checkoutLink) {
    return (
      <div className="flex h-full flex-col">
        <InlineModalHeader hide={onClose}>
          <span>Payment Link</span>
        </InlineModalHeader>
        <div className="flex flex-1 items-center justify-center">
          <p className=" text-gray-500">Link not found</p>
        </div>
      </div>
    )
  }

  return (
    <CheckoutLinkDetailPanelContent
      checkoutLink={checkoutLink}
      organization={organization}
      onClose={onClose}
    />
  )
}

const CheckoutLinkDetailPanelContent = ({
  checkoutLink,
  organization,
  onClose,
}: {
  checkoutLink: schemas['CheckoutLink']
  organization: schemas['Organization']
  onClose: () => void
}) => {
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
          title: 'Deletion Failed',
          description: `Error: ${error.detail}`,
        })
        return
      }
      toast({
        title: 'Payment Link Deleted',
        description: `${checkoutLink.label ?? 'Untitled'} was deleted.`,
      })
      onClose()
    })
  }

  const productLabel =
    checkoutLink.products.length === 1
      ? checkoutLink.products[0].name
      : `${checkoutLink.products.length} Products`

  return (
    <div className="flex h-full flex-col">
      <InlineModalHeader hide={onClose}>
        <div className="flex flex-row items-center gap-3">
          <span className=" flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600">
            <LinkOutlined fontSize="small" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {(checkoutLink.label?.length ?? 0) > 0
                ? checkoutLink.label
                : 'Untitled'}
            </span>
            <span className=" font-mono text-xs text-gray-500">
              {productLabel}
            </span>
          </div>
        </div>
      </InlineModalHeader>

      <div className="flex flex-row items-center justify-end border-b border-gray-200 px-8 py-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none" asChild>
            <Button size="icon" variant="secondary" loading={isDeletePending}>
              <MoreVertOutlined fontSize="inherit" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className=" bg-gray-50 shadow-lg"
          >
            <DropdownMenuItem destructive onClick={showDeleteModal}>
              Delete payment link
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <CheckoutLinkPage checkoutLink={checkoutLink} />
      </div>

      <ConfirmModal
        title="Delete Payment Link"
        description="It will cause 404 responses if the link is still in use."
        onConfirm={onDelete}
        isShown={isDeleteModalShown}
        hide={hideDeleteModal}
        confirmPrompt={checkoutLink.label ?? ''}
        destructiveText="Delete"
        destructive
      />
    </div>
  )
}
