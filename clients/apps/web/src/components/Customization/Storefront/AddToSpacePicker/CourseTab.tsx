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

export const CourseTab = ({
  organization,
  alreadySelectedIds = [],
  onSubmit,
  onCreateNew,
}: {
  organization: schemas['Organization']
  alreadySelectedIds?: string[]
  onSubmit: (addIds: string[], removeIds: string[]) => void
  onCreateNew: () => void
}) => {
  const { data: courses, isLoading } = useOrganizationCourses(organization.id)
  const { data: productsData } = useProducts(organization.id, {
    is_archived: false,
    limit: 100,
  })

  const productById = useMemo(() => {
    const map = new Map<string, Product>()
    for (const p of productsData?.items ?? []) map.set(p.id, p)
    return map
  }, [productsData])

  // Scope already-selected to product IDs that map to a course in this
  // tab — otherwise non-course featured items would be invisibly held
  // in the diff when the creator de-selects nothing.
  const visibleIds = useMemo(
    () => new Set((courses ?? []).map((c) => c.product_id)),
    [courses],
  )
  const [seeded, setSeeded] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (seeded || !courses || courses.length === 0) return
    setSelected(new Set(alreadySelectedIds.filter((id) => visibleIds.has(id))))
    setSeeded(true)
  }, [seeded, courses, alreadySelectedIds, visibleIds])

  const toggle = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(productId)) next.delete(productId)
      else next.add(productId)
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
        Pick from your courses or start a new one.
        {selected.size > 0 && (
          <>
            {' '}
            <b>· {selected.size} selected</b>
          </>
        )}
      </p>

      {isLoading ? (
        <div className="wg-grid three">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="wg-skeleton" />
          ))}
        </div>
      ) : (
        <div className="wg-grid three">
          <button type="button" className="wg-tile create" onClick={onCreateNew}>
            <div className="wg-tile-art empty">+</div>
            <div className="wg-tile-meta">
              <div className="wg-tile-title">New course</div>
            </div>
          </button>

          {(courses ?? []).map((course) => {
            const product = productById.get(course.product_id)
            const isSelected = selected.has(course.product_id)
            const cover =
              course.thumbnail_url ?? product?.medias?.[0]?.public_url ?? null
            const title = course.title || product?.name || 'Untitled course'
            const lessonCount = course.modules?.reduce(
              (acc, m) => acc + (m.lessons?.length ?? 0),
              0,
            )
            const sub =
              lessonCount && lessonCount > 0
                ? `${lessonCount} lesson${lessonCount === 1 ? '' : 's'}${product ? ' · ' + formatPrice(product) : ''}`
                : product
                  ? formatPrice(product)
                  : ''
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => toggle(course.product_id)}
                aria-pressed={isSelected}
                className={twMerge('wg-tile', isSelected && 'selected')}
              >
                <div
                  className="wg-tile-art"
                  style={{
                    backgroundImage: cover
                      ? `url(${cover})`
                      : 'linear-gradient(135deg, #5c4e7a, #2c2240)',
                  }}
                >
                  {!cover && (title[0]?.toUpperCase() ?? '·')}
                </div>
                <div className="wg-tile-meta">
                  <div className="wg-tile-title">{title}</div>
                  {sub && <div className="wg-tile-sub">{sub}</div>}
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
