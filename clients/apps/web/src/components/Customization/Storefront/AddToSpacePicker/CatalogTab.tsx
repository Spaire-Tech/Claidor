'use client'

import { useProducts } from '@/hooks/queries'
import { useOrganizationCourses } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useEffect, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'

type Product = schemas['Product']

const formatPrice = (product: Product): string => {
  const first = product.prices?.[0]
  if (!first) return ''
  if ('price_amount' in first && typeof first.price_amount === 'number') {
    return `$${(first.price_amount / 100).toFixed(2)}`
  }
  return ''
}

export const CatalogTab = ({
  organization,
  alreadySelectedIds = [],
  onSubmit,
  onCreateNew,
}: {
  organization: schemas['Organization']
  alreadySelectedIds?: string[]
  // (addIds, removeIds) — diff vs alreadySelectedIds. Empty arrays
  // mean "no change in this dimension".
  onSubmit: (addIds: string[], removeIds: string[]) => void
  onCreateNew: () => void
}) => {
  const { data, isLoading } = useProducts(organization.id, {
    is_archived: false,
    limit: 100,
  })
  const { data: courses } = useOrganizationCourses(organization.id)

  const products = useMemo(() => {
    const courseProductIds = new Set((courses ?? []).map((c) => c.product_id))
    const all = data?.items ?? []
    return all.filter(
      (p) => !courseProductIds.has(p.id) && p.category !== 'course',
    )
  }, [data, courses])

  // Seed selection with whatever the creator already has on their Space
  // — but only IDs that belong to *this* tab's universe (catalog
  // products, not courses). Otherwise toggling visible items would
  // appear to re-feature hidden course items.
  const visibleIds = useMemo(() => new Set(products.map((p) => p.id)), [products])
  const [seeded, setSeeded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    // Wait until products load, then seed once.
    if (seeded || products.length === 0) return
    setSelected(new Set(alreadySelectedIds.filter((id) => visibleIds.has(id))))
    setSeeded(true)
  }, [seeded, products.length, alreadySelectedIds, visibleIds])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const initial = useMemo(
    () => new Set(alreadySelectedIds.filter((id) => visibleIds.has(id))),
    [alreadySelectedIds, visibleIds],
  )
  const addIds = useMemo(
    () => Array.from(selected).filter((id) => !initial.has(id)),
    [selected, initial],
  )
  const removeIds = useMemo(
    () => Array.from(initial).filter((id) => !selected.has(id)),
    [selected, initial],
  )
  const dirty = addIds.length > 0 || removeIds.length > 0

  const submit = () => {
    if (!dirty) return
    onSubmit(addIds, removeIds)
  }

  return (
    <div className="wg-tab">
      <p className="wg-help">
        Pick from your catalog or start a new one.
        {selected.size > 0 && (
          <>
            {' '}
            <b>· {selected.size} selected</b>
          </>
        )}
      </p>

      {isLoading ? (
        <div className="wg-grid three">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="wg-skeleton" />
          ))}
        </div>
      ) : (
        <div className="wg-grid three">
          <button type="button" className="wg-tile create" onClick={onCreateNew}>
            <div className="wg-tile-art empty">+</div>
            <div className="wg-tile-meta">
              <div className="wg-tile-title">New product</div>
            </div>
          </button>

          {products.map((product) => {
            const isSelected = selected.has(product.id)
            const cover = product.medias?.[0]?.public_url
            const price = formatPrice(product)
            return (
              <button
                key={product.id}
                type="button"
                onClick={() => toggle(product.id)}
                aria-pressed={isSelected}
                className={twMerge('wg-tile', isSelected && 'selected')}
              >
                <div
                  className="wg-tile-art"
                  style={{
                    backgroundImage: cover
                      ? `url(${cover})`
                      : 'linear-gradient(135deg, #cdd, #abb)',
                  }}
                >
                  {!cover && (product.name?.[0]?.toUpperCase() ?? '·')}
                </div>
                <div className="wg-tile-meta">
                  <div className="wg-tile-title">{product.name}</div>
                  {price && <div className="wg-tile-sub">{price}</div>}
                </div>
                <span className="wg-tile-check" aria-hidden>
                  {isSelected ? '✓' : '+'}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {dirty && (
        <div className="wg-footer">
          <button type="button" className="wg-cta" onClick={submit}>
            {removeIds.length > 0 && addIds.length === 0
              ? `Remove ${removeIds.length}`
              : addIds.length > 0 && removeIds.length === 0
                ? `Add ${addIds.length} to Space`
                : `Save (${addIds.length} added, ${removeIds.length} removed)`}
          </button>
        </div>
      )}
    </div>
  )
}
