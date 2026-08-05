'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { Section, SectionDescription } from '@/components/Settings/Section'
import QuotaUsageCard from '@/components/Settings/ClaidorTier/QuotaUsageCard'
import ClaidorBillingManagement from '@/components/Settings/ClaidorTier/ClaidorBillingManagement'
import ClaidorPlanCards from '@/components/Settings/ClaidorTier/ClaidorPlanCards'
import { schemas } from '@claidor/client'

export default function PlanPage({
  organization,
}: {
  organization: schemas['Organization']
}) {
  return (
    <DashboardBody wrapperClassName="max-w-6xl" title="Subscription">
      <div className="flex flex-col gap-y-12">
        <Section id="plans">
          <ClaidorPlanCards organization={organization} />
        </Section>

        <ClaidorBillingManagement organization={organization} />

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
