'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import Pagination from '@/components/Pagination/Pagination'
import { ProductListItem } from '@/components/Products/ProductListItem'
import { useOrganizationCourses } from '@/hooks/queries/courses'
import { useProducts } from '@/hooks/queries/products'
import { useDebouncedCallback } from '@/hooks/utils'
import {
  DataTablePaginationState,
  DataTableSortingState,
  serializeSearchParams,
  sortingStateToQueryParam,
} from '@/utils/datatable'
import AddOutlined from '@mui/icons-material/AddOutlined'
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
import { usePathname, useRouter } from 'next/navigation'
import { useQueryState } from 'nuqs'
import { useCallback, useState } from 'react'

export default function ClientPage({
  organization: org,
  pagination,
  sorting,
  query: _query,
}: {
  organization: schemas['Organization']
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
  query: string | undefined
}) {
  const [query, setQuery] = useState(_query)

  const [show, setShow] = useQueryState('show', {
    defaultValue: 'active',
  })

  const router = useRouter()
  const pathname = usePathname()

  const handleCreateProduct = useCallback(() => {
    router.push(`/dashboard/${org.slug}/products/new`)
  }, [router, org.slug])

  const handleCreateDigitalProduct = useCallback(() => {
    router.push(`/dashboard/${org.slug}/products/new?type=digital`)
  }, [router, org.slug])

  const handleBackToDashboard = useCallback(() => {
    router.push(`/dashboard/${org.slug}`)
  }, [router, org.slug])

  const onPageChange = useCallback(
    (page: number) => {
      const searchParams = serializeSearchParams(pagination, sorting)
      searchParams.set('page', page.toString())
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, sorting, pathname, query],
  )

  const onLimitChange = useCallback(
    (limit: string) => {
      const searchParams = serializeSearchParams(
        { ...pagination, pageSize: parseInt(limit), pageIndex: 0 },
        sorting,
      )
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, sorting, pathname, query],
  )

  const onSortingChange = useCallback(
    (value: string) => {
      const desc = value.startsWith('-')
      const id = desc ? value.slice(1) : value
      const newSorting: DataTableSortingState = [{ id, desc }]
      const searchParams = serializeSearchParams(
        { ...pagination, pageIndex: 0 },
        newSorting,
      )
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    [pagination, router, pathname, query],
  )

  const currentSortingValue =
    sorting.length > 0
      ? `${sorting[0].desc ? '-' : ''}${sorting[0].id}`
      : 'name'

  const debouncedQueryChange = useDebouncedCallback(
    (query: string) => {
      const searchParams = serializeSearchParams(pagination, sorting)
      if (query) {
        searchParams.set('query', query)
      } else {
        searchParams.delete('query')
      }
      router.replace(`${pathname}?${searchParams}`)
    },
    500,
    [pagination, sorting, query, router, pathname],
  )

  const onQueryChange = useCallback(
    (query: string) => {
      setQuery(query)
      debouncedQueryChange(query)
    },
    [debouncedQueryChange],
  )

  const products = useProducts(org.id, {
    query,
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    sorting: sortingStateToQueryParam(sorting),
    is_archived: show === 'all' ? null : show === 'active' ? false : true,
  })

  const courses = useOrganizationCourses(org.id)
  const courseIdByProductId = new Map(
    (courses.data ?? []).map((c) => [c.product_id, c.id] as const),
  )

  const nonCourseItems = (products.data?.items ?? []).filter(
    (product) => !courseIdByProductId.has(product.id),
  )

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        {products.data && nonCourseItems.length > 0 ? (
          <>
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <Input
                  className="w-full md:max-w-64"
                  preSlot={<Search fontSize="small" />}
                  placeholder="Search Products"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                />
                <Select value={show} onValueChange={setShow}>
                  <SelectTrigger className="w-full md:max-w-fit">
                    <SelectValue placeholder="Show archived products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={currentSortingValue}
                  onValueChange={onSortingChange}
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
                {(products.data?.pagination.total_count ?? 0) > 20 && (
                  <Select
                    value={pagination.pageSize.toString()}
                    onValueChange={onLimitChange}
                  >
                    <SelectTrigger className="w-full md:max-w-fit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="20">Show 20</SelectItem>
                      <SelectItem value="50">Show 50</SelectItem>
                      <SelectItem value="100">Show 100</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                wrapperClassNames="gap-x-2 md:w-fit"
                className="w-full md:w-fit"
                onClick={handleCreateProduct}
              >
                <AddOutlined className="h-4 w-4" />
                <span>New</span>
              </Button>
            </div>
            <Pagination
              currentPage={pagination.pageIndex + 1}
              pageSize={pagination.pageSize}
              totalCount={products.data?.pagination.total_count || 0}
              currentURL={serializeSearchParams(pagination, sorting)}
              onPageChange={onPageChange}
            >
              <List size="small">
                {nonCourseItems
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
          </>
        ) : (
          <ProductsEmptyHero
            onBack={handleBackToDashboard}
            onStart={handleCreateDigitalProduct}
          />
        )}
      </div>
    </DashboardBody>
  )
}

const FONT_VAR = 'var(--font-body, "Poppins", system-ui, sans-serif)'
const HEADING_VAR = `var(--font-heading, ${FONT_VAR})`

function ProductsEmptyHero({
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
            src="/assets/products-empty-hero.jpg"
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
                MERCHANT OF RECORD
              </span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                Built with Spaire
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                180+ countries
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
              Sell anything digital
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
              From templates and ebooks to software and downloads, Spaire helps
              you sell globally with built-in delivery, secure checkout, and
              merchant of record handling taxes, compliance, and payments for
              you.
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
              Create a product →
            </button>
          </div>
        </section>
      </div>
      </div>
    </>
  )
}
