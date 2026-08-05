'use client'

import { useFormById } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import { CreateFormSplitPage } from './CreateFormSplitPage'

export const EditFormPage = ({
  organization,
  formId,
}: {
  organization: schemas['Organization']
  formId: string
}) => {
  const { data: form, isLoading } = useFormById(formId)

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Loading form…</p>
      </div>
    )
  }

  if (!form) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-gray-500">Form not found.</p>
      </div>
    )
  }

  return <CreateFormSplitPage organization={organization} initialForm={form} />
}
