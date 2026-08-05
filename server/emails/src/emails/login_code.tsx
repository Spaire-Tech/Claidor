import { Preview, Section, Text } from '@react-email/components'
import Footer from '../components/Footer'
import IntroWithHi from '../components/IntroWithHi'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'

export function LoginCode({
  email,
  code,
  code_lifetime_minutes,
}: schemas['LoginCodeProps']) {
  return (
    <WrapperPolar>
      <Preview>
        Your code to sign in is {code}. It is valid for the next{' '}
        {code_lifetime_minutes.toFixed()} minutes.
      </Preview>
      <IntroWithHi>
        Use the verification code below to sign in to your Spaire account.{' '}
        <span className="font-bold">
          This code is only valid for the next {code_lifetime_minutes} minutes.
        </span>
      </IntroWithHi>
      <Section className="text-center">
        <Text className="text-5xl font-bold tracking-wider text-black">
          {code}
        </Text>
      </Section>
      <Text className="text-gray-500">
        If you did not request this sign-in, you may safely ignore this email.
      </Text>
      <Footer email={email} />
    </WrapperPolar>
  )
}

LoginCode.PreviewProps = {
  email: 'john@example.com',
  code: 'ABC123',
  code_lifetime_minutes: 30,
}

export default LoginCode
