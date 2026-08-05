'use client'

import { LeadMagnetCard } from '@/components/Forms/LeadMagnetCard'
import { ProductCard } from '@/components/Products/ProductCard'
import { StorefrontCourseCard } from '@/components/Products/StorefrontCourseCard'
import { CATEGORY_LABELS } from '@/components/Profile/categoryLabels'
import { SectionLabel } from '@/components/Profile/SectionLabel'
import {
  EmbedCard,
  isEmbeddableLink,
  type LinksLayout,
  StorefrontLinkItem,
  URL_LAYOUT_WRAPPERS,
  UrlLink,
} from '@/components/Profile/StorefrontLinks'
import {
  itemKey,
  reorderSpaceItem,
  resolveSpaceItems,
  setItemHidden,
  type ResolvedSpaceItem,
} from '@/components/Profile/spaceItems'
import { toast } from '@/components/Toast/use-toast'
import { FormPublic } from '@/hooks/queries/forms'
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import EditOutlined from '@mui/icons-material/EditOutlined'
import GridViewOutlined from '@mui/icons-material/GridViewOutlined'
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import ViewAgendaOutlined from '@mui/icons-material/ViewAgendaOutlined'
import ViewCarouselOutlined from '@mui/icons-material/ViewCarouselOutlined'
import ViewListOutlined from '@mui/icons-material/ViewListOutlined'
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { SpaceEmptyHero } from '../SpaceEmptyHero'

// ─── Editor canvas — flat list of Space items ─────────────────────
//
// Everything on the Space (products, links, embeds) renders in a
// single flat sortable list. The order comes from
// `storefront_settings.space_items` via the resolver, so the canvas
// always shows the same sequence the public storefront will. Drag any
// item over any other to reorder; hide an item to take it off the
// Space without losing its slot or its data.
//
// Visual chunking
// ───────────────
// Consecutive items of the same kind render together — a run of
// products as the 2-column grid the public Space uses, a run of links
// as the creator's chosen layout (classic/card/grid/carousel). Single
// mixed items just sit on their own row.

const LAYOUTS: {
  value: LinksLayout
  label: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
}[] = [
  { value: 'classic', label: 'List', Icon: ViewListOutlined },
  { value: 'card', label: 'Cards', Icon: ViewAgendaOutlined },
  { value: 'image_grid', label: 'Grid', Icon: GridViewOutlined },
  { value: 'carousel', label: 'Carousel', Icon: ViewCarouselOutlined },
]

