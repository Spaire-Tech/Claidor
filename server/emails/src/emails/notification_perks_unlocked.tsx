import { Preview, Section, Text } from '@react-email/components'
import BodyText from '../components/BodyText'
import Button from '../components/Button'
import Footer from '../components/Footer'
import IntroWithHi from '../components/IntroWithHi'
import WrapperPolar from '../components/WrapperPolar'
import type { schemas } from '../types'

export function NotificationPerksUnlocked({
  organization_name,
  perks_url,
}: schemas['MaintainerPerksUnlockedNotificationPayload']) {
  return (
    <WrapperPolar>
      <Preview>
        🎉 Congrats on your first sale! You've unlocked the Spaire Startup
        Perks.
      </Preview>
      <IntroWithHi>
        Congrats on your first sale through <strong>{organization_name}</strong>!
      </IntroWithHi>
      <BodyText>
        You've unlocked the <strong>Spaire Startup Stack</strong> — exclusive
        perks, credits, and discounts from the tools trusted by founders around
        the world.
      </BodyText>
      <Section className="mt-4 mb-8">
        <Text className="m-0 text-sm text-gray-600">
          Head to your Startup Stack dashboard to start claiming your perks.
        </Text>
      </Section>
      <Section className="mt-6 mb-8">
        <Button href={perks_url}>View your perks</Button>
      </Section>
      <Footer email={null} />
    </WrapperPolar>
  )
}

NotificationPerksUnlocked.PreviewProps = {
  organization_name: 'Acme Inc.',
  perks_url: 'https://spaire.com/dashboard/acme-inc/startup-stack',
}

export default NotificationPerksUnlocked
