'use client'

import {
  DEFAULT_FORM_STYLE,
  FormResource,
  FormStatus,
  FormStyle,
  useCreateForm,
  useUpdateForm,
} from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import Switch from '@spaire/ui/components/atoms/Switch'
import TextArea from '@spaire/ui/components/atoms/TextArea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { DashboardBody } from '../Layout/DashboardLayout'
import { toast } from '../Toast/use-toast'
import { getStatusRedirect } from '../Toast/utils'
import { FormImageUpload } from './FormImageUpload'
import { LeadMagnetUpload } from './LeadMagnetUpload'

export type FormBuilderValues = {
  title: string
  subtitle: string
  button_label: string
  success_message: string
  status: FormStatus
  file_id: string | null
  // UI-only: the attached file's display name, stripped before submit.
  lead_magnet_name: string | null
  image_url: string | null
  style: FormStyle
  attached_custom_fields: { custom_field_id: string; required: boolean }[]
}

const LabeledField = ({
  label,
  count,
  max,
  children,
}: {
  label: string
  count?: number
  max?: number
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {max !== undefined ? (
        <span className="text-xs text-gray-400">
          {count ?? 0}/{max}
        </span>
      ) : null}
    </div>
    {children}
  </div>
)

const Section = ({
  title,
  description,
  children,
}: {
  title?: string
  description?: string
  children: React.ReactNode
}) => (
  <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 p-6">
    {title || description ? (
      <div>
        {title ? (
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        ) : null}
        {description ? (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        ) : null}
      </div>
    ) : null}
    {children}
  </div>
)

const toDefaults = (initialForm?: FormResource): FormBuilderValues =>
  initialForm
    ? {
        title: initialForm.title,
        subtitle: initialForm.subtitle ?? '',
        button_label: initialForm.button_label,
        success_message: initialForm.success_message ?? '',
        status: initialForm.status,
        file_id: initialForm.file_id,
        lead_magnet_name: initialForm.file_id ? 'Attached file' : null,
        image_url: initialForm.image_url,
        style: initialForm.style ?? DEFAULT_FORM_STYLE,
        attached_custom_fields: initialForm.attached_custom_fields.map((f) => ({
          custom_field_id: f.custom_field_id,
          required: f.required,
        })),
      }
    : {
        title: '',
        subtitle: '',
        button_label: 'Submit',
        success_message: '',
        status: 'draft',
        file_id: null,
        lead_magnet_name: null,
        image_url: null,
        style: DEFAULT_FORM_STYLE,
        attached_custom_fields: [],
      }

export interface FormBuilderProps {
  organization: schemas['Organization']
  initialForm?: FormResource
  splitMode?: boolean
  onChange?: (values: Partial<FormBuilderValues>) => void
}

export const FormBuilder = ({
  organization,
  initialForm,
  splitMode,
  onChange,
}: FormBuilderProps) => {
  const router = useRouter()
  const form = useForm<FormBuilderValues>({
    defaultValues: toDefaults(initialForm),
  })
  const { control, handleSubmit, setValue } = form

  const createForm = useCreateForm()
  const updateForm = useUpdateForm()
  const isSubmitting = createForm.isPending || updateForm.isPending

  // Lift specific fields up for the live preview. Watching named fields (not
  // the whole form) keeps the references stable so the effect doesn't loop.
  const title = useWatch({ control, name: 'title' })
  const subtitle = useWatch({ control, name: 'subtitle' })
  const buttonLabel = useWatch({ control, name: 'button_label' })
  const leadMagnetName = useWatch({ control, name: 'lead_magnet_name' })
  const imageUrl = useWatch({ control, name: 'image_url' })
  const styleValue = useWatch({ control, name: 'style' }) ?? DEFAULT_FORM_STYLE
  const attachedCustomFields = useWatch({
    control,
    name: 'attached_custom_fields',
  })

  useEffect(() => {
    onChange?.({
      title,
      subtitle,
      button_label: buttonLabel,
      lead_magnet_name: leadMagnetName,
      image_url: imageUrl,
      style: styleValue,
      attached_custom_fields: attachedCustomFields,
    })
  }, [
    title,
    subtitle,
    buttonLabel,
    leadMagnetName,
    imageUrl,
    styleValue,
    attachedCustomFields,
    onChange,
  ])

  const setStyle = (patch: Partial<FormStyle>) =>
    setValue('style', { ...styleValue, ...patch }, { shouldDirty: true })

  const onSubmit = async (values: FormBuilderValues) => {
    const payload = {
      title: values.title,
      subtitle: values.subtitle.trim() || null,
      button_label: values.button_label,
      success_message: values.success_message.trim() || null,
      status: 'published' as const,
      file_id: values.file_id,
      image_url: values.image_url,
      style: { ...values.style, corner: 'sharp' as const },
      attached_custom_fields: values.attached_custom_fields.map((f) => ({
        custom_field_id: f.custom_field_id,
        required: f.required,
      })),
    }
    try {
      if (initialForm) {
        await updateForm.mutateAsync({ id: initialForm.id, body: payload })
      } else {
        await createForm.mutateAsync({
          ...payload,
          organization_id: organization.id,
        })
      }
      router.push(
        getStatusRedirect(
          initialForm
            ? `/dashboard/${organization.slug}/products/lead-magnets`
            : `/dashboard/${organization.slug}/storefront`,
          initialForm ? 'Lead magnet updated' : 'Lead magnet created',
          initialForm
            ? 'Your lead magnet was updated successfully.'
            : 'Your lead magnet was created. Add it to your Space.',
        ),
      )
    } catch (e) {
      toast({
        title: 'Error',
        description:
          e instanceof Error ? e.message : 'Failed to save the form.',
      })
    }
  }

  const content = (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="flex flex-col gap-6 pb-12"
      >
        <Section>
          <FormField
            control={control}
            name="title"
            rules={{ required: 'A title is required', maxLength: 50 }}
            render={({ field }) => (
              <FormItem>
                <LabeledField
                  label="Title"
                  count={field.value?.length ?? 0}
                  max={50}
                >
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={50}
                      placeholder="Get My FREE Guide Now!"
                    />
                  </FormControl>
                </LabeledField>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="subtitle"
            render={({ field }) => (
              <FormItem>
                <LabeledField
                  label="Subtitle"
                  count={field.value?.length ?? 0}
                  max={100}
                >
                  <FormControl>
                    <TextArea
                      {...field}
                      maxLength={100}
                      placeholder="Join my email list and never miss an update from me!"
                      resizable={false}
                    />
                  </FormControl>
                </LabeledField>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="button_label"
            rules={{ required: 'A button label is required', maxLength: 30 }}
            render={({ field }) => (
              <FormItem>
                <LabeledField
                  label="Button"
                  count={field.value?.length ?? 0}
                  max={30}
                >
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={30}
                      placeholder="SUBMIT & DOWNLOAD"
                    />
                  </FormControl>
                </LabeledField>
                <FormMessage />
              </FormItem>
            )}
          />
        </Section>

        <Section
          title="Cover image"
          description="Shown beside the form and on your Space card."
        >
          <FormImageUpload
            organization={organization}
            imageUrl={imageUrl ?? null}
            onChange={(url) => setValue('image_url', url, { shouldDirty: true })}
            position={styleValue.media_position}
            onPositionChange={(media_position) => setStyle({ media_position })}
          />
        </Section>

        <Section
          title="Lead magnet"
          description="The file delivered to subscribers after they submit."
        >
          <LeadMagnetUpload
            organization={organization}
            fileName={leadMagnetName ?? null}
            onChange={(fileId, fileName) => {
              setValue('file_id', fileId, { shouldDirty: true })
              setValue('lead_magnet_name', fileName, { shouldDirty: true })
            }}
          />
        </Section>

        <Section title="Style" description="Layout of the form card.">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Image side
              </label>
              <Select
                value={styleValue.media_side}
                onValueChange={(v) =>
                  setStyle({ media_side: v as FormStyle['media_side'] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Left</SelectItem>
                  <SelectItem value="right">Right</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-row items-center justify-between">
              <label className="text-sm font-medium text-gray-700">
                Consent checkbox
              </label>
              <Switch
                checked={styleValue.show_consent}
                onCheckedChange={(v) => setStyle({ show_consent: v })}
              />
            </div>
          </div>
        </Section>

        <div className="flex flex-row items-center gap-2">
          <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
            {initialForm ? 'Save changes' : 'Create lead magnet'}
          </Button>
        </div>
      </form>
    </Form>
  )

  if (splitMode) {
    return (
      <div className="flex flex-col gap-6 px-8 py-8">
        <h1 className="text-xl font-semibold text-gray-900">
          {initialForm ? 'Edit lead magnet' : 'New lead magnet'}
        </h1>
        {content}
      </div>
    )
  }

  return (
    <DashboardBody title={initialForm ? 'Edit lead magnet' : 'New lead magnet'}>
      {content}
    </DashboardBody>
  )
}
