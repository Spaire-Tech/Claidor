import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { useModal } from '@/components/Modal/useModal'
import LegacyRecurringProductPrices from '@/components/Products/LegacyRecurringProductPrices'
import ProductPriceLabel from '@/components/Products/ProductPriceLabel'
import { ProductThumbnail } from '@/components/Products/ProductThumbnail'
import { toast } from '@/components/Toast/use-toast'
import { useUpdateProduct } from '@/hooks/queries/products'
import { hasLegacyRecurringPrices } from '@/utils/product'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { ListItem } from '@spaire/ui/components/atoms/List'
import Pill from '@spaire/ui/components/atoms/Pill'
import { Status } from '@spaire/ui/components/atoms/Status'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@spaire/ui/components/ui/tooltip'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

interface ProductListItemProps {
  product: schemas['Product'] | schemas['CheckoutProduct']
  organization: schemas['Organization']
  /** When set, the row links straight to the course editor for this courseId. */
  courseId?: string
}

type CategoryKey =
  | 'ebook'
  | 'template'
  | 'assets'
  | 'course'
  | 'guide'
  | 'music'
  | 'video'
  | 'photo'
  | 'software'
  | 'coaching'
  | 'membership'
  | 'other'

const CATEGORY_PILLS: Record<
  CategoryKey,
  { label: string; className: string }
> = {
  ebook: { label: 'eBook', className: 'bg-amber-100 text-amber-700' },
  template: { label: 'Template', className: 'bg-cyan-100 text-cyan-700' },
  assets: { label: 'Assets', className: 'bg-pink-100 text-pink-700' },
  course: { label: 'Course', className: 'bg-sky-100 text-sky-700' },
  guide: { label: 'Guide', className: 'bg-emerald-100 text-emerald-700' },
  music: { label: 'Music', className: 'bg-fuchsia-100 text-fuchsia-700' },
  video: { label: 'Video', className: 'bg-red-100 text-red-700' },
  photo: { label: 'Photo', className: 'bg-orange-100 text-orange-700' },
  software: { label: 'Software', className: 'bg-blue-100 text-blue-700' },
  coaching: { label: 'Coaching', className: 'bg-lime-100 text-lime-700' },
  membership: {
    label: 'Membership',
    className: 'bg-teal-100 text-teal-700',
  },
  other: { label: 'Other', className: 'bg-gray-100 text-gray-700' },
}

export const ProductListItem = ({
  product,
  organization,
  courseId,
}: ProductListItemProps) => {
  const router = useRouter()
  const {
    show: showModal,
    hide: hideModal,
    isShown: isConfirmModalShown,
  } = useModal()

  const handleContextMenuCallback = (
    callback: (e: React.MouseEvent) => void,
  ) => {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      callback(e)
    }
  }

  const updateProduct = useUpdateProduct(organization)

  const onArchiveProduct = useCallback(async () => {
    try {
      await updateProduct.mutate({
        id: product.id,
        body: {
          is_archived: true,
        },
      })

      toast({
        title: 'Product archived',
        description: 'The product has been archived',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred while archiving the product',
      })
    }
  }, [updateProduct, product])

  const isCourseProduct = !!courseId
  const itemHref = courseId
    ? `/dashboard/${organization.slug}/courses/${courseId}`
    : `/dashboard/${organization.slug}/products/${product.id}`

  // Category pill — uses the same category options shown in product creation.
  // Courses always render the Course pill (overrides whatever category the
  // backing product was created with).
  const rawCategory = (product as { category?: CategoryKey | null }).category
  const categoryKey: CategoryKey | null = isCourseProduct
    ? 'course'
    : (rawCategory ?? null)
  const categoryTag = categoryKey ? CATEGORY_PILLS[categoryKey] : null

  return (
    <>
      <Link href={itemHref}>
        <ListItem className="flex flex-row items-center justify-between gap-x-6">
          <div className="flex min-w-0 grow flex-row items-center gap-x-4 text-sm">
            <ProductThumbnail product={product} />
            <div className="flex min-w-0 flex-row items-center gap-x-2">
              <span className="truncate">{product.name}</span>
              {product.visibility === 'private' && (
                <Pill color="gray" className="shrink-0 px-2 py-0.5 text-xs">
                  Private
                </Pill>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-x-4 md:gap-x-6">
            {product.is_archived ? (
              <Tooltip>
                <TooltipTrigger>
                  <Status
                    className="bg-red-100 text-red-500"
                    status="Archived"
                  />
                </TooltipTrigger>
                <TooltipContent align="center" side="left">
                  Archived products only prevents new subscribers & purchases
                </TooltipContent>
              </Tooltip>
            ) : (
              <>
                {categoryTag && (
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${categoryTag.className}`}
                  >
                    {categoryTag.label}
                  </span>
                )}
                <span className="text-sm leading-snug">
                  {hasLegacyRecurringPrices(product) ? (
                    <LegacyRecurringProductPrices product={product} />
                  ) : (
                    <ProductPriceLabel product={product} />
                  )}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(e) => {
                    e.preventDefault()
                    router.push(
                      `/dashboard/${organization.slug}/products/checkout-links?productId=${product.id}`,
                    )
                  }}
                >
                  Share
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger className="focus:outline-none" asChild>
                    <Button
                      className={
                        'border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100'
                      }
                      size="icon"
                      variant="secondary"
                    >
                      <MoreVertOutlined fontSize="inherit" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="bg-gray-50 shadow-lg"
                  >
                    {/* Editing, checkout integration, and raw product ids are
                        builder-era leftovers — the masterclass builder owns
                        all of that now, so the menu keeps only duplicate and
                        archive. */}
                    <DropdownMenuItem
                      onClick={handleContextMenuCallback(() => {
                        router.push(
                          `/dashboard/${organization.slug}/products/new?fromProductId=${product.id}`,
                        )
                      })}
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onClick={handleContextMenuCallback(showModal)}
                    >
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </ListItem>
      </Link>
      <ConfirmModal
        isShown={isConfirmModalShown}
        hide={hideModal}
        title={`Archive "${product.name}"`}
        description="Are you sure you want to archive this masterclass? This action cannot be undone."
        onConfirm={onArchiveProduct}
        destructive
        destructiveText="Yes, archive"
      />
    </>
  )
}
