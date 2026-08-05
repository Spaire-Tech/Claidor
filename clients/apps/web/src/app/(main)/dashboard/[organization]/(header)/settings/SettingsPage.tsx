'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import FeatureSettings from '@/components/Settings/FeatureSettings'
import OrganizationDeleteSettings from '@/components/Settings/OrganizationDeleteSettings'
import OrganizationNotificationSettings from '@/components/Settings/OrganizationNotificationSettings'
import OrganizationProfileSettings from '@/components/Settings/OrganizationProfileSettings'
import { Section, SectionDescription } from '@/components/Settings/Section'
import { schemas } from '@spaire/client'

// Gate for the alpha/beta "Features" (Cost Insights) section. Hidden for the
// course-only creator experience; set to `true` to bring the section back.
const SHOW_BETA_FEATURES = false

export default function ClientPage({
  organization: org,
}: {
  organization: schemas['Organization']
}) {
  return (
    <DashboardBody
      wrapperClassName="max-w-(--breakpoint-sm)!"
      title="Settings"
    >
      <div className="flex flex-col gap-y-12">
        <Section id="organization">
          <SectionDescription title="Creator Profile" />
          <OrganizationProfileSettings organization={org} />
        </Section>

        <Section id="notifications">
          <SectionDescription title="Notifications" />
          <OrganizationNotificationSettings organization={org} />
        </Section>

        {/*
          "Features" / Cost Insights is an alpha/beta dev-framing tab — hidden
          for the course-only creator experience. Reversible: flip to `true`
          (or remove the guard) to restore. Component & logic are kept intact.
        */}
        {SHOW_BETA_FEATURES && (
          <Section id="features">
            <SectionDescription
              title="Features"
              description="Manage alpha & beta features for your account"
            />
            <FeatureSettings organization={org} />
          </Section>
        )}

        <Section id="danger">
          <SectionDescription
            title="Danger Zone"
            description="Irreversible actions for this account"
          />
          <OrganizationDeleteSettings organization={org} />
        </Section>
      </div>
    </DashboardBody>
  )
}
