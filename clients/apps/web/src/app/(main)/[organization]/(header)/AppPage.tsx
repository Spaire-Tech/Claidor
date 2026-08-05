'use client'

import { Storefront } from '@/components/Profile/Storefront'
import { FormPublic } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'

const ClientPage = ({
  organization,
  products,
  forms,
}: {
  organization: schemas['Organization']
  products: schemas['ProductStorefront'][]
  forms?: FormPublic[]
}) => {
  return (
    <Storefront organization={organization} products={products} forms={forms} />
  )
}

export default ClientPage
