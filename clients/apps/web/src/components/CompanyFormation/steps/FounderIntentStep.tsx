'use client'

import { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'
import Button from '@spaire/ui/components/atoms/Button'
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
import { founderIntentSchema, type FounderIntentData } from '../types'
import { US_STATES } from '../recommendation'

const productTypes = [
  { id: 'saas', label: 'SaaS', description: 'Software as a service' },
  { id: 'ai', label: 'AI', description: 'Artificial intelligence product' },
  { id: 'marketplace', label: 'Marketplace', description: 'Two-sided platform' },
  { id: 'agency', label: 'Agency / Consulting', description: 'Service-based business' },
  { id: 'other', label: 'Other', description: 'Something else entirely' },
] as const

const vcOptions = [
  { id: 'yes', label: 'Yes', description: 'Actively raising or plan to' },
  { id: 'maybe', label: 'Maybe', description: 'Considering it' },
  { id: 'no', label: 'No', description: 'Bootstrapping' },
] as const

const founderCounts = [
  { id: 'solo', label: 'Solo' },
  { id: '2_5', label: '2–5' },
  { id: '6_plus', label: '6+' },
] as const

const equityOptions = [
  { id: 'yes', label: 'Yes' },
  { id: 'maybe', label: 'Maybe' },
  { id: 'no', label: 'No' },
] as const

interface FounderIntentStepProps {
  data: Partial<FounderIntentData>
  onNext: (data: FounderIntentData) => void
}

export default function FounderIntentStep({
  data,
  onNext,
}: FounderIntentStepProps) {
  const form = useForm<FounderIntentData>({
    defaultValues: {
      product_type: data.product_type || undefined,
      founder_location: data.founder_location || undefined,
      founder_state: data.founder_state || undefined,
      planning_to_raise_vc: data.planning_to_raise_vc || undefined,
      number_of_founders: data.number_of_founders || undefined,
      equity_plans: data.equity_plans || undefined,
    },
  })

  const [productType, setProductType] = useState<string | null>(
    data.product_type || null,
  )
  const [vcPlan, setVcPlan] = useState<string | null>(
    data.planning_to_raise_vc || null,
  )
  const [founderCount, setFounderCount] = useState<string | null>(
    data.number_of_founders || null,
  )
  const [equityPlan, setEquityPlan] = useState<string | null>(
    data.equity_plans || null,
  )

  const founderLocation = form.watch('founder_location')

  const onSubmit = useCallback(() => {
    const founderLocation = form.getValues('founder_location')
    const founderState = form.getValues('founder_state')

    const merged = {
      product_type: productType || form.getValues('product_type'),
      founder_location: founderLocation,
      founder_state: founderState,
      planning_to_raise_vc: vcPlan || form.getValues('planning_to_raise_vc'),
      number_of_founders: founderCount || form.getValues('number_of_founders'),
      equity_plans: equityPlan || form.getValues('equity_plans'),
    }

    const result = founderIntentSchema.safeParse(merged)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof FounderIntentData
        form.setError(field, { message: issue.message })
      }
      return
    }
    onNext(result.data as FounderIntentData)
  }, [onNext, form, productType, vcPlan, founderCount, equityPlan])

  return (
    <Form {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="flex w-full flex-col gap-y-10"
      >
        {/* Product type */}
        <FadeUp className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <Label className="text-sm font-medium">What are you building?</Label>
            <p className=" text-xs text-gray-400">
              This helps us recommend the right entity type.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {productTypes.map((type) => (
              <button
                key={type.id}
                type="button"
                onClick={() => {
                  setProductType(type.id)
                  form.setValue('product_type', type.id as FounderIntentData['product_type'])
                }}
                className={twMerge(
                  ' flex cursor-pointer flex-col gap-y-1.5 rounded-2xl border border-gray-200 bg-white p-5 text-left transition-all',
                  productType === type.id
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
          <FormField
            control={form.control}
            name="product_type"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </FadeUp>

        {/* Founder location */}
        <FadeUp className="flex flex-col gap-y-4">
          <Label className="text-sm font-medium">Where are you located?</Label>
          <FormField
            control={form.control}
            name="founder_location"
            render={({ field }) => (
              <FormItem>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select location..." />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="non_us">Outside US</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          {founderLocation === 'us' && (
            <FormField
              control={form.control}
              name="founder_state"
              render={({ field }) => (
                <FormItem>
                  <Label className="text-sm font-medium">Which state?</Label>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select state..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {US_STATES.map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </FadeUp>

        {/* Venture capital */}
        <FadeUp className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <Label className="text-sm font-medium">Planning to raise venture capital?</Label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {vcOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setVcPlan(option.id)
                  form.setValue('planning_to_raise_vc', option.id as FounderIntentData['planning_to_raise_vc'])
                }}
                className={twMerge(
                  ' flex cursor-pointer flex-col items-center gap-y-1.5 rounded-2xl border border-gray-200 bg-white p-5 text-center transition-all',
                  vcPlan === option.id
                    ? 'border-blue-500 ring-1 ring-blue-500'
                    : 'hover:border-gray-300',
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                <span className=" text-xs text-gray-400">
                  {option.description}
                </span>
              </button>
            ))}
          </div>
          <FormField
            control={form.control}
            name="planning_to_raise_vc"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </FadeUp>

        {/* Number of founders */}
        <FadeUp className="flex flex-col gap-y-4">
          <Label className="text-sm font-medium">How many founders?</Label>
          <div className="flex flex-wrap gap-2.5">
            {founderCounts.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setFounderCount(option.id)
                  form.setValue('number_of_founders', option.id as FounderIntentData['number_of_founders'])
                }}
                className={twMerge(
                  ' cursor-pointer rounded-full border border-gray-200 px-4 py-2 text-sm transition-all',
                  founderCount === option.id
                    ? 'border-blue-500 bg-blue-50 text-blue-600  '
                    : 'hover:border-gray-300',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <FormField
            control={form.control}
            name="number_of_founders"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </FadeUp>

        {/* Equity plans */}
        <FadeUp className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <Label className="text-sm font-medium">Plan to issue equity (stock options, SAFEs)?</Label>
            <p className=" text-xs text-gray-400">
              Common for startups hiring engineers or raising capital.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {equityOptions.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setEquityPlan(option.id)
                  form.setValue('equity_plans', option.id as FounderIntentData['equity_plans'])
                }}
                className={twMerge(
                  ' cursor-pointer rounded-full border border-gray-200 px-4 py-2 text-sm transition-all',
                  equityPlan === option.id
                    ? 'border-blue-500 bg-blue-50 text-blue-600  '
                    : 'hover:border-gray-300',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <FormField
            control={form.control}
            name="equity_plans"
            render={() => (
              <FormItem>
                <FormMessage />
              </FormItem>
            )}
          />
        </FadeUp>

        {/* Submit */}
        <FadeUp className="flex flex-col gap-y-4 pt-2">
          <Button type="submit" size="lg">
            Continue
          </Button>
        </FadeUp>
      </form>
    </Form>
  )
}
