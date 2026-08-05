'use client'

import { useCallback, useMemo } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import AddOutlined from '@mui/icons-material/AddOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { Label } from '@spaire/ui/components/ui/label'
import { twMerge } from 'tailwind-merge'
import { FadeUp } from '@/components/Animated/FadeUp'
import {
  getRecommendation,
  US_STATES,
  type RecommendationInput,
  type RecommendationOutput,
} from '../recommendation'
import { companyDetailsSchema, type CompanyDetailsData } from '../types'

const entityTypes = [
  { id: 'C_CORP', label: 'C-Corporation', description: 'Best for raising VC, issuing stock options' },
  { id: 'LLC', label: 'LLC', description: 'Flexible structure, pass-through taxation' },
] as const

interface CompanyDetailsStepProps {
  intentData: RecommendationInput
  data: Partial<CompanyDetailsData>
  onNext: (data: CompanyDetailsData, recommendation: RecommendationOutput) => void
  onBack: () => void
}

export default function CompanyDetailsStep({
  intentData,
  data,
  onNext,
  onBack,
}: CompanyDetailsStepProps) {
  const recommendation = useMemo(
    () => getRecommendation(intentData),
    [intentData],
  )

  const form = useForm<CompanyDetailsData>({
    defaultValues: {
      legal_name: data.legal_name || '',
      entity_type: data.entity_type || recommendation.entity_type,
      formation_state: data.formation_state || recommendation.formation_state,
      founders: data.founders?.length
        ? data.founders
        : [{ name: '', email: '' }],
    },
  })

  const entityType = form.watch('entity_type')

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'founders',
  })

  const onSubmit = useCallback(
    (values: CompanyDetailsData) => {
      const result = companyDetailsSchema.safeParse(values)
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path.join('.') as keyof CompanyDetailsData
          form.setError(field, { message: issue.message })
        }
        return
      }
      onNext(result.data as CompanyDetailsData, recommendation)
    },
    [onNext, recommendation, form],
  )

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex w-full flex-col gap-y-10"
      >
        {/* Entity type */}
        <FadeUp className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <Label className="text-sm font-medium">Entity type</Label>
            <p className=" text-xs text-gray-400">
              We recommend{' '}
              <span className="font-medium text-gray-900">
                {recommendation.entity_type === 'C_CORP' ? 'C-Corporation' : 'LLC'}
              </span>{' '}
              based on your answers. You can change this.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {entityTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => form.setValue('entity_type', type.id as 'LLC' | 'C_CORP')}
                className={twMerge(
                  ' flex cursor-pointer flex-col gap-y-1.5 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all',
                  entityType === type.id
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : 'hover:border-gray-300',
                )}
              >
                <span className="text-sm font-medium">{type.label}</span>
                <span className=" text-xs leading-relaxed text-gray-400">
                  {type.description}
                </span>
              </button>
            ))}
          </div>
        </FadeUp>

        {/* Company name + state in a card */}
        <FadeUp className="flex flex-col gap-y-6">
          <div className="flex flex-col gap-y-1">
            <h2 className="text-base font-medium">Company info</h2>
            <p className=" text-sm text-gray-400">
              The legal details for your new company.
            </p>
          </div>

          <div className=" flex flex-col gap-y-5 rounded-2xl border border-gray-200 bg-white p-6">
            <FormField
              control={form.control}
              name="legal_name"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormControl className="flex w-full flex-col gap-y-2">
                    <div>
                      <Label htmlFor="legal_name">Company name</Label>
                      <Input
                        {...field}
                        placeholder='e.g., "Acme Inc."'
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="formation_state"
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormControl className="flex w-full flex-col gap-y-2">
                    <div>
                      <Label htmlFor="formation_state">Formation state</Label>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state..." />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.code} value={state.code}>
                              {state.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FadeUp>

        {/* Founders */}
        <FadeUp className="flex flex-col gap-y-6">
          <div className="flex flex-col gap-y-1">
            <h2 className="text-base font-medium">Founders</h2>
            <p className=" text-sm text-gray-400">
              Add each founder&apos;s name and email.
            </p>
          </div>

          <div className="flex flex-col gap-y-3">
            {fields.map((field, index) => (
              <div
                key={field.id}
                className=" flex items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4"
              >
                <FormField
                  control={form.control}
                  name={`founders.${index}.name`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input {...field} placeholder="Full name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`founders.${index}.email`}
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormControl>
                        <Input {...field} placeholder="Email" type="email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className=" mt-2 text-gray-400 hover:text-gray-600"
                  >
                    <CloseOutlined style={{ fontSize: 18 }} />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => append({ name: '', email: '' })}
              className="flex items-center gap-1 text-sm font-medium text-blue-500 hover:text-blue-600"
            >
              <AddOutlined style={{ fontSize: 16 }} />
              Add founder
            </button>
          </div>
        </FadeUp>

        {/* Actions */}
        <FadeUp className="flex flex-col gap-y-4 pt-2">
          <Button type="submit" size="lg">
            Continue
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={onBack}>
            Back
          </Button>
        </FadeUp>
      </form>
    </Form>
  )
}