// Per-link "…" menu — sets THIS link's layout. Embeds don't get one
// (they always render full-width). Lives in the link's hover action row.
const LinkLayoutMenu = ({
  value,
  onChange,
}: {
  value: LinksLayout
  onChange: (next: LinksLayout) => void
}) => {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        className="item-action"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Layout"
        aria-label="Link layout"
      >
        <MoreHorizOutlined style={{ fontSize: 16 }} />
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-[7]"
            onClick={(e) => {
              e.stopPropagation()
              setOpen(false)
            }}
          />
          <div
            role="menu"
            className="absolute right-0 top-9 z-[8] w-36 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
          >
            {LAYOUTS.map(({ value: v, label, Icon }) => (
              <button
                key={v}
                type="button"
                role="menuitemradio"
                aria-checked={value === v}
                onClick={(e) => {
                  e.stopPropagation()
                  onChange(v)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
                  value === v
                    ? 'font-medium text-gray-900'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon style={{ fontSize: 16 }} />
                {label}
                {value === v && (
                  <span className="ml-auto text-[#0066cc]">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Generic sortable wrapper for a single Space item. The drag handle is
// a child element so the hover-attached Remove / Hide controls don't
// fight the listeners.
const SortableItem = ({
  id,
  className,
  children,
}: {
  id: string
  className?: string
  children: (handleProps: {
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
      className={`item-host${isDragging ? ' dragging' : ''}${
        className ? ` ${className}` : ''
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

const ItemDragHandle = ({
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
    className="item-drag-handle"
    aria-label={label}
    {...listeners}
    {...attributes}
  >
    ⋮⋮
  </button>
)

// Picks the right render for an embedded link (iframe) vs a normal URL
// link. Same dispatch the public Storefront uses, so the editor and
// the live page stay byte-for-byte equivalent at this layer.
const LinkRow = ({
  link,
  layout,
  embedded = false,
}: {
  link: StorefrontLinkItem
  layout: LinksLayout
  embedded?: boolean
}) => {
  if (isEmbeddableLink(link)) {
    return <EmbedCard link={link} />
  }
  return <UrlLink link={link} layout={embedded ? 'card' : layout} preview />
}

// Category bucket used when a product has no category, or one we don't
// have a label for. Same fallback the public storefront uses so the
// editor and the live page agree at the section-label layer too.
const FALLBACK_CATEGORY = 'other'

const categoryOf = (
  entry: Extract<ResolvedSpaceItem, { kind: 'product' }>,
): string => {
  const cat = entry.product.category
  if (cat && cat in CATEGORY_LABELS) return cat
  return FALLBACK_CATEGORY
}

type ProductChunk = {
  kind: 'product'
  category: string
  items: Extract<ResolvedSpaceItem, { kind: 'product' }>[]
}
type LinkChunk = {
  kind: 'link'
  items: Extract<ResolvedSpaceItem, { kind: 'link' }>[]
}
type FormChunk = {
  kind: 'form'
  items: Extract<ResolvedSpaceItem, { kind: 'form' }>[]
}
type Chunk = ProductChunk | LinkChunk | FormChunk

// Same chunking rule the public Storefront uses: start a new chunk on
// every (kind, category) transition. Two ebooks in a row → one chunk.
// Ebook, course, ebook → three chunks, "eBooks" label rendered twice.
// This is what keeps WYSIWYG between the editor canvas and the live
// page when the creator drags items across categories.
const chunkByKindAndCategory = (items: ResolvedSpaceItem[]): Chunk[] => {
  const out: Chunk[] = []
  for (const item of items) {
    if (item.kind === 'product') {
      const cat = categoryOf(item)
      const tail = out[out.length - 1]
      if (tail && tail.kind === 'product' && tail.category === cat) {
        tail.items.push(item)
        continue
      }
      out.push({ kind: 'product', category: cat, items: [item] })
    } else if (item.kind === 'form') {
      const tail = out[out.length - 1]
      if (tail && tail.kind === 'form') {
        tail.items.push(item)
        continue
      }
      out.push({ kind: 'form', items: [item] })
    } else {
      const tail = out[out.length - 1]
      if (tail && tail.kind === 'link') {
        tail.items.push(item)
        continue
      }
      out.push({ kind: 'link', items: [item] })
    }
  }
  return out
}

// ─── Per-link layout runs ─────────────────────────────────────────
// Within a link chunk, split into render runs: each embed is its own
// full-width run; consecutive standard links sharing a layout collapse
// into one run so Grid / Carousel arrange them together. Same shape and
// embed rule as the public renderer's buildLinkRuns (it shares
// isEmbeddableLink) so the canvas matches the live Space in document order.
type LinkEntry = Extract<ResolvedSpaceItem, { kind: 'link' }>

type LinkRun =
  | { kind: 'embed'; entry: LinkEntry }
  | { kind: 'group'; layout: LinksLayout; entries: LinkEntry[] }

const buildLinkRuns = (
  entries: LinkEntry[],
  fallback: LinksLayout,
): LinkRun[] => {
  const runs: LinkRun[] = []
  for (const entry of entries) {
    if (isEmbeddableLink(entry.link)) {
      runs.push({ kind: 'embed', entry })
      continue
    }
    const layout = (entry.link.layout ?? fallback) as LinksLayout
    const tail = runs[runs.length - 1]
    if (tail && tail.kind === 'group' && tail.layout === layout) {
      tail.entries.push(entry)
    } else {
      runs.push({ kind: 'group', layout, entries: [entry] })
    }
  }
  return runs
}

export const DraggableBlocks = ({
  organization: org,
  products,
  forms,
  onAddToSpace,
}: {
  organization: schemas['Organization']
  products: schemas['ProductStorefront'][]
  forms: FormPublic[]
  onAddToSpace?: () => void
}) => {
  const router = useRouter()
  const { watch, setValue } = useFormContext<schemas['OrganizationUpdate']>()
  const settings = (watch('storefront_settings') ??
    org.storefront_settings) as
    | schemas['OrganizationStorefrontSettings']
    | undefined

  const links = ((settings?.storefront_links ?? []) as StorefrontLinkItem[])
  const linksLayout: LinksLayout = (settings?.links_layout ??
    'classic') as LinksLayout
  const showDetails = settings?.show_product_details ?? true
  const thumbnailSize = (settings?.thumbnail_size ?? 'large') as
    | 'small'
    | 'medium'
    | 'large'

  // Hidden items belong in the editor (so the creator can drag/unhide
  // them) but never in the public render — the resolver does the
  // filtering, we just ask for the visible-only list here.
  const items = useMemo(
    () => resolveSpaceItems({ settings, products, links, forms }),
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

  // Per-link layout — patch the matching entry in storefront_links so each
  // link controls its own list / cards / grid / carousel rendering.
  const setLinkLayout = (linkId: string, nextLayout: LinksLayout) => {
    const nextLinks = links.map((l) =>
      l.id === linkId ? { ...l, layout: nextLayout } : l,
    )
    writeSettings({ storefront_links: nextLinks })
  }

  const onHide = (key: string, name: string) => {
    const patch = setItemHidden({
      settings,
      products,
      links,
      key,
      hidden: true,
    })
    writeSettings(patch)
    toast({
      title: `${name} hidden`,
      description: 'Visit Arrange to restore it.',
    })
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = (e: DragEndEvent) => {
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

  // Match the empty-state hero height to the left ProfileCard so the
  // columns line up visually. Falls back to a sensible viewport calc
  // until the measurement lands.
  const [leftCardHeight, setLeftCardHeight] = useState<number | null>(null)
  const isEmpty = items.length === 0
  useEffect(() => {
    if (!isEmpty || typeof window === 'undefined') return
    const leftCard = document.querySelector(
      '.spaire-editor .col-left .canvas-card',
    ) as HTMLElement | null
    if (!leftCard) return
    const update = () =>
      setLeftCardHeight(leftCard.getBoundingClientRect().height)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(leftCard)
    return () => ro.disconnect()
  }, [isEmpty])

  if (isEmpty) {
    return (
      <div
        style={{
          height: leftCardHeight ?? undefined,
          minHeight: leftCardHeight ? undefined : 'calc(100dvh - 220px)',
          width: '100%',
        }}
      >
        <SpaceEmptyHero onAddToSpace={onAddToSpace} fill />
      </div>
    )
  }

  const chunks = chunkByKindAndCategory(items)

  // One link row + its hover controls (drag, the per-link layout "…"
  // menu for non-embeds, hide). Shared by embed runs and grouped runs.
  const renderLinkEntry = (entry: LinkEntry, rowLayout: LinksLayout) => (
    <SortableItem key={itemKey(entry)} id={itemKey(entry)}>
      {({ listeners, attributes }) => (
        <div className="item-hover">
          <LinkRow
            link={entry.link}
            layout={rowLayout}
            embedded={entry.link.type === 'embedded'}
          />
          <div className="item-actions">
            {entry.link.type !== 'embedded' && (
              <LinkLayoutMenu
                value={(entry.link.layout ?? linksLayout) as LinksLayout}
                onChange={(lay) => setLinkLayout(entry.link.id, lay)}
              />
            )}
            <ItemDragHandle
              listeners={listeners}
              attributes={attributes}
              label={`Drag ${entry.link.title || 'link'} to reorder`}
            />
            <button
              type="button"
              className="item-action"
              onClick={(e) => {
                e.stopPropagation()
                onHide(
                  itemKey(entry),
                  entry.link.title || entry.link.url || 'Link',
                )
              }}
              title="Hide from Space"
              aria-label={`Hide ${entry.link.title || 'link'} from Space`}
            >
              <VisibilityOffOutlined style={{ fontSize: 16 }} />
            </button>
          </div>
        </div>
      )}
    </SortableItem>
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map(itemKey)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-12">
          {chunks.map((chunk, idx) => {
            if (chunk.kind === 'product') {
              const isCourse = chunk.category === 'course'
              return (
                <section
                  key={`p-${idx}`}
                  className="canvas-card flex scroll-mt-24 flex-col gap-6"
                >
                  <SectionLabel count={chunk.items.length}>
                    {CATEGORY_LABELS[chunk.category] ?? CATEGORY_LABELS.other}
                  </SectionLabel>
                  <div
                    className={
                      isCourse
                        ? 'flex w-full flex-col gap-6'
                        : 'grid w-full grid-cols-1 gap-6 md:grid-cols-2'
                    }
                  >
                  {chunk.items.map((entry) => (
                    <SortableItem key={itemKey(entry)} id={itemKey(entry)}>
                      {({ listeners, attributes }) => (
                        <div className="item-hover">
                          {isCourse ? (
                            <StorefrontCourseCard
                              product={entry.product}
                              previewStatic
                            />
                          ) : (
                            <ProductCard
                              product={entry.product}
                              showDetails={showDetails}
                              thumbnailSize={thumbnailSize}
                            />
                          )}
                          <div className="item-actions">
                            <ItemDragHandle
                              listeners={listeners}
                              attributes={attributes}
                              label={`Drag ${entry.product.name} to reorder`}
                            />
                            <button
                              type="button"
                              className="item-action"
                              onClick={(e) => {
                                e.stopPropagation()
                                onHide(itemKey(entry), entry.product.name)
                              }}
                              title="Hide from Space"
                              aria-label={`Hide ${entry.product.name} from Space`}
                            >
                              <VisibilityOffOutlined style={{ fontSize: 16 }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                  </div>
                </section>
              )
            }
            if (chunk.kind === 'form') {
              return (
                <div
                  key={`f-${idx}`}
                  className="canvas-card flex flex-col gap-6"
                >
                  {chunk.items.map((entry) => (
                    <SortableItem key={itemKey(entry)} id={itemKey(entry)}>
                      {({ listeners, attributes }) => (
                        <div className="item-hover">
                          <LeadMagnetCard
                            form={entry.form}
                            interactive={false}
                          />
                          <div className="item-actions">
                            <button
                              type="button"
                              className="item-action"
                              onClick={(e) => {
                                e.stopPropagation()
                                router.push(
                                  `/dashboard/${org.slug}/forms/${entry.form.id}/edit`,
                                )
                              }}
                              title="Edit lead magnet"
                              aria-label={`Edit ${entry.form.title}`}
                            >
                              <EditOutlined style={{ fontSize: 16 }} />
                            </button>
                            <ItemDragHandle
                              listeners={listeners}
                              attributes={attributes}
                              label={`Drag ${entry.form.title} to reorder`}
                            />
                            <button
                              type="button"
                              className="item-action"
                              onClick={(e) => {
                                e.stopPropagation()
                                onHide(itemKey(entry), entry.form.title)
                              }}
                              title="Hide from Space"
                              aria-label={`Hide ${entry.form.title} from Space`}
                            >
                              <VisibilityOffOutlined style={{ fontSize: 16 }} />
                            </button>
                          </div>
                        </div>
                      )}
                    </SortableItem>
                  ))}
                </div>
              )
            }
            // Link chunk. Each link renders in ITS OWN layout (set from
            // the link's "…" menu). Consecutive links sharing a layout
            // group into one container so Grid / Carousel arrange them
            // together; embeds always sit full-width on their own row.
            const runs = buildLinkRuns(chunk.items, linksLayout)
            return (
              <div key={`l-${idx}`} className="canvas-card flex flex-col gap-5">
                {runs.map((run) =>
                  run.kind === 'embed' ? (
                    renderLinkEntry(run.entry, 'card')
                  ) : (
                    <div
                      key={`g-${itemKey(run.entries[0])}`}
                      className={
                        URL_LAYOUT_WRAPPERS[run.layout] ??
                        URL_LAYOUT_WRAPPERS.classic
                      }
                      style={
                        run.layout === 'carousel'
                          ? { scrollbarWidth: 'thin' }
                          : undefined
                      }
                    >
                      {run.entries.map((entry) =>
                        renderLinkEntry(entry, run.layout),
                      )}
                    </div>
                  ),
                )}
              </div>
            )
          })}
        </div>
      </SortableContext>
    </DndContext>
  )
}
