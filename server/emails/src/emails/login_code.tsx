import { Preview, Section, Text } from '@react-email/components'
import Footer from '../components/Footer'
import IntroWithHi from '../components/IntroWithHi'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'
import { emailLanguage, fill, words } from '../words'

export function LoginCode({
  email,
  code,
  code_lifetime_minutes,
  language,
}: schemas['LoginCodeProps']) {
  const said = words(language)
  return (
    <WrapperPolar lang={emailLanguage(language)}>
      <Preview>
        {fill(said.loginCodePreview, {
          code,
          minutes: code_lifetime_minutes.toFixed(),
        })}
      </Preview>
      <IntroWithHi hiMsg={said.hello}>
        {said.loginCodeIntro}{' '}
        <span className="font-bold">
          {fill(said.loginCodeValid, { minutes: code_lifetime_minutes })}
        </span>
      </IntroWithHi>
      <Section className="text-center">
        <Text className="text-5xl font-bold tracking-wider text-black">
          {code}
        </Text>
      </Section>
      <Text className="text-gray-500">{said.loginCodeIgnore}</Text>
      <Footer email={email} language={language} />
    </WrapperPolar>
  )
}

LoginCode.PreviewProps = {
  email: 'john@example.com',
  code: 'ABC123',
  code_lifetime_minutes: 30,
  language: 'en',
}

export default LoginCode
