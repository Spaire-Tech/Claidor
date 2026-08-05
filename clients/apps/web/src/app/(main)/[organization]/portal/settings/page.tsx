import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationOrNotFound } from '@/utils/customerPortal'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import BillingPage from './BillingPage'

const cacheConfig = {
  cache: 'no-store' as RequestCache,
  next: {
    tags: ['customer_portal'],
  },
}

export async function generateMetadata(props: {
  params: Promise<{ organization: string }>
}): Promise<Metadata> {
  const params = await props.params
  const api = await getServerSideAPI()
  const { organization } = await getOrganizationOrNotFound(
    api,
    params.organization,
  )

  return {
    title: `Student Portal | ${organization.name}`, // " | Polar is added by the template"
    openGraph: {
      title: `Student Portal | ${organization.name} on Spaire`,
      description: `Student Portal | ${organization.name} on Spaire`,
      siteName: 'Spaire',
      type: 'website',
      images: [
        {
          url: `https://spairehq.com/og?org=${organization.slug}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      images: [
        {
          url: `https://spairehq.com/og?org=${organization.slug}`,
          width: 1200,
          height: 630,
          alt: `${organization.name}'s masterclasses on Spaire`,
        },
      ],
      card: 'summary_large_image',
      title: `Student Portal | ${organization.name} on Spaire`,
      description: `Student Portal | ${organization.name} on Spaire`,
    },
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
  searchParams: Promise<{
    customer_session_token?: string
    member_session_token?: string
    setup_intent_client_secret?: string
    setup_intent?: string
  }>
}) {
  const {
    customer_session_token,
    member_session_token,
    setup_intent_client_secret,
    setup_intent,
    ...searchParams
  } = await props.searchParams
  const params = await props.params
  const token = customer_session_token ?? member_session_token
  const setupIntentParams =
    setup_intent_client_secret && setup_intent
      ? { setup_intent_client_secret, setup_intent }
      : undefined
  const api = await getServerSideAPI(token)
  const { organization } = await getOrganizationOrNotFound(
    api,
    params.organization,
    searchParams,
  )

  if (!token) {
    redirect(`/${organization.slug}/portal/request`)
  }

  const [
    {
      data: subscriptions,
      error: subscriptionsError,
      response: subscriptionsResponse,
    },
    { data: orders, error: ordersError, response: ordersResponse },
    { data: customer, response: customerResponse },
  ] = await Promise.all([
    api.GET('/v1/customer-portal/subscriptions/', {
      params: { query: { limit: 100 } },
      ...cacheConfig,
    }),
    api.GET('/v1/customer-portal/orders/', {
      params: { query: { limit: 100 } },
      ...cacheConfig,
    }),
    api.GET('/v1/customer-portal/customers/me', cacheConfig),
  ])

  if (
    subscriptionsResponse.status === 401 ||
    ordersResponse.status === 401 ||
    customerResponse.status === 401
  ) {
    redirect(
      `/${organization.slug}/portal/request?${new URLSearchParams(searchParams)}`,
    )
  }

  if (subscriptionsResponse.status === 403 || ordersResponse.status === 403) {
    // Member without billing access shouldn't see settings.
    redirect(`/${organization.slug}/portal/overview`)
  }

  if (subscriptionsError) throw subscriptionsError
  if (ordersError) throw ordersError

  return (
    <BillingPage
      organization={organization}
      customerSessionToken={token}
      customer={customer ?? null}
      subscriptions={subscriptions?.items ?? []}
      orders={orders?.items ?? []}
      setupIntentParams={setupIntentParams}
    />
  )
}
