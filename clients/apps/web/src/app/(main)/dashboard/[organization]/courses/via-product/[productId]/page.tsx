import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { getServerSideAPI } from '@/utils/client/serverside'
import { redirect, notFound } from 'next/navigation'

export default async function Page(props: {
  params: Promise<{ organization: string; productId: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(api, params.organization)

  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/v1/courses/product/${params.productId}`,
      { cache: 'no-store' },
    )
    if (!res.ok) {
      redirect(`/dashboard/${organization.slug}/courses`)
    }
    const course = await res.json()
    redirect(`/dashboard/${organization.slug}/courses/${course.id}`)
  } catch {
    redirect(`/dashboard/${organization.slug}/courses`)
  }
}
