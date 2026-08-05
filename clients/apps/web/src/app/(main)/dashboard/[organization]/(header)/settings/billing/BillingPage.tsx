'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import OrganizationPaymentSettings from '@/components/Settings/OrganizationPaymentSettings'
import OrganizationCustomerEmailSettings from '@/components/Settings/OrganizationCustomerEmailSettings'
import OrganizationCustomerPortalSettings from '@/components/Settings/OrganizationCustomerPortalSettings'
import OrganizationSubscriptionSettings from '@/components/Settings/OrganizationSubscriptionSettings'
import { Section, SectionDescription } from '@/components/Settings/Section'
import { schemas } from '@spaire/client'

export default function BillingPage({
  organization: org,
}: {
  organization: schemas['Organization']
}) {
  return (
    <DashboardBody wrapperClassName="max-w-(--breakpoint-sm)!" title="Billing">
      <div className="flex flex-col gap-y-12">
        <Section id="payments">
          <SectionDescription title="Payments" />
          <OrganizationPaymentSettings organization={org} />
        </Section>

        <Section id="subscriptions">
          <SectionDescription title="Subscriptions" />
          <OrganizationSubscriptionSettings organization={org} />
          {/* Course-only reposition: the standalone "Customer portal" section is
              removed; its sole remaining control (let customers change their
              plan) now lives here under Subscriptions. */}
          <OrganizationCustomerPortalSettings organization={org} />
        </Section>

        <Section id="customer_emails">
          <SectionDescription
            title="Customer notifications"
            description="Emails automatically sent to customers for purchases, renewals, and other subscription lifecycle events"
          />
          <OrganizationCustomerEmailSettings organization={org} />
        </Section>
      </div>
    </DashboardBody>
  )
}
