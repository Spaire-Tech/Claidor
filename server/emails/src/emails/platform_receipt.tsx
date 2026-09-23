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
import OrderSummary from '../components/OrderSummary'
import WrapperPolar from '../components/WrapperPolar'
import { order } from '../preview'
import type { schemas } from '../types'

export function PlatformReceipt({
  email,
  plan_name,
  order,
  url,
  invoice_attached,
}: schemas['PlatformReceiptProps']) {
  return (
    <WrapperPolar>
      <Preview>Your Simeon {plan_name} receipt</Preview>
      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          Thanks for your payment
        </Heading>
        <BodyText>
          Here&apos;s your receipt for the{' '}
          <span className="font-bold">{plan_name}</span> plan.
          {invoice_attached
            ? ' Your invoice is attached as a PDF.'
            : ' You can download your invoice any time from your billing settings.'}
        </BodyText>
      </Section>
      <Section className="my-8 text-center">
        <Button href={url}>Manage my plan</Button>
      </Section>
      <Hr />
      <OrderSummary order={order} />
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

PlatformReceipt.PreviewProps = {
  email: 'creator@example.com',
  plan_name: 'Studio',
  order,
  url: 'https://app.simeonlabs.com/simeon/portal',
}

export default PlatformReceipt
