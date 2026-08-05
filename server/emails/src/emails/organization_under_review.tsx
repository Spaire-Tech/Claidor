import { Preview, Section } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import Footer from '../components/Footer'
import IntroWithHi from '../components/IntroWithHi'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'

export function OrganizationUnderReview({
  email,
  organization,
}: schemas['OrganizationUnderReviewProps']) {
  return (
    <WrapperPolar>
      <Preview>
        Congrats on your first sale 🎉 — your organization is now undergoing a
        routine review
      </Preview>
      <IntroWithHi>
        Congrats on your first sale 🎉
      </IntroWithHi>
      <Section>
        <BodyText>
          As part of our standard process, your organization{' '}
          <strong>{organization.name}</strong> is now undergoing a routine
          review.
        </BodyText>
        <BodyText>
          This is a normal step that happens after the first transaction for all
          accounts. As a Merchant of Record, we&apos;re required to verify
          business details and ensure everything is compliant before continuing
          to process payments at scale.
        </BodyText>
        <BodyText>
          <strong>What happens next?</strong>
        </BodyText>
        <BodyText>
          We&apos;ll review your account and may reach out if we need any
          additional information. Reviews are typically completed within 3
          business days, though they can take up to 7 days depending on
          complexity and timing.
        </BodyText>
        <BodyText>
          During this review period, you can continue setting up your products
          and integrate Spaire. We&apos;ll notify you as soon as the review is
          complete.
        </BodyText>
        <BodyText>
          <Button href="https://docs.spairehq.com/merchant-of-record/account-reviews">
            Read more about our review process
          </Button>
        </BodyText>
        <BodyText>
          If you have any questions in the meantime, feel free to reach out to
          our support team.
        </BodyText>
      </Section>
      <Footer email={email} />
    </WrapperPolar>
  )
}

OrganizationUnderReview.PreviewProps = {
  email: 'admin@example.com',
  organization: {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Acme Inc.',
    slug: 'acme-inc',
    avatar_url: 'https://avatars.githubusercontent.com/u/105373340?s=200&v=4',
  },
}

export default OrganizationUnderReview
