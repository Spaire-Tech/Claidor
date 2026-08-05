'use client'

import { SpaceEmptyHero } from '@/components/Customization/SpaceEmptyHero'
import { ProductCard } from '@/components/Products/ProductCard'
import { StorefrontCourseCard } from '@/components/Products/StorefrontCourseCard'
import { FormPublic } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useMemo } from 'react'
import { CATEGORY_LABELS } from './categoryLabels'
import { SectionLabel } from './SectionLabel'
import { StorefrontForm } from './StorefrontForm'
import {
  LinksLayout,
  StorefrontLinkItem,
  StorefrontLinks,
} from './StorefrontLinks'
import { resolveSpaceItems, type ResolvedSpaceItem } from './spaceItems'

// Render the public Space.
//
// Order is driven by `space_items` (see ./spaceItems.ts) — products and
// links interleave in whatever sequence the creator chose. The product
// 2-column grid and per-category labels are preserved by chunking
// adjacent items at every (kind, category) transition: a run of
// consecutive products of the SAME category becomes one labelled grid;
// a category change (or a link in between) starts a fresh section. So
// ebook → course → ebook renders as three labelled sections — the
// second eBooks header reappears below the course, exactly the way
// the creator placed them.
export const Storefront = ({
  organization,
  products,
  forms = [],
  preview = false,
}: {
  organization: schemas['Organization'] | schemas['CustomerOrganization']
  products: schemas['ProductStorefront'][]
  forms?: FormPublic[]
  /**
   * Editor-preview mode: product cards don't navigate. The card still
   * looks live, but clicking it doesn't take the org out of the editor.
   */
  preview?: boolean
}) => {
  const settings =
    'storefront_settings' in organization
      ? organization.storefront_settings
      : null

  const showDetails = settings?.show_product_details ?? true
  const thumbnailSize = (settings?.thumbnail_size ?? 'large') as
    | 'small'
    | 'medium'
    | 'large'
  const linksLayout: LinksLayout = (settings?.links_layout ?? 'classic') as LinksLayout

  const links = (settings?.storefront_links ?? []) as StorefrontLinkItem[]

  const items = useMemo(
    () => resolveSpaceItems({ settings, products, links, forms }),
    [settings, products, links, forms],
  )

  if (items.length === 0) {
    return <SpaceEmptyHero />
  }

  const chunks = chunkByKindAndCategory(items)

  return (
    <div className="flex w-full flex-col gap-12">
      {chunks.map((chunk, idx) => {
        if (chunk.kind === 'product') {
          // Courses get the Apple-TV-style tile (full-width, one per row) with
          // a hover trailer; other products keep the 2-column card grid.
          const isCourse = chunk.category === 'course'
          return (
            <section
              key={`p-${idx}`}
              id={`section-${chunk.category}-${idx}`}
              className="flex scroll-mt-24 flex-col gap-6"
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
                {chunk.items.map((entry) => {
                  const card = isCourse ? (
                    <StorefrontCourseCard product={entry.product} />
                  ) : (
                    <ProductCard
                      product={entry.product}
                      showDetails={showDetails}
                      thumbnailSize={thumbnailSize}
                    />
                  )
                  return preview ? (
                    <div key={entry.id}>{card}</div>
                  ) : (
                    <Link
                      key={entry.id}
                      href={`/${organization.slug}/products/${entry.product.id}`}
                    >
                      {card}
                    </Link>
                  )
                })}
              </div>
            </section>
          )
        }
        if (chunk.kind === 'form') {
          return (
            <div key={`f-${idx}`} className="flex flex-col gap-6">
              {chunk.items.map((entry) => (
                <StorefrontForm
                  key={entry.id}
                  form={entry.form}
                  preview={preview}
                />
              ))}
            </div>
          )
        }
        return (
          <div key={`l-${idx}`}>
            <StorefrontLinks
              links={chunk.items.map((entry) => entry.link)}
              layout={linksLayout}
            />
          </div>
        )
      })}
    </div>
  )
}

// Category bucket used when a product has no category, or one we don't
// have a label for. Keeps it consistent with the legacy renderer.
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

// Walk the resolved list and start a new chunk every time the (kind,
// category) signature changes. Two ebooks in a row → one labelled
// chunk. Ebook, course, ebook → three chunks, the eBooks label
// rendered twice.
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

