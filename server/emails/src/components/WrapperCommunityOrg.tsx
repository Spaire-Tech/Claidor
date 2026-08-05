import {
  Column,
  Container,
  Hr,
  Img,
  Link,
  Row,
  Section,
  Text,
} from '@react-email/components'
import type { schemas } from '../types'
import WrapperBase from './WrapperBase'

// Org-branded wrapper specifically for community-event transactional
// emails. Mirrors WrapperOrganization's chrome (logo + name at top,
// per-org footer line at bottom) but takes the slim
// CommunityEmailOrgInfo schema instead of the full Organization model,
// so the persisted notification payload stays compact and we don't
// over-serialize org fields the email never reads.

const LinkOrSpan = ({
  href,
  children,
}: {
  href: string | null
  children: React.ReactNode
}) => (href ? <Link href={href}>{children}</Link> : <>{children}</>)

const Header = ({
  organization,
}: {
  organization: schemas['CommunityEmailOrgInfo']
}) => (
  <LinkOrSpan href={organization.website ?? null}>
    <Section className="pt-[10px]">
      <Row>
        {organization.avatar_url ? (
          <Column className="w-10">
            <Img
              alt={organization.name}
              src={organization.avatar_url}
              className="size-8 overflow-hidden rounded-full object-cover"
            />
          </Column>
        ) : null}
        <Column>
          <Text className="my-0 text-lg font-bold text-gray-900">
            {organization.name}
          </Text>
        </Column>
      </Row>
    </Section>
  </LinkOrSpan>
)

const Footer = ({
  organization,
  email,
}: {
  organization: schemas['CommunityEmailOrgInfo']
  email: string
}) => (
  <>
    <Hr />
    <Section className="text-center text-sm">
      {email ? (
        <Text className="mb-2 text-gray-500">
          This email was sent to{' '}
          <a
            href={`mailto:${email}`}
            className="font-semibold"
            style={{
              textDecoration: 'none !important',
              color: 'inherit !important',
            }}
          >
            <span
              style={{
                textDecoration: 'none !important',
                color: 'inherit !important',
              }}
            >
              {email}
            </span>
          </a>
          .
        </Text>
      ) : null}
      <Text className="text-gray-900">
        You&apos;re part of{' '}
        <span className="font-semibold">{organization.name}</span> on{' '}
        <span className="font-semibold">Spaire</span>
      </Text>
    </Section>
  </>
)

const WrapperCommunityOrg = ({
  children,
  organization,
  email,
}: {
  children: React.ReactNode
  organization: schemas['CommunityEmailOrgInfo']
  email: string
}) => (
  <WrapperBase>
    <Container className="px-[20px] pt-[20px] pb-[10px]">
      <Header organization={organization} />
    </Container>
    <Container className="px-[20px] pt-[10px] pb-[20px]">
      {children}
      <Footer organization={organization} email={email} />
    </Container>
  </WrapperBase>
)

export default WrapperCommunityOrg
