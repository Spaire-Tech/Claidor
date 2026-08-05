import {
  Column,
  Heading,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components'

// Visual block shared by every community-event transactional email.
// Renders the event's cover image (when present), title, formatted
// date/time in the host's timezone, location/meeting line, and host.
//
// Kept presentational — no CTAs here so the parent template can place
// the primary action (RSVP, Join live, Open recording, etc.) wherever
// makes sense for that template's narrative.

export interface EventCardData {
  title: string
  type: string
  start_at: string // canonical UTC ISO
  timezone: string // IANA, e.g. "America/Los_Angeles"
  duration_minutes: number
  host_name: string
  host_avatar_url?: string | null
  cover_url?: string | null
  cover_object_position?: string | null
  location?: string | null
  meeting_url?: string | null
}

const TYPE_LABEL: Record<string, string> = {
  workshop: 'Workshop',
  office: 'Q&A',
  cohort: 'Watch Party',
  guest: 'Guest',
}

const formatDate = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date(iso))

const formatTime = (iso: string, tz: string): string =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))

export function EventCard({ event }: { event: EventCardData }) {
  const typeLabel = TYPE_LABEL[event.type] ?? event.type
  const date = formatDate(event.start_at, event.timezone || 'UTC')
  const time = formatTime(event.start_at, event.timezone || 'UTC')
  const locationLine = event.meeting_url
    ? 'Online'
    : event.location || 'Location to be announced'

  return (
    <Section
      className="my-4 overflow-hidden rounded-xl border border-gray-200"
      // Inline style so Outlook/iOS Mail render the rounded card —
      // a handful of clients still strip Tailwind border-radius from
      // <Section> wrappers.
      style={{ borderRadius: 12 }}
    >
      {event.cover_url ? (
        <Img
          src={event.cover_url}
          alt={event.title}
          width="600"
          height="220"
          // Object-position carried over from the host's crop so the
          // important part of the cover stays in frame after the email
          // crops/scales the image.
          style={{
            width: '100%',
            height: 220,
            objectFit: 'cover',
            objectPosition: event.cover_object_position || '50% 50%',
            display: 'block',
          }}
        />
      ) : null}

      <Section className="px-5 py-5">
        <Text className="m-0 mb-1 text-xs font-medium tracking-wide text-gray-500 uppercase">
          {typeLabel}
        </Text>
        <Heading
          as="h2"
          className="m-0 mb-3 text-xl font-bold text-gray-900"
          style={{ lineHeight: '1.3' }}
        >
          {event.title}
        </Heading>

        <Row className="mt-3">
          <Column className="w-6 align-top">
            <Text className="m-0 text-gray-400">📅</Text>
          </Column>
          <Column>
            <Text className="m-0 text-sm font-medium text-gray-900">
              {date}
            </Text>
            <Text className="m-0 text-sm text-gray-500">
              {time} · {event.duration_minutes} min
            </Text>
          </Column>
        </Row>

        <Row className="mt-3">
          <Column className="w-6 align-top">
            <Text className="m-0 text-gray-400">📍</Text>
          </Column>
          <Column>
            <Text className="m-0 text-sm font-medium text-gray-900">
              {locationLine}
            </Text>
            {event.meeting_url ? (
              <Text className="m-0 text-sm">
                <Link
                  href={event.meeting_url}
                  className="text-blue-600 underline"
                >
                  {event.meeting_url}
                </Link>
              </Text>
            ) : null}
          </Column>
        </Row>

        <Hr className="my-4 border-gray-200" />

        <Row>
          {event.host_avatar_url ? (
            <Column className="w-12 align-middle">
              <Img
                src={event.host_avatar_url}
                alt={event.host_name}
                width="36"
                height="36"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  display: 'block',
                }}
              />
            </Column>
          ) : null}
          <Column>
            <Text className="m-0 text-xs text-gray-500">Hosted by</Text>
            <Text className="m-0 text-sm font-medium text-gray-900">
              {event.host_name}
            </Text>
          </Column>
        </Row>
      </Section>
    </Section>
  )
}

export default EventCard
