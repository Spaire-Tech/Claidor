'use client'

import CopyToClipboardButton from '@/components/CopyToClipboardButton/CopyToClipboardButton'
import { FormResource } from '@/hooks/queries/forms'
import { CONFIG } from '@/utils/config'

const CopyField = ({
  label,
  value,
  multiline = false,
}: {
  label: string
  value: string
  multiline?: boolean
}) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-sm font-medium text-gray-700">{label}</label>
    <div className="flex items-start gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
      {multiline ? (
        <textarea
          readOnly
          value={value}
          rows={3}
          className="w-full resize-none bg-transparent font-mono text-xs text-gray-600 focus:outline-none"
        />
      ) : (
        <input
          readOnly
          value={value}
          className="w-full bg-transparent text-sm text-gray-600 focus:outline-none"
        />
      )}
      <CopyToClipboardButton text={value} />
    </div>
  </div>
)

export const EmbedFormModalContent = ({ form }: { form: FormResource }) => {
  const url = `${CONFIG.FRONTEND_BASE_URL}/embed/forms/${form.id}`
  const snippet = `<iframe src="${url}" width="100%" height="600" style="border:0;max-width:480px" loading="lazy" title="${form.title}"></iframe>`

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Embed this form</h2>
        <p className="mt-1 text-sm text-gray-500">
          Paste the snippet onto any website to capture emails there.{' '}
          {form.status !== 'published'
            ? 'Publish the form first so visitors can see it.'
            : ''}
        </p>
      </div>
      <CopyField label="Public link" value={url} />
      <CopyField label="Embed snippet" value={snippet} multiline />
    </div>
  )
}
