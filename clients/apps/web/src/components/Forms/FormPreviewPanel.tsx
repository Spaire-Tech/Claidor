'use client'

import { useCustomFields } from '@/hooks/queries'
import {
  DEFAULT_FORM_STYLE,
  type FormAttachedCustomField,
} from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import type { FormBuilderValues } from './FormBuilder'
import { LeadMagnetCard, type LeadMagnetCardForm } from './LeadMagnetCard'

export interface FormPreviewPanelProps {
  organization: schemas['Organization']
  values: Partial<FormBuilderValues>
}

export const FormPreviewPanel = ({
  organization,
  values,
}: FormPreviewPanelProps) => {
  const { data: customFields } = useCustomFields(organization.id)

  // Resolve attached field ids to full custom fields so the card can render
  // each one by type.
  const attached: FormAttachedCustomField[] = (
    values.attached_custom_fields ?? []
  )
    .map((f, index) => {
      const customField = customFields?.items.find(
        (c) => c.id === f.custom_field_id,
      )
      if (!customField) return null
      return {
        custom_field_id: f.custom_field_id,
        custom_field: customField,
        order: index,
        required: f.required,
      }
    })
    .filter((f): f is FormAttachedCustomField => f !== null)

  const cardForm: LeadMagnetCardForm = {
    title: values.title ?? '',
    subtitle: values.subtitle ? values.subtitle : null,
    button_label: values.button_label || 'Submit',
    success_message: values.success_message ? values.success_message : null,
    image_url: values.image_url ?? null,
    style: values.style ?? DEFAULT_FORM_STYLE,
    attached_custom_fields: attached,
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
        <p className="mt-1 text-sm text-gray-500">
          This is what visitors see — it updates as you edit.
        </p>
      </div>
      <LeadMagnetCard form={cardForm} interactive={false} />
    </div>
  )
}
