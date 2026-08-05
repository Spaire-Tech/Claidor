'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import Pagination from '@/components/Pagination/Pagination'
import { ProductListItem } from '@/components/Products/ProductListItem'
import { useOrganizationCourses } from '@/hooks/queries/courses'
import { useProducts } from '@/hooks/queries/products'
import { useDebouncedCallback } from '@/hooks/utils'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { List } from '@spaire/ui/components/atoms/List'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import { useRouter } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { useCallback, useMemo, useState } from 'react'

type SortValue =
  | 'name'
  | '-name'
  | '-created_at'
  | 'created_at'
  | 'price_amount'
  | '-price_amount'

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const

export default function CoursesPage({
  organization: org,
}: {
  organization: schemas['Organization']
}) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [show, setShow] = useQueryState('show', { defaultValue: 'active' })
  const [sort, setSort] = useState<SortValue>('name')
  const [pageSize, setPageSize] = useState<number>(20)
  const [page, setPage] = useState(1)

  const debouncedQueryChange = useDebouncedCallback(
    (q: string) => setDebouncedQuery(q),
    500,
    [],
  )

  const onQueryChange = useCallback(
    (q: string) => {
      setQuery(q)
      debouncedQueryChange(q)
      setPage(1)
    },
    [debouncedQueryChange],
  )

  const handleCreate = useCallback(() => {
    router.push(`/dashboard/${org.slug}/products/new?type=course`)
  }, [router, org.slug])

  const handleBackToDashboard = useCallback(() => {
    router.push(`/dashboard/${org.slug}`)
  }, [router, org.slug])

  const courses = useOrganizationCourses(org.id)
  const courseProductIds = useMemo(
    () => new Set((courses.data ?? []).map((c) => c.product_id)),
    [courses.data],
  )
  const courseIdByProductId = useMemo(
    () => new Map((courses.data ?? []).map((c) => [c.product_id, c.id])),
    [courses.data],
  )

  const products = useProducts(org.id, {
    query: debouncedQuery || undefined,
    page: 1,
    limit: 100,
    sorting: [sort],
    is_archived: show === 'all' ? null : show === 'active' ? false : true,
  })

  const courseProducts = useMemo(() => {
    return (products.data?.items ?? []).filter((p) =>
      courseProductIds.has(p.id),
    )
  }, [products.data, courseProductIds])

  const totalCount = courseProducts.length
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return courseProducts.slice(start, start + pageSize)
  }, [courseProducts, page, pageSize])

  const isInitialLoading = courses.isLoading || products.isLoading
  const hasAnyCourses = (courses.data?.length ?? 0) > 0
  const showEmptyHero = !courses.isLoading && !hasAnyCourses

  if (showEmptyHero) {
    return (
      <CoursesEmptyHero
        onBack={handleBackToDashboard}
        onStart={handleCreate}
      />
    )
  }

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Input
              className="w-full md:max-w-64"
              preSlot={<Search fontSize="small" />}
              placeholder="Search Courses"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
            <Select value={show} onValueChange={setShow}>
              <SelectTrigger className="w-full md:max-w-fit">
                <SelectValue placeholder="Show archived courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={sort}
              onValueChange={(v) => setSort(v as SortValue)}
            >
              <SelectTrigger className="w-full md:max-w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="-name">Name Z-A</SelectItem>
                <SelectItem value="-created_at">Newest</SelectItem>
                <SelectItem value="created_at">Oldest</SelectItem>
                <SelectItem value="price_amount">
                  Price: Low to High
                </SelectItem>
                <SelectItem value="-price_amount">
                  Price: High to Low
                </SelectItem>
              </SelectContent>
            </Select>
            {totalCount > 20 && (
              <Select
                value={pageSize.toString()}
                onValueChange={(v) => {
                  setPageSize(parseInt(v))
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-full md:max-w-fit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      Show {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button
            wrapperClassNames="md:w-fit"
            className="w-full md:w-fit"
            onClick={handleCreate}
          >
            <span>New</span>
          </Button>
        </div>

        {isInitialLoading ? (
          <List size="small">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl bg-gray-100"
              />
            ))}
          </List>
        ) : pagedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <p className="text-sm font-medium text-gray-900">
              No courses match your filters
            </p>
            <p className="text-xs text-gray-500">
              Try a different search or clear the filter.
            </p>
          </div>
        ) : (
          <Pagination
            currentPage={page}
            pageSize={pageSize}
            totalCount={totalCount}
            currentURL={new URLSearchParams()}
            onPageChange={setPage}
          >
            <List size="small">
              {pagedItems
                .sort((a, b) => {
                  if (a.is_archived === b.is_archived) return 0
                  return a.is_archived ? 1 : -1
                })
                .map((product) => (
                  <ProductListItem
                    key={product.id}
                    organization={org}
                    product={product}
                    courseId={courseIdByProductId.get(product.id)}
                  />
                ))}
            </List>
          </Pagination>
        )}
      </div>
    </DashboardBody>
  )
}

