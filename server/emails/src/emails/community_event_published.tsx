import { Heading, Preview, Section } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import EventCard from '../components/EventCard'
import WrapperCommunityOrg from '../components/WrapperCommunityOrg'
import type { schemas } from '../types'

// "New event: {title}" — fan-out to every enrolled customer the
// moment a host publishes (when notify_on_publish=true, which is the
// default). Lives at the top of the inbox so the call to RSVP is
// the obvious next action.

export function CommunityEventPublished({
  email,
  organization,
  event,
  host_name,
  course_name,
  event_url,
}: schemas['CommunityEventPublishedProps']) {
  return (
    <WrapperCommunityOrg organization={organization} email={email}>
      <Preview>
        {host_name} just scheduled {event.title} in {course_name}
      </Preview>

      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          New event in {course_name}
        </Heading>
        <BodyText>
          <span className="font-semibold">{host_name}</span> just scheduled a
          new live session. RSVP to get reminders and a calendar invite.
        </BodyText>
      </Section>

      <EventCard event={event} />

      <Section className="my-6 text-center">
        <Button href={event_url}>RSVP</Button>
      </Section>
    </WrapperCommunityOrg>
  )
}

CommunityEventPublished.PreviewProps = {
  email: 'student@example.com',
  organization: {
    id: 'org-acme',
    name: 'Acme Inc.',
    slug: 'acme-inc',
    avatar_url: 'https://placehold.co/64x64',
    website: 'https://acme-inc.spaire.app',
  },
  host_name: 'Bob Ross',
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

export default CommunityEventPublished
