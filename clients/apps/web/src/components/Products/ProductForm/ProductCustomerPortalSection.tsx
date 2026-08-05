'use client'

import { Section } from '@/components/Layout/Section'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { Label } from '@spaire/ui/components/ui/label'
import {
  RadioGroup,
  RadioGroupItem,
} from '@spaire/ui/components/ui/radio-group'
import { useFormContext } from 'react-hook-form'
import { ProductFormType } from './ProductForm'

export const ProductCustomerPortalSection = ({
  className,
}: {
  className?: string
}) => {
  const { control } = useFormContext<ProductFormType>()

  return (
    <Section
      title="Customer Portal"
      description="Control where customers can see and manage this product"
      className={className}
    >
      <div className="flex w-full flex-col gap-y-6">
        <FormField
          control={control}
          name="visibility"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Visibility</FormLabel>
              <FormControl>
                <div className="@container">
                  <RadioGroup
                    value={field.value ?? 'public'}
                    onValueChange={field.onChange}
                    className="grid grid-cols-2 gap-4"
                  >
                    <Label
                      htmlFor="visibility-public"
                      className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors ${
                        field.value === 'public' || !field.value
                          ? ' bg-gray-50'
                          : '    border-gray-100 text-gray-500 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 font-medium">
                        <RadioGroupItem value="public" id="visibility-public" />
                        Public
                      </div>
                      <p className=" text-sm text-gray-500">
                        Visible in the customer portal.
                      </p>
                    </Label>
                    <Label
                      htmlFor="visibility-private"
                      className={`flex cursor-pointer flex-col gap-3 rounded-2xl border p-5 font-normal transition-colors ${
                        field.value === 'private'
                          ? ' bg-gray-50'
                          : '    border-gray-100 text-gray-500 hover:border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 font-medium">
                        <RadioGroupItem
                          value="private"
                          id="visibility-private"
                        />
                        Private
                      </div>
                      <p className=" text-sm text-gray-500">
                        Only accessible via a direct checkout link.
                      </p>
                    </Label>
                  </RadioGroup>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </Section>
  )
}
