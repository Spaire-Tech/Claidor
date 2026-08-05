import {
  Heading,
  Hr,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import Benefits from '../components/Benefits'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import FooterCustomer from '../components/FooterCustomer'
import OrderSummary from '../components/OrderSummary'
import WrapperOrganization from '../components/WrapperOrganization'
import { order, organization, product } from '../preview'
import type { schemas } from '../types'

export function OrderConfirmation({
  email,
  organization,
  product,
  order,
  url,
}: schemas['OrderConfirmationProps']) {
  return (
    <WrapperOrganization organization={organization}>
      <Preview>Thank you for enrolling in {order.description}!</Preview>
      <Section>
        <Heading as="h1" className="text-xl font-bold text-gray-900">
          Thank you for enrolling!
        </Heading>
        <BodyText>
          Your enrollment in <span className="font-bold">{order.description}</span>{' '}
          is now confirmed.
        </BodyText>
      </Section>
      {product && (
        <>
          {product.benefits.length > 0 && (
            <Benefits benefits={product.benefits} />
          )}
          <Section className="my-8 text-center">
            <Button href={url}>Access my course</Button>
          </Section>
        </>
      )}
      <Hr />
      <OrderSummary order={order} />
      <Hr />
      <Section className="mt-6 border-t border-gray-200 pt-6">
        <Text className="text-sm text-gray-600">
          If you're having trouble with the button above, copy and paste the URL
          below into your web browser.
        </Text>
        <Text className="text-sm">
          <Link href={url} className="text-blue-600 underline">
            {url}
          </Link>
        </Text>
      </Section>
      <FooterCustomer organization={organization} email={email} />
    </WrapperOrganization>
  )
}

OrderConfirmation.PreviewProps = {
  email: 'john@example.com',
  organization,
  product,
  order,
  url: 'https://app.spairehq.com/acme-inc/portal/orders/12345',
}

export default OrderConfirmation
