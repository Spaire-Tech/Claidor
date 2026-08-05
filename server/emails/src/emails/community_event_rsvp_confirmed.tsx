import { Heading, Preview, Section, Text } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import EventCard from '../components/EventCard'
import WrapperCommunityOrg from '../components/WrapperCommunityOrg'
import type { schemas } from '../types'

// "You're going: {title}" — sent right after a customer clicks RSVP.
// The .ics calendar attachment rides along with this email (added in
// the events_tasks.rsvp_confirmed actor before enqueue_email) so
// recipients can add it to Google/Apple/Outlook in one tap.

export function CommunityEventRsvpConfirmed({
  email,
  organization,
  event,
  course_name,
  event_url,
}: schemas['CommunityEventRsvpConfirmedProps']) {
  return (
    <WrapperCommunityOrg organization={organization} email={email}>
      <Preview>
        You&apos;re going to {event.title} — calendar invite attached
      </Preview>

      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          You&apos;re going!
        </Heading>
        <BodyText>
          We&apos;ll send you a reminder the day before and again when{' '}
          <span className="font-semibold">{event.title}</span> goes live. The
          calendar invite is attached to this email — add it once and your phone
          will remind you too.
        </BodyText>
      </Section>

      <EventCard event={event} />

      <Section className="my-6 text-center">
        <Button href={event_url}>View event</Button>
      </Section>

      <Section>
        <Text className="text-sm text-gray-500">
          Can&apos;t make it? Open the event page above and tap RSVP again to
          cancel — your spot frees up and you stop getting reminders.
        </Text>
      </Section>
    </WrapperCommunityOrg>
  )
}

CommunityEventRsvpConfirmed.PreviewProps = {
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

export default CommunityEventRsvpConfirmed
