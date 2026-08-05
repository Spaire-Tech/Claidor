import { Heading, Preview, Section, Text } from '@react-email/components'
import Button from '../components/Button'
import EventCard from '../components/EventCard'
import WrapperCommunityOrg from '../components/WrapperCommunityOrg'
import type { schemas } from '../types'

// Host-composed announcement about an event. The host writes a
// subject + a free-text body in the composer modal; we wrap that body
// in the same org-branded chrome the rest of the event emails use,
// then drop the auto-rendered EventCard underneath so the recipient
// can see the event details without scrolling for them.
//
// Body is plain text. We split on blank lines so the host can press
// Enter twice for a paragraph break — same convention as the post
// composer in the community feed.

function paragraphsFromBody(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

export function CommunityEventAnnouncement({
  email,
  organization,
  subject,
  body,
  event,
  course_name,
  event_url,
  host_name,
}: schemas['CommunityEventAnnouncementProps']) {
  const paragraphs = paragraphsFromBody(body)

  return (
    <WrapperCommunityOrg organization={organization} email={email}>
      <Preview>
        {subject} — from {host_name} in {course_name}
      </Preview>

      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          {subject}
        </Heading>
      </Section>

      {paragraphs.length > 0 ? (
        <Section>
          {paragraphs.map((p, i) => (
            <Text
              key={i}
              className="mt-3 mb-3 text-base text-gray-800"
              // Inline whiteSpace so single-line breaks inside a
              // paragraph (one Enter) survive the email render.
              // Double-Enter paragraph splits are already handled
              // above; this catches mid-paragraph wrapping.
              style={{ whiteSpace: 'pre-wrap', lineHeight: '24px' }}
            >
              {p}
            </Text>
          ))}
        </Section>
      ) : null}

      <EventCard event={event} />

      <Section className="my-6 text-center">
        <Button href={event_url}>View event</Button>
      </Section>
    </WrapperCommunityOrg>
  )
}

CommunityEventAnnouncement.PreviewProps = {
  email: 'student@example.com',
  organization: {
    id: 'org-acme',
    name: 'Acme Inc.',
    slug: 'acme-inc',
    avatar_url: 'https://placehold.co/64x64',
    website: 'https://acme-inc.spaire.app',
  },
  subject: 'Quick reminder for Wednesday',
  body: "Hey everyone — can't wait to see you on Wednesday!\n\nWe'll be covering the alla prima technique I mentioned last week. Bring your reference photos and we'll work through them together.\n\nDoors open 5 minutes before. See you there!",
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

export default CommunityEventAnnouncement
