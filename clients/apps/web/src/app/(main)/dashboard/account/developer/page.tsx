import AccessTokensSettings from '@/components/Settings/AccessTokenSettings'
import ConnectWordSettings from '@/components/Settings/ConnectWordSettings'
import OAuthSettings from '@/components/Settings/OAuth/OAuthSettings'
import { Section, SectionDescription } from '@/components/Settings/Section'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Developer',
  description: 'Manage your developer settings',
}

export default function Page() {
  return (
    <>
      {/* First on the page because it is the one thing here a lawyer needs,
          and everything below it is for developers. */}
      <Section id="connect-word">
        <SectionDescription
          title="Connect Word"
          description="Give the Word add-in a token so it can reach the Claidor engine"
        />

        <ConnectWordSettings />
      </Section>
      <Section id="oauth">
        <SectionDescription
          title="OAuth Applications"
          description="Your configured OAuth Applications"
        />

        <OAuthSettings />
      </Section>
      <Section id="personal-access-tokens">
        <SectionDescription title="Personal Access Tokens" />
        <AccessTokensSettings />
      </Section>
    </>
  )
}
