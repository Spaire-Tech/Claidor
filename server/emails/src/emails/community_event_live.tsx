import { Heading, Preview, Section, Text } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import EventCard from '../components/EventCard'
import WrapperCommunityOrg from '../components/WrapperCommunityOrg'
import type { schemas } from '../types'

// "Live now: {title}" — fires at start_at to every RSVP'd customer.
// The primary CTA is the actual meeting URL when present (Zoom/Meet/
// Calendly link the host pasted), so the recipient gets one tap from
// inbox → meeting; falls back to the event page when there's no link
// yet.

export function CommunityEventLive({
  email,
  organization,
  event,
  course_name,
  event_url,
}: schemas['CommunityEventLiveProps']) {
  const joinHref = event.meeting_url || event_url

  return (
    <WrapperCommunityOrg organization={organization} email={email}>
      <Preview>Live now: {event.title}</Preview>

      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          {event.title} is live
        </Heading>
        <BodyText>
          <span className="font-semibold">{course_name}</span> is going live
          right now. Tap below to jump straight into the room.
        </BodyText>
      </Section>

      <EventCard event={event} />

      <Section className="my-6 text-center">
        <Button href={joinHref} variant="green">
          Join now
        </Button>
      </Section>

      {!event.meeting_url ? (
        <Section>
          <Text className="text-sm text-gray-500">
            No join link is set on this event yet. Open the event page above and
            the host&apos;s instructions will show up there.
          </Text>
        </Section>
      ) : null}
    </WrapperCommunityOrg>
  )
}

CommunityEventLive.PreviewProps = {
  email: 'student@example.com',
  organization: {
    id: 'org-acme',
    name: 'Acme Inc.',
    slug: 'acme-inc',
    avatar_url: 'https://placehold.co/64x64',
    website: 'https://acme-inc.spaire.app',
  },
  course_name: 'The Joy of Painting',
  event_url: 'https://app.spairehq.com/acme-inc/events/abc-123',
  event: {
    title: 'Workshop: Painting happy little trees',
    type: 'workshop',
    start_at: '2026-06-12T19:00:00Z',
    timezone: 'America/Los_Angeles',
    duration_minutes: 60,
    host_name: 'Bob Ross',
    cover_url: 'https://placehold.co/600x220',
    cover_object_position: '50% 50%',
    location: null,
    meeting_url: 'https://zoom.us/j/12345',
  },
}

export default CommunityEventLive
