'use client'

import { Section } from '@/components/Layout/Section'
import { schemas } from '@spaire/client'
import {
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { useFormContext } from 'react-hook-form'
import ProductMediasField from '../ProductMediasField'
import { ProductFormType } from './ProductForm'

export const ProductMediaSection = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const { control } = useFormContext<ProductFormType>()

  return (
    <Section
      title="Product Media"
      description="This image appears in Checkouts, your Spaire Space, in emails, social sharing and more."
    >
      <FormField
        control={control}
        name="full_medias"
        render={({ field }) => (
          <FormItem className="flex w-full flex-col gap-2">
            <FormControl>
              <ProductMediasField
                organization={organization}
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Section>
  )
}
