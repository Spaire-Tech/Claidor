'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Section, SectionDescription } from '@/components/Settings/Section'
import QuotaUsageCard from '@/components/Settings/SpaireTier/QuotaUsageCard'
import SpaireBillingManagement from '@/components/Settings/SpaireTier/SpaireBillingManagement'
import SpairePlanCards from '@/components/Settings/SpaireTier/SpairePlanCards'
import { schemas } from '@spaire/client'

export default function PlanPage({
  organization,
}: {
  organization: schemas['Organization']
}) {
  return (
    <DashboardBody wrapperClassName="max-w-6xl" title="Subscription">
      <div className="flex flex-col gap-y-12">
        <Section id="plans">
          <SpairePlanCards organization={organization} />
        </Section>

        <SpaireBillingManagement organization={organization} />

        <Section id="plan_usage">
          <SectionDescription
            title="Usage this period"
            description="What you have consumed against the limits on your current plan."
          />
          <QuotaUsageCard organization={organization} />
        </Section>
      </div>
    </DashboardBody>
  )
}
