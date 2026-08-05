'use client'

import { StorefrontLinkItem } from '@/components/Profile/StorefrontLinks'
import { CATEGORY_LABELS } from '@/components/Profile/categoryLabels'
import {
  itemKey,
  removeSpaceItem,
  reorderSpaceItem,
  resolveSpaceItems,
  setItemHidden,
  type ResolvedSpaceItem,
} from '@/components/Profile/spaceItems'
import { FormPublic } from '@/hooks/queries/forms'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import OndemandVideoOutlined from '@mui/icons-material/OndemandVideoOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { schemas } from '@spaire/client'
import { useMemo } from 'react'
import { useFormContext } from 'react-hook-form'

// Arrange panel — one flat sortable list of EVERYTHING on the Space.
//
// Drag any item over any other to reorder. Kinds interleave freely:
// link → product → link → course → link is the whole point. There are
// no categories, no per-kind sections, no per-section DnD contexts —
// the list you see here is the list the public Space renders, in the
// same order.
//
// Hide vs Delete
// ──────────────
// Hidden items stay in the order (still occupying a slot) but render
// in a muted "Hidden" row with an unhide eye-icon. Permanent deletion
// is a separate action (trash, with confirm). Both products and links
// hide the same way — no more "products hide reversibly, links delete
// outright" inconsistency.

const SortableRow = ({
  id,
  className = '',
  children,
}: {
  id: string
  className?: string
  children: (handle: {
    listeners: ReturnType<typeof useSortable>['listeners']
    attributes: ReturnType<typeof useSortable>['attributes']
    isDragging: boolean
  }) => React.ReactNode
}) => {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    listeners,
    attributes,
  } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`ap-sortable ${className} ${
        isDragging ? 'ap-is-dragging' : ''
      }`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      {children({ listeners, attributes, isDragging })}
    </div>
  )
}

const Grip = ({
  listeners,
  attributes,
  label,
}: {
  listeners: ReturnType<typeof useSortable>['listeners']
  attributes: ReturnType<typeof useSortable>['attributes']
  label: string
}) => (
  <button
    type="button"
    className="ap-grip"
    aria-label={label}
    {...listeners}
    {...attributes}
  >
    <DragIndicatorOutlined style={{ fontSize: 18 }} />
  </button>
)

// Resolve the chip label shown on the right side of a product row.
// Mirrors the category that the public Space renders as the section
// header (eBooks, Courses, Templates, …) so the creator never has to
// guess what kind of product they're looking at. Falls back to
// "Product" when the product has no category or one we don't have a
// label for — preferable to a blank chip on a row that's clearly a
// product.
const productCategoryLabel = (
  product: { category?: string | null },
): string => {
  const cat = product.category
  if (cat && cat in CATEGORY_LABELS) return CATEGORY_LABELS[cat]
  return 'Product'
}

// What to render for each item kind — image thumbnail + name for
// products, an icon + title (or URL) for links and embeds. The
// right-side chip shows the category (for products) or the kind
// (Embed / Link) so every row is self-describing.
const ItemRowBody = ({ item }: { item: ResolvedSpaceItem }) => {
  if (item.kind === 'product') {
    const { product } = item
    return (
      <>
        {product.medias[0]?.public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.medias[0].public_url}
            alt=""
            className="ap-thumb"
          />
        ) : (
          <span className="ap-thumb ap-thumb-empty" />
        )}
        <span className="ap-row-name" title={product.name}>
          {product.name}
        </span>
        <span className="ap-row-kind">{productCategoryLabel(product)}</span>
      </>
    )
  }
  if (item.kind === 'form') {
    return (
      <>
        <span className="ap-thumb ap-thumb-empty" />
        <span className="ap-row-name" title={item.form.title}>
          {item.form.title}
        </span>
        <span className="ap-row-kind">Lead magnet</span>
      </>
    )
  }
  const { link } = item
  const isEmbed = link.type === 'embedded'
  const label = link.title || link.url || (isEmbed ? 'Embed' : 'Link')
  return (
    <>
      <span className="ap-thumb ap-thumb-empty">
        {isEmbed ? (
          <OndemandVideoOutlined style={{ fontSize: 18 }} />
        ) : (
          <LinkOutlined style={{ fontSize: 18 }} />
        )}
      </span>
      <span className="ap-row-name" title={label}>
        {label}
      </span>
      <span className="ap-row-kind">{isEmbed ? 'Embed' : 'Link'}</span>
    </>
  )
}

