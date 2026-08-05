'use client'

import { Client, schemas } from '@spaire/client'
import { List, ListItem } from '@spaire/ui/components/atoms/List'
import { BenefitGrant } from '../Benefit/BenefitGrant'

export interface CustomerPortalGrantsSimpleProps {
  organization?: schemas['CustomerOrganization']
  benefitGrants: schemas['CustomerBenefitGrant'][]
  api: Client
}

export const CustomerPortalGrantsSimple = ({
  api,
  benefitGrants,
}: CustomerPortalGrantsSimpleProps) => {
  return (
    <div className="flex w-full flex-col gap-4">
      <h3 className="text-lg md:text-xl">What&apos;s included</h3>
      <div className="flex flex-col gap-4">
        <List>
          {benefitGrants?.map((benefitGrant) => (
            <ListItem
              key={benefitGrant.id}
              className="py-6 hover:bg-transparent"
            >
              <BenefitGrant api={api} benefitGrant={benefitGrant} />
            </ListItem>
          ))}
        </List>
      </div>
    </div>
  )
}
