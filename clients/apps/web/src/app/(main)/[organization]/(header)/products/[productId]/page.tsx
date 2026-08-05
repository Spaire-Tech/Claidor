import { resolveSpaceItems } from '@/components/Profile/spaceItems'
import { StorefrontLinkItem } from '@/components/Profile/StorefrontLinks'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getStorefrontOrNotFound } from '@/utils/storefront'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ProductLandingPage } from './ProductLandingPage'

export async function generateMetadata(props: {
  params: Promise<{ organization: string; productId: string }>
}): Promise<Metadata> {
  const params = await props.params
  const api = await getServerSideAPI()
  const { organization, products } = await getStorefrontOrNotFound(
    api,
    params.organization,
  )
  const product = products.find((p) => p.id === params.productId)

  if (!product) {
    notFound()
  }

  return {
    title: `${product.name} by ${organization.name}`,
    openGraph: {
      title: `${product.name}`,
      description: product.description || `A product from ${organization.name}`,
      siteName: 'Spaire',
      type: 'website',
      images: [
        {
          url:
            product.medias[0]?.public_url ??
            `https://spairehq.com/og?org=${organization.slug}`,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      images: [
        {
          url:
            product.medias[0]?.public_url ??
            `https://spairehq.com/og?org=${organization.slug}`,
          width: 1200,
          height: 630,
          alt: `${product.name}`,
        },
      ],
      card: 'summary_large_image',
      title: `${product.name}`,
      description: product.description || `A product from ${organization.name}`,
    },
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string; productId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const { organization, products } = await getStorefrontOrNotFound(
    api,
    params.organization,
  )
  const product = products.find((p) => p.id === params.productId)

  if (!product) {
    notFound()
  }

  // "More from <org>" must respect the Space curation — only show
  // products the creator has put on their Space, in the order they
  // chose. The shared resolver handles both the new `space_items`
  // model and the legacy `featured_product_ids`/`featured_mode`
  // fallback, so we get the same list (and same order) the Space
  // landing page renders, without re-implementing the precedence
  // rules here.
  const settings = organization.storefront_settings
  const resolved = resolveSpaceItems({
    settings,
    products,
    links: (settings?.storefront_links ?? []) as StorefrontLinkItem[],
  })
  const otherProducts = resolved
    .filter((entry) => entry.kind === 'product' && entry.id !== product.id)
    .map((entry) => (entry as Extract<typeof entry, { kind: 'product' }>).product)

  return (
    <ProductLandingPage
      organization={organization}
      product={product}
      otherProducts={otherProducts}
    />
  )
}