export const ArrangePanel = ({
  organization,
  products,
  forms = [],
  onClose,
}: {
  organization: schemas['Organization']
  products: schemas['ProductStorefront'][]
  forms?: FormPublic[]
  onClose: () => void
}) => {
  const { watch, setValue } = useFormContext<schemas['OrganizationUpdate']>()
  const settings = (watch('storefront_settings') ??
    organization.storefront_settings) as
    | schemas['OrganizationStorefrontSettings']
    | undefined

  const links = (settings?.storefront_links ?? []) as StorefrontLinkItem[]

  // We render BOTH visible and hidden items, distinguished in the row
  // styling. Hidden items keep their slot in the order so unhiding is
  // a one-click op that restores the creator's intended position.
  const items = useMemo(
    () =>
      resolveSpaceItems({
        settings,
        products,
        links,
        forms,
        includeHidden: true,
      }),
    [settings, products, links, forms],
  )

  // The generated OpenAPI types don't include `space_items` yet — it
  // lands on the frontend the next time `pnpm generate` runs against a
  // backend that has the new field. Until then we accept Partial<…>
  // *plus* arbitrary extra keys (notably `space_items`) so the
  // resolver's patches flow through cleanly.
  const writeSettings = (
    patch: Partial<schemas['OrganizationStorefrontSettings']> &
      Record<string, unknown>,
  ) => {
    setValue(
      'storefront_settings',
      { ...(settings ?? {}), ...patch } as schemas['OrganizationStorefrontSettings'],
      { shouldDirty: true },
    )
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const patch = reorderSpaceItem({
      settings,
      products,
      links,
      fromId: String(active.id),
      toId: String(over.id),
    })
    if (patch) writeSettings(patch)
  }

  const onToggleHidden = (key: string, hidden: boolean) => {
    const patch = setItemHidden({
      settings,
      products,
      links,
      key,
      hidden,
    })
    writeSettings(patch)
  }

  const onDelete = (key: string, label: string) => {
    if (
      !window.confirm(
        `Delete ${label}? This removes it from your Space permanently.`,
      )
    ) {
      return
    }
    // For links, removing the item from `storefront_links` is the
    // permanent delete. For products, we never want to delete the
    // product itself from the catalog from this panel — "remove from
    // Space" means hide-permanently, i.e. drop the entry. Either way
    // the Space loses the item.
    const item = items.find((i) => itemKey(i) === key)
    if (!item) return
    if (item.kind === 'link') {
      const nextLinks = links.filter((l) => l.id !== item.id)
      writeSettings({
        ...removeSpaceItem({
          settings,
          products,
          links,
          key,
        }),
        storefront_links: nextLinks,
      })
      return
    }
    writeSettings(removeSpaceItem({ settings, products, links, key }))
  }

  // ── Render ──
  if (items.length === 0) {
    return (
      <div className="arrange-panel">
        <div className="ap-header">
          <div>
            <h2>Arrange</h2>
            <p className="ap-sub">Nothing in your Space yet.</p>
          </div>
          <button
            type="button"
            className="ap-close"
            onClick={onClose}
            aria-label="Close Arrange panel"
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  const visibleCount = items.filter((i) => !i.hidden).length
  const hiddenCount = items.length - visibleCount

  return (
    <div className="arrange-panel">
      <div className="ap-header">
        <div>
          <h2>Arrange</h2>
          <p className="ap-sub">Drag any row to reorder.</p>
        </div>
        <button
          type="button"
          className="ap-close"
          onClick={onClose}
          aria-label="Close Arrange panel"
        >
          ×
        </button>
      </div>

      <div className="ap-status">
        <span>
          {visibleCount} on your Space
          {hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ''}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={items.map(itemKey)}
          strategy={verticalListSortingStrategy}
        >
          <div className="ap-row-list">
            {items.map((item) => {
              const key = itemKey(item)
              const label =
                item.kind === 'product'
                  ? item.product.name
                  : item.kind === 'form'
                    ? item.form.title
                    : item.link.title || item.link.url || 'Link'
              return (
                <SortableRow
                  key={key}
                  id={key}
                  className={item.hidden ? 'ap-row-muted' : ''}
                >
                  {({ listeners, attributes }) => (
                    <div className="ap-row">
                      <Grip
                        listeners={listeners}
                        attributes={attributes}
                        label={`Drag ${label}`}
                      />
                      <ItemRowBody item={item} />
                      {item.hidden ? (
                        <button
                          type="button"
                          className="ap-row-action"
                          onClick={() => onToggleHidden(key, false)}
                          title="Show on Space"
                          aria-label={`Show ${label} on Space`}
                        >
                          <VisibilityOutlined style={{ fontSize: 16 }} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="ap-row-action"
                          onClick={() => onToggleHidden(key, true)}
                          title="Hide from Space"
                          aria-label={`Hide ${label} from Space`}
                        >
                          <VisibilityOffOutlined style={{ fontSize: 16 }} />
                        </button>
                      )}
                      <button
                        type="button"
                        className="ap-row-action ap-row-action-danger"
                        onClick={() => onDelete(key, label)}
                        title={
                          item.kind === 'link'
                            ? 'Delete link permanently'
                            : 'Remove from Space'
                        }
                        aria-label={`Delete ${label}`}
                      >
                        <DeleteOutlineOutlined style={{ fontSize: 16 }} />
                      </button>
                    </div>
                  )}
                </SortableRow>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
