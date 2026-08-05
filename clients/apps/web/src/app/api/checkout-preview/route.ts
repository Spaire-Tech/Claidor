import { getServerSideAPI } from '@/utils/client/serverside'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const { product_id } = await request.json()

  if (!product_id) {
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  }

  const api = await getServerSideAPI()

  // Try the public client endpoint first
  const clientResult = await api.POST('/v1/checkouts/client/', {
    body: { product_id },
  })

  if (!clientResult.error) {
    return NextResponse.json({ client_secret: clientResult.data.client_secret })
  }

  // Fall back to the authenticated endpoint using products array
  const authResult = await api.POST('/v1/checkouts/', {
    body: {
      products: [product_id],
      allow_discount_codes: true,
      require_billing_address: false,
      allow_trial: true,
      is_business_customer: false,
    },
  })

  if (!authResult.error) {
    return NextResponse.json({ client_secret: authResult.data.client_secret })
  }

  // Return the first error with its full detail for debugging
  const errorDetail = clientResult.error.detail
  return NextResponse.json(
    {
      error:
        typeof errorDetail === 'string'
          ? errorDetail
          : Array.isArray(errorDetail)
            ? (errorDetail[0] as { msg?: string })?.msg ?? 'Validation error'
            : 'Failed to create checkout preview',
    },
    { status: 422 },
  )
}
