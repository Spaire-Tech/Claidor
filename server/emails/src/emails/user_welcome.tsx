import { Preview, Section } from '@react-email/components'
import BodyText from '../components/BodyText'
import Footer from '../components/Footer'
import IntroWithHi from '../components/IntroWithHi'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'

export function UserWelcome({ email }: schemas['UserWelcomeProps']) {
  return (
    <WrapperPolar>
      <Preview>Welcome to Spaire — a quick note from Bass</Preview>
      <IntroWithHi hiMsg="Hey,">
        Thank you for starting your trial — really glad you&apos;re here.
      </IntroWithHi>
      <Section>
        <BodyText>
          Nobody ever learned to do anything wonderful from a list of
          instructions. We learn the way we always have — by watching someone a
          little further along, catching the small unteachable things they do
          without thinking. That&apos;s all a masterclass really is. Not a course
          to be completed, but a master to be sat beside.
        </BodyText>
        <BodyText>
          Spaire is meant to make that kind of thing as easy to build as it is
          lovely to land on, and the next 14 days are yours to test the claim.
          Put up a lesson or two and a sample people can watch before they
          decide anything. The aim is for someone to land on what you&apos;ve
          made and feel, before they&apos;ve committed to anything, that
          they&apos;re in good hands.
        </BodyText>
        <BodyText>
          If anything comes up, hit reply. This inbox comes to me — I read
          everything, and there&apos;s nothing I&apos;d rather hear about than
          what you&apos;re teaching and how it&apos;s going.
        </BodyText>
        <BodyText>Thank you again,</BodyText>
        <BodyText>
          Bass
          <br />
          Co-Founder &amp; CEO @ Spaire
        </BodyText>
      </Section>
      <Footer email={email} />
    </WrapperPolar>
  )
}

UserWelcome.PreviewProps = {
  email: 'john@example.com',
}

export default UserWelcome
