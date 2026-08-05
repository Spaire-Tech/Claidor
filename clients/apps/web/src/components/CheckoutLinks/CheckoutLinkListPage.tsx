'use client'

import { CheckoutLinkDetailPanel } from '@/components/CheckoutLinks/CheckoutLinkDetailPanel'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import Spinner from '@/components/Shared/Spinner'
import { toast } from '@/components/Toast/use-toast'
import {
  useCheckoutLinks,
  useCreateCheckoutLink,
  useUpdateCheckoutLink,
} from '@/hooks/queries'
import { useInViewport } from '@/hooks/utils'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined'
import DriveFileRenameOutlineOutlined from '@mui/icons-material/DriveFileRenameOutlineOutlined'
import FileCopyOutlined from '@mui/icons-material/FileCopyOutlined'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import PowerSettingsNewOutlined from '@mui/icons-material/PowerSettingsNewOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { schemas } from '@spaire/client'
import { formatCurrency } from '@spaire/currency'
import Button from '@spaire/ui/components/atoms/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/atoms/DropdownMenu'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@spaire/ui/components/ui/dialog'
import {
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
  useQueryState,
} from 'nuqs'
import ProductSelect from '../Products/ProductSelect'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface CheckoutLinkListPageProps {
  organization: schemas['Organization']
}

function isLinkActive(link: schemas['CheckoutLink']): boolean {
  const meta = link.metadata as Record<string, unknown> | null
  return meta?.is_active !== false
}

function getLinkDisplayName(link: schemas['CheckoutLink']): string {
  return link.label ?? link.products[0]?.name ?? 'Untitled'
}

function getLinkPriceDisplay(link: schemas['CheckoutLink']): string {
  const firstPrice = link.products[0]?.prices[0]
  if (!firstPrice) return '—'
  if (firstPrice.amount_type === 'fixed') {
    return formatCurrency('compact')(
      (firstPrice as { price_amount: number }).price_amount,
      (firstPrice as { price_currency: string }).price_currency,
    )
  }
  if (firstPrice.amount_type === 'free') return 'Free'
  if (firstPrice.amount_type === 'custom') return 'Pay what you want'
  return '—'
}

