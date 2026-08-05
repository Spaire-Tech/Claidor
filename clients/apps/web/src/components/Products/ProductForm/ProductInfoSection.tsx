'use client'

import { Section } from '@/components/Layout/Section'
import Input from '@spaire/ui/components/atoms/Input'
import TextArea from '@spaire/ui/components/atoms/TextArea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { useFormContext } from 'react-hook-form'
import { ProductFormType } from './ProductForm'

export interface ProductInfoSectionProps {
  className?: string
  compact?: boolean
}

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ebook', label: 'eBook' },
  { value: 'template', label: 'Template' },
  { value: 'assets', label: 'Assets' },
  { value: 'course', label: 'Course' },
  { value: 'guide', label: 'Guide' },
  { value: 'music', label: 'Music' },
  { value: 'video', label: 'Video' },
  { value: 'photo', label: 'Photo' },
  { value: 'software', label: 'Software' },
  { value: 'coaching', label: 'Coaching' },
  { value: 'membership', label: 'Membership' },
  { value: 'other', label: 'Other' },
]

export const ProductInfoSection = ({
  className,
  compact,
}: ProductInfoSectionProps) => {
  const { control } = useFormContext<ProductFormType>()

  return (
    <Section
      title="Details"
      description="Give your product a short and clear name"
      className={className}
      compact={compact}
    >
      <div className="flex w-full flex-col gap-y-6">
        <FormField
          control={control}
          name="name"
          rules={{
            required: 'This field is required',
            minLength: { value: 3, message: 'Name must be at least 3 characters' },
          }}
          defaultValue=""
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center justify-between">
                <FormLabel>Name</FormLabel>
              </div>
              <FormControl>
                <Input {...field} value={field.value || ''} />
              </FormControl>
              <p className=" text-xs text-gray-500">
                50-60 characters is the recommended length for search engines.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'subtitle' as 'name'}
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center justify-between">
                <FormLabel>Subtitle</FormLabel>
                <p className="text-sm text-gray-500">Optional</p>
              </div>
              <FormControl>
                <Input
                  {...field}
                  value={field.value || ''}
                  placeholder="A baking book by Jane Doe"
                />
              </FormControl>
              <p className="text-xs text-gray-500">
                A short tagline shown under the title on your product page.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem className="flex flex-col gap-2">
              <div className="flex flex-row items-center justify-between">
                <FormLabel>Description</FormLabel>
                <p className=" text-sm text-gray-500">
                  Markdown format
                </p>
              </div>
              <FormControl>
                <TextArea
                  className="min-h-44 resize-none rounded-2xl font-mono text-xs!"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={'category' as any}
          render={({ field }) => (
            <FormItem>
              <div className="flex flex-row items-center justify-between">
                <FormLabel>Category</FormLabel>
              </div>
              <FormControl>
                <Select
                  value={(field.value as string | undefined) ?? ''}
                  onValueChange={(v) => field.onChange(v || null)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </Section>
  )
}