const FONT_VAR = 'var(--font-body, "Poppins", system-ui, sans-serif)'
const HEADING_VAR = `var(--font-heading, ${FONT_VAR})`

function CoursesEmptyHero({
  onBack,
  onStart,
}: {
  onBack: () => void
  onStart: () => void
}) {
  return (
    <>
      <style>{`
        [data-dashboard-sidebar],
        [data-dashboard-mobile-nav],
        [data-catalog-tabs] { display: none !important; }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 60,
          background: 'oklch(0.985 0.001 280)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '20px',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to dashboard"
          style={{
            position: 'absolute',
            left: 24,
            top: 20,
            zIndex: 5,
            width: 40,
            height: 40,
            borderRadius: 999,
            background: 'white',
            border: '1px solid oklch(0.92 0.003 280)',
            color: 'oklch(0.14 0.006 280)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            fontFamily: 'inherit',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <ArrowBackOutlined sx={{ fontSize: 20 }} />
        </button>

      <div
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <section
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: 1280,
            height: 'min(90vh, 820px)',
            minHeight: 600,
            borderRadius: 'calc(28px * var(--radius-mul, 1))',
            overflow: 'hidden',
            background: '#000',
            isolation: 'isolate',
            border: '1px solid oklch(0.92 0.003 280)',
            boxShadow:
              '0 2px 6px rgba(0,0,0,0.06), 0 24px 60px rgba(0,0,0,0.10)',
          }}
        >
          <img
            src="/assets/courses-empty-hero.jpg"
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />

          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 2,
              pointerEvents: 'none',
              background:
                'linear-gradient(180deg, oklch(0 0 0 / 0.2) 0%, oklch(0 0 0 / 0) 30%, oklch(0 0 0 / 0) 45%, oklch(0 0 0 / 0.6) 80%, oklch(0 0 0 / 0.92) 100%)',
            }}
          />

          <div
            style={{
              position: 'absolute',
              left: 32,
              top: 28,
              zIndex: 3,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'oklch(0.72 0.16 25)',
                boxShadow: '0 0 12px oklch(0.72 0.16 25)',
              }}
            />
            <span
              style={{
                fontSize: 11,
                letterSpacing: '0.18em',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.85)',
                fontFamily: FONT_VAR,
              }}
            >
              SPAIRE ORIGINAL
            </span>
          </div>

          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 3,
              padding: '40px 48px 52px',
              color: 'white',
              fontFamily: FONT_VAR,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
                fontSize: 12,
                color: 'rgba(255,255,255,0.65)',
                fontWeight: 500,
              }}
            >
              <span
                style={{
                  padding: '3px 10px',
                  background: 'rgba(255,255,255,0.12)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.18)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                  color: 'white',
                }}
              >
                COURSE BUILDER
              </span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                Built with Spaire
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                2 min setup
              </span>
            </div>

            <h1
              style={{
                fontSize:
                  'calc(clamp(48px, 6.5vw, 84px) * var(--type-scale, 1))',
                fontWeight: 'var(--h-weight, 700)',
                fontStyle: 'var(--h-italic, normal)',
                letterSpacing: 'calc(var(--h-tracking, 0em) - 0.045em)',
                lineHeight: 'calc(var(--h-leading, 1) * 0.95)',
                margin: '0 0 18px',
                color: 'white',
                maxWidth: '14ch',
                textShadow: '0 2px 30px oklch(0 0 0 / 0.35)',
                fontFamily: HEADING_VAR,
              }}
            >
              Launch your own Masterclass
            </h1>

            <div
              style={{
                fontSize: 'clamp(14px, 1.3vw, 18px)',
                fontWeight: 400,
                color: 'rgba(255,255,255,0.88)',
                maxWidth: 640,
                marginBottom: 30,
                lineHeight: 1.5,
              }}
            >
              Spaire gives creators the tools to package their knowledge into
              beautiful, high-value courses. Design immersive learning
              experiences, grow your audience, and monetize your expertise.
            </div>

            <button
              type="button"
              onClick={onStart}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '13px 22px',
                background: 'white',
                color: 'oklch(0.14 0.006 280)',
                borderRadius: 999,
                boxShadow: '0 8px 28px oklch(0 0 0 / 0.4)',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              Get Started →
            </button>
          </div>
        </section>
      </div>
      </div>
    </>
  )
}