export const CheckoutLinkListPage = ({
  organization,
}: CheckoutLinkListPageProps) => {
  const router = useRouter()

  const [productIds, setProductIds] = useQueryState(
    'productId',
    parseAsArrayOf(parseAsString),
  )

  const [sorting, setSorting] = useQueryState(
    'sorting',
    parseAsStringLiteral([
      '-created_at',
      'created_at',
      'label',
      '-label',
    ] as const).withDefault('-created_at'),
  )

  const { data, fetchNextPage, hasNextPage } = useCheckoutLinks(
    organization.id,
    { sorting: [sorting], product_id: productIds },
  )

  const checkoutLinks = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [renameLink, setRenameLink] = useState<schemas['CheckoutLink'] | null>(null)
  const [renameName, setRenameName] = useState('')

  const { ref: loadingRef, inViewport } = useInViewport<HTMLDivElement>()
  useEffect(() => {
    if (inViewport && hasNextPage) fetchNextPage()
  }, [inViewport, hasNextPage, fetchNextPage])

  const { mutateAsync: updateCheckoutLink } = useUpdateCheckoutLink()
  const { mutateAsync: createCheckoutLink } = useCreateCheckoutLink()

  const navigateToCreate = () =>
    router.push(`/dashboard/${organization.slug}/products/checkout-links/new`)

  const handleCopyUrl = (link: schemas['CheckoutLink']) => {
    navigator.clipboard.writeText(link.url)
    toast({ title: 'Link Copied', description: 'Payment link copied to clipboard' })
  }

  const handleToggleActive = async (link: schemas['CheckoutLink']) => {
    const meta = (link.metadata ?? {}) as Record<string, unknown>
    const newActive = !isLinkActive(link)
    await updateCheckoutLink({
      id: link.id,
      body: { metadata: { ...meta, is_active: newActive } as Record<string, string | number | boolean> },
    })
    toast({
      title: newActive ? 'Link Activated' : 'Link Deactivated',
      description: `"${getLinkDisplayName(link)}" is now ${newActive ? 'active' : 'inactive'}.`,
    })
  }

  const handleDuplicate = async (link: schemas['CheckoutLink']) => {
    const meta = (link.metadata ?? {}) as Record<string, string | number | boolean>
    await createCheckoutLink({
      payment_processor: 'stripe',
      products: link.products.map((p) => p.id),
      label: `${getLinkDisplayName(link)} (copy)`,
      allow_discount_codes: link.allow_discount_codes,
      require_billing_address: link.require_billing_address,
      discount_id: link.discount_id ?? null,
      success_url: link.success_url ?? null,
      metadata: meta,
    })
    toast({ title: 'Link Duplicated', description: 'A copy has been created.' })
  }

  const openRename = (link: schemas['CheckoutLink']) => {
    setRenameLink(link)
    setRenameName(getLinkDisplayName(link))
  }

  const handleRename = async () => {
    if (!renameLink) return
    await updateCheckoutLink({ id: renameLink.id, body: { label: renameName || null } })
    toast({ title: 'Name Updated' })
    setRenameLink(null)
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-6">
        {checkoutLinks.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-row items-center gap-3">
                <div className="w-full md:max-w-64">
                  <ProductSelect
                    organization={organization}
                    value={productIds ?? []}
                    onChange={(ids) => setProductIds(ids)}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSorting(
                      sorting === '-created_at' ? 'created_at' : '-created_at',
                    )
                  }
                >
                  {sorting === 'created_at' ? (
                    <ArrowUpward fontSize="small" />
                  ) : (
                    <ArrowDownward fontSize="small" />
                  )}
                </Button>
              </div>
              <Button onClick={navigateToCreate}>
                <AddOutlined className="h-4 w-4" />
                <span>Create payment link</span>
              </Button>
            </div>

            <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
              {/* Header row */}
              <div className="flex flex-row items-center gap-3 px-6 py-2">
                <div className="w-2 shrink-0" />
                <span className="min-w-0 flex-1 text-xs font-medium text-gray-400">Name</span>
                <span className="hidden w-28 shrink-0 text-right text-xs font-medium text-gray-400 sm:block">Price</span>
                <span className="hidden w-28 shrink-0 text-right text-xs font-medium text-gray-400 md:block">Collected</span>
                <span className="hidden w-32 shrink-0 text-right text-xs font-medium text-gray-400 lg:block">Created</span>
                <div className="w-8 shrink-0" />
              </div>
              {checkoutLinks.map((link) => {
                const active = isLinkActive(link)
                const name = getLinkDisplayName(link)
                const productLabel =
                  link.products.length === 1
                    ? link.products[0].name
                    : `${link.products.length} products`
                const priceDisplay = getLinkPriceDisplay(link)
                const createdAt = new Date(link.created_at).toLocaleDateString(
                  undefined,
                  { year: 'numeric', month: 'short', day: 'numeric' },
                )

                return (
                  <div
                    key={link.id}
                    className=" flex flex-row items-center gap-3 px-6 py-4 transition-colors hover:bg-gray-50"
                  >
                    {/* Active dot */}
                    <div
                      className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-green-500' : 'bg-gray-300'}`}
                      title={active ? 'Active' : 'Inactive'}
                    />

                    {/* Main content */}
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 flex-col text-left"
                      onClick={() => setSelectedLinkId(link.id)}
                    >
                      <span
                        className={`truncate text-sm font-medium ${active ? ' text-gray-900' : 'text-gray-400 line-through'}`}
                      >
                        {name}
                      </span>
                      <span className=" truncate text-xs text-gray-500">
                        {productLabel}
                      </span>
                    </button>

                    {/* Price */}
                    <span className="hidden w-28 shrink-0 text-right text-sm text-gray-700 sm:block">
                      {priceDisplay}
                    </span>

                    {/* Collected fees */}
                    <span className="hidden w-28 shrink-0 text-right text-sm text-gray-400 md:block">
                      —
                    </span>

                    {/* Created date */}
                    <span className="hidden w-32 shrink-0 text-right text-sm text-gray-500 lg:block">
                      {createdAt}
                    </span>

                    {/* Three-dots menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className=" h-8 w-8 shrink-0 text-gray-500"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertOutlined fontSize="small" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem
                          onClick={() => handleCopyUrl(link)}
                        >
                          <ContentCopyOutlined fontSize="small" className="mr-2" />
                          Copy URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            router.push(
                              `/dashboard/${organization.slug}/checkout-preview/${link.id}`,
                            )
                          }
                        >
                          <VisibilityOutlined fontSize="small" className="mr-2" />
                          Preview payment link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openRename(link)}>
                          <DriveFileRenameOutlineOutlined
                            fontSize="small"
                            className="mr-2"
                          />
                          Change name
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setSelectedLinkId(link.id)}
                        >
                          <OpenInNewOutlined fontSize="small" className="mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDuplicate(link)}
                        >
                          <FileCopyOutlined fontSize="small" className="mr-2" />
                          Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleToggleActive(link)}
                          className={active ? 'text-red-500 focus:text-red-500' : 'text-green-600 focus:text-green-600'}
                        >
                          <PowerSettingsNewOutlined
                            fontSize="small"
                            className="mr-2"
                          />
                          {active ? 'Deactivate' : 'Activate'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
              {hasNextPage && (
                <div
                  ref={loadingRef}
                  className="flex w-full items-center justify-center py-6"
                >
                  <Spinner />
                </div>
              )}
            </div>
          </>
        ) : (
          <StripeStyleEmptyState onCreateClick={navigateToCreate} />
        )}
      </div>

      {/* Rename dialog */}
      <Dialog open={!!renameLink} onOpenChange={(open) => !open && setRenameLink(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change name</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 pt-2">
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              placeholder="Link name"
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRenameLink(null)}>
                Cancel
              </Button>
              <Button onClick={handleRename}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <InlineModal
        isShown={!!selectedLinkId}
        hide={() => setSelectedLinkId(null)}
        className="md:w-[600px]"
        modalContent={
          selectedLinkId ? (
            <CheckoutLinkDetailPanel
              checkoutLinkId={selectedLinkId}
              organization={organization}
              onClose={() => setSelectedLinkId(null)}
            />
          ) : (
            <div />
          )
        }
      />
    </DashboardBody>
  )
}

// Empty state
function StripeStyleEmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 text-center">
      {/* Geometric icon — Venn-diagram circles */}
      <div style={{ isolation: 'isolate' }} className="relative h-14 w-24">
        <div style={{ mixBlendMode: 'multiply' }} className="absolute top-0 left-0 h-14 w-14 rounded-full bg-cyan-300" />
        <div style={{ mixBlendMode: 'multiply' }} className="absolute top-0 right-0 h-14 w-14 rounded-full bg-blue-300" />
      </div>

      {/* Title + description */}
      <div className="flex max-w-lg flex-col gap-3">
        <h2 className="text-3xl font-bold text-gray-900">
          Create a payment link in a few clicks
        </h2>
        <p className="text-gray-500">
          Sell products, offer subscriptions, or accept donations with a
          link—no code required.
        </p>
      </div>

      {/* CTA */}
      <Button size="lg" onClick={onCreateClick} className="gap-2">
        <AddOutlined fontSize="small" />
        Create payment link
      </Button>
    </div>
  )
}
