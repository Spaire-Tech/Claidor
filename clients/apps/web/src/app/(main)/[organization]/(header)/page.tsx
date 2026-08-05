import { FormPublic } from '@/hooks/queries/forms'
import { getServerSideAPI } from '@/utils/client/serverside'
import { storefrontLink } from '@/utils/nav'
import { getStorefrontOrNotFound } from '@/utils/storefront'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import AppPage from './AppPage'

export async function generateMetadata(props: {
  params: Promise<{ organization: string }>
}): Promise<Metadata> {
  const params = await props.params
  const api = await getServerSideAPI()
  const { organization } = await getStorefrontOrNotFound(
    api,
    params.organization,
  )

  const settings = organization.storefront_settings

  // Creator-controlled SEO (Settings → Search & sharing), with sensible
  // fallbacks to the existing name / description / cover image.
  const title = settings?.meta_title ?? `${organization.name} — Courses`
  const description =
    settings?.meta_description ??
    settings?.description ??
    `${organization.name}'s courses on Spaire`
  const ogImage =
    settings?.header_image_url ??
    organization.avatar_url ??
    `https://spairehq.com/og?org=${organization.slug}`
  const canonicalUrl = storefrontLink(organization)
  // `index` defaults to true; only emit a robots directive when the creator
  // has explicitly turned indexing off.
  const indexable = settings?.index ?? true

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    robots: indexable ? undefined : { index: false, follow: false },
    openGraph: {
      title,
      description,
      siteName: 'Spaire',
      type: 'website',
      url: canonicalUrl,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
        },
      ],
    },
    twitter: {
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const storefront = await getStorefrontOrNotFound(api, params.organization)
  const { organization, products } = storefront
  const forms = ((storefront as { forms?: FormPublic[] }).forms ??
    []) as FormPublic[]

  // Course-only ("MasterClass builder") reposition: the bare creator page no
  // longer renders the multi-product storefront — it forwards straight to the
  // creator's course landing (/{slug}/products/{courseId}, which renders the
  // cinematic PublicPortalView). Orgs with no course yet (mid-onboarding) or
  // legacy digital-only orgs fall through to the storefront so nothing breaks.
  // This is a temporary (307) redirect for now to stay reversible while the
  // reposition settles; switch to permanentRedirect() for the SEO-permanent 308
  // once the structure is final. Reversible: delete this block to restore grid.
  const courseProduct = products.find(
    (product) => product.category === 'course',
  )
  if (courseProduct) {
    redirect(`/${organization.slug}/products/${courseProduct.id}`)
  }

  return (
    <AppPage organization={organization} products={products} forms={forms} />
  )
}
