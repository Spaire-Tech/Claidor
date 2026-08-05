import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PublicEventPage } from './PublicEventPage'

// The backend `CommunityEventPublic` schema — kept hand-typed here so
// we don't depend on regenerating the OpenAPI client before the route
// works. Drift between this and the server schema is caught at runtime
// (next 404s for malformed responses) — there's no production data
// that could subtly mis-render.
export type PublicEventData = {
  id: string
  organization_slug: string
  course_id: string
  course_name: string
  title: string
  type: 'workshop' | 'office' | 'cohort' | 'guest'
  description: string | null
  start_at: string
  timezone: string
  duration_minutes: number
  location: string | null
  meeting_url: string | null
  cover_url: string | null
  cover_object_position: string | null
  host: {
    user_id: string
    name: string
    avatar_url: string | null
  }
  live: boolean
  past: boolean
}

// Server-side fetch — POLAR_API_URL is set inside the docker net for
// the Vercel runtime to reach the backend; falls back to the public
// URL when running locally without the container.
const getBaseURL = () =>
  process.env.POLAR_API_URL || process.env.NEXT_PUBLIC_API_URL

const fetchEvent = async (eventId: string): Promise<PublicEventData | null> => {
  const base = getBaseURL()
  if (!base) return null
  const res = await fetch(`${base}/v1/community/public/events/${eventId}`, {
    // Short revalidate so a host who repositions the cover / edits the
    // event sees it on the public URL within ~10s instead of waiting
    // out a long cache. Still absorbs share-link bursts.
    next: { revalidate: 10, tags: [`event:${eventId}`] },
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  return (await res.json()) as PublicEventData
}

export async function generateMetadata(props: {
  params: Promise<{ organization: string; eventId: string }>
}): Promise<Metadata> {
  const params = await props.params
  const event = await fetchEvent(params.eventId)
  if (!event) return {}

  // Description is shown in unfurls + SEO. Truncate to ~160 chars
  // since some platforms (LinkedIn, Slack) cut off harder than others.
  const desc =
    (event.description || '').trim().slice(0, 160) ||
    `Live event hosted by ${event.host.name}`

  const title = `${event.title} · ${event.course_name}`
  return {
    title,
    description: desc,
    openGraph: {
      title,
      description: desc,
      siteName: 'Spaire',
      type: 'website',
      images: event.cover_url
        ? [{ url: event.cover_url, width: 1200, height: 630 }]
        : undefined,
    },
    twitter: {
      card: event.cover_url ? 'summary_large_image' : 'summary',
      title,
      description: desc,
      images: event.cover_url ? [{ url: event.cover_url }] : undefined,
    },
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string; eventId: string }>
}) {
  const params = await props.params
  const event = await fetchEvent(params.eventId)
  if (!event) notFound()

  // Cross-check the slug in the URL matches the event's actual org —
  // someone shared `/wrongorg/events/<id>` would still resolve the
  // event but render under a foreign org's chrome, which is misleading.
  if (event.organization_slug !== params.organization) notFound()

  return (
    <PublicEventPage event={event} organizationSlug={params.organization} />
  )
}
