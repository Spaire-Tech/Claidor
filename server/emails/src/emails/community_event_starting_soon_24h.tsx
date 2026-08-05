import { Heading, Preview, Section } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import EventCard from '../components/EventCard'
import WrapperCommunityOrg from '../components/WrapperCommunityOrg'
import type { schemas } from '../types'

// "Tomorrow: {title}" — fires ~24h before start_at to every customer
// who has RSVP'd. Designed to be glanceable in the morning inbox so a
// busy student can confirm they've blocked the time.

export function CommunityEventStartingSoon24h({
  email,
  organization,
  event,
  course_name,
  event_url,
}: schemas['CommunityEventStartingSoon24hProps']) {
  return (
    <WrapperCommunityOrg organization={organization} email={email}>
      <Preview>Tomorrow: {event.title}</Preview>

      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          Tomorrow in {course_name}
        </Heading>
        <BodyText>
          Just a heads-up — <span className="font-semibold">{event.title}</span>{' '}
          is happening tomorrow. We&apos;ll ping you again right before it
          starts.
        </BodyText>
      </Section>

      <EventCard event={event} />

      <Section className="my-6 text-center">
        <Button href={event_url}>View event</Button>
      </Section>
    </WrapperCommunityOrg>
  )
}

CommunityEventStartingSoon24h.PreviewProps = {
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

export default CommunityEventStartingSoon24h
