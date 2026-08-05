'use client'

// Public product page wrapper — for course products, fetches the public
// course landing data and renders the portal-style view (PublicPortalView):
// the same streaming-service surface students get, with the hero variant,
// lesson-card variant and trial gating the creator picked during onboarding.
// The old AI-generated sales landing is gone. For non-course products this
// falls back to the regular ProductDetailPage.

import { PublicPortalView } from '@/components/Courses/PublicPortalView'
import type { CourseLandingPageData } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useEffect, useState } from 'react'
import { ProductDetailPage } from './ProductDetailPage'

export function ProductLandingPage({
  organization,
  product,
  otherProducts,
}: {
  organization: schemas['Organization']
  product: schemas['ProductStorefront']
  otherProducts: schemas['ProductStorefront'][]
}) {
  const [landing, setLanding] = useState<CourseLandingPageData | null>(null)
  const [resolved, setResolved] = useState(false)
  // Distinguish "no course for this product" (404 → fall back to the
  // generic product page) from "the API is unhappy" (5xx / network →
  // surface a real error so the customer doesn't silently get the
  // wrong UI and click Buy without seeing the course page).
  const [serverError, setServerError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setServerError(false)
    fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/customer-portal/courses/by-product/${product.id}/landing`,
      { credentials: 'include', cache: 'no-store' },
    )
      .then(async (r) => {
        if (cancelled) return null
        if (r.status === 404 || r.status === 403) return null
        if (!r.ok) {
          setServerError(true)
          return null
        }
        return (await r.json()) as CourseLandingPageData
      })
      .then((data) => {
        if (cancelled) return
        setLanding(data)
        setResolved(true)
      })
      .catch(() => {
        if (cancelled) return
        setServerError(true)
        setResolved(true)
      })
    return () => {
      cancelled = true
    }
  }, [product.id])

  if (!resolved) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-32 animate-pulse rounded-full bg-gray-100" />
      </div>
    )
  }

  if (serverError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-base font-medium text-gray-900">
          Couldn't load this page right now
        </p>
        <p className="max-w-sm text-sm text-gray-500">
          Please refresh the page in a moment. If the problem persists,
          contact support.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Try again
        </button>
      </div>
    )
  }

  if (landing) {
    return (
      <PublicPortalView
        organization={organization}
        product={product}
        landing={landing}
      />
    )
  }

  return (
    <ProductDetailPage
      organization={organization}
      product={product}
      otherProducts={otherProducts}
    />
  )
}
