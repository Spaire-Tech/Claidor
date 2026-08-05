import { Section } from '@/components/Layout/Section'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { ProductAdditionalDetailsSection } from './ProductAdditionalDetailsSection'
import { ProductCustomFieldSection } from './ProductCustomFieldSection'
import { ProductCustomerPortalSection } from './ProductCustomerPortalSection'
import { ProductInfoSection } from './ProductInfoSection'
import { ProductMediaSection } from './ProductMediaSection'
import { ProductPricingSection } from './ProductPricingSection'

export interface ProductFullMediasMixin {
  full_medias: schemas['ProductMediaFileRead'][]
}

export type ProductFormType = Omit<
  schemas['ProductCreate'] | schemas['ProductUpdate'],
  'metadata'
> &
  ProductFullMediasMixin & {
    metadata: { key: string; value: string | number | boolean }[]
    // Short free-form tagline shown under the title on the product page.
    // Not yet in the generated ProductCreate/Update types (pending client
    // regen), so it's declared here on the form model.
    subtitle?: string | null
  }

const ProductForm = ({
  organization,
  update,
  benefitsSlot,
}: {
  organization: schemas['Organization']
  update?: boolean
  benefitsSlot: React.ReactNode
}) => {
  return (
    <div className="flex flex-col divide-y">
      <ProductInfoSection />

      <ProductPricingSection organization={organization} update={update} />

      <ProductMediaSection organization={organization} />

      {benefitsSlot}

      <ProductAdditionalDetailsSection />

      <ProductCustomerPortalSection />

      <Section
        title="Custom fields"
        description="Collect additional information from your customers during checkout"
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-row items-center justify-end">
            <p className=" text-sm text-gray-500">
              <Link
                className="text-blue-500 hover:underline"
                href={`/dashboard/${organization.slug}/settings/custom-fields`}
                target="_blank"
              >
                Manage Custom Fields
              </Link>
            </p>
          </div>
          <ProductCustomFieldSection organization={organization} />
        </div>
      </Section>
    </div>
  )
}

export default ProductForm
