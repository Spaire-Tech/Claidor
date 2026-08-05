import {
  Heading,
  Hr,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import Footer from '../components/Footer'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'

export function PlatformSubscriptionNotice({
  email,
  title,
  body_lines,
  url,
  cta_label,
}: schemas['PlatformSubscriptionNoticeProps']) {
  return (
    <WrapperPolar>
      <Preview>{title}</Preview>
      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          {title}
        </Heading>
        {body_lines.map((line, index) => (
          <BodyText key={index}>{line}</BodyText>
        ))}
      </Section>
      <Section className="my-8 text-center">
        <Button href={url}>{cta_label}</Button>
      </Section>
      <Hr />
      <Section className="mt-6 border-t border-gray-200 pt-6">
        <Text className="text-sm text-gray-600">
          If you&apos;re having trouble with the button above, copy and paste
          the URL below into your web browser.
        </Text>
        <Text className="text-sm">
          <Link href={url} className="text-blue-600 underline">
            {url}
          </Link>
        </Text>
      </Section>
      <Footer email={email} />
    </WrapperPolar>
  )
}

PlatformSubscriptionNotice.PreviewProps = {
  email: 'creator@example.com',
  title: 'Your Spaire payment failed',
  body_lines: [
    "We couldn't charge your card for the Spaire Studio plan.",
    'We will retry automatically over the next few days. To keep your plan, update your payment method in Settings → Plan.',
  ],
  url: 'https://app.spairehq.com/dashboard/spaire/settings',
  cta_label: 'Update payment method',
}

export default PlatformSubscriptionNotice
