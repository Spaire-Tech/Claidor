'use client'

import { Well, WellContent, WellHeader } from '@/components/Shared/Well'
import {
  SyntaxHighlighterClient,
  SyntaxHighlighterProvider,
} from '@/components/SyntaxHighlighterShiki/SyntaxHighlighterClient'
import { OrganizationContext } from '@/providers/maintainerOrganization'
import Button from '@spaire/ui/components/atoms/Button'
import Link from 'next/link'
import { useContext } from 'react'

export const MeterIngestionGuide = () => {
  const { organization } = useContext(OrganizationContext)

  return (
    <SyntaxHighlighterProvider>
      <div className="flex h-full flex-col items-center justify-center gap-6 py-12">
        <Well className="flex flex-col gap-12 rounded-4xl p-4 md:flex-row">
          <div className="flex w-full flex-col gap-6 p-6 md:max-w-sm">
            <WellHeader>
              <h2 className="text-2xl">Usage Billing with Meters</h2>
            </WellHeader>
            <WellContent className="flex grow flex-col justify-between gap-6">
              <div className="flex flex-col gap-4">
                <p className=" text-gray-700">
                  Meters are aggregated filters on ingested events. They are
                  used to calculate your customer&apos;s usage of whatever you
                  choose to measure.
                </p>
                <p className=" text-gray-700">
                  For example, if you want to measure the number of API calls
                  your customer makes, you can create a meter that counts the
                  number of events with an arbitrary name like{' '}
                  <code>api_call</code>.
                </p>
              </div>
              <div className="flex flex-col gap-y-2">
                <Link
                  href={`/dashboard/${organization.slug}/integrations/setup-usage-billing`}
                >
                  <Button fullWidth>
                    Set up with Claude
                  </Button>
                </Link>
                <Link
                  href={`/dashboard/${organization.slug}/products/meters/create`}
                >
                  <Button fullWidth variant="ghost">
                    Create Manually
                  </Button>
                </Link>
              </div>
            </WellContent>
          </div>
          <Well className=" flex-1 shrink overflow-auto bg-white p-6 text-sm">
            <SyntaxHighlighterClient
              lang="typescript"
              code={`import { Spaire } from "@spaire/sdk";

const spaire = new Spaire({
  accessToken: process.env["SPAIRE_ACCESS_TOKEN"] ?? "",
});

export const GET = async (req: Request, res: Response) => {
  await spaire.events.ingest({
    events: [
      {
        name: "api_call",
        // Replace with your logic to get the customer id
        externalCustomerId: req.ctx.customerId,
        metadata: {
          route: "/api/metered-route",
          method: "GET",
        },
      },
    ],
  });

  return new Response({ hello: 'world' })
}`}
            />
          </Well>
        </Well>
      </div>
    </SyntaxHighlighterProvider>
  )
}
