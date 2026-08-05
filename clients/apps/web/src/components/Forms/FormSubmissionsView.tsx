'use client'

import { useFormById, useFormSubmissions } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import Link from 'next/link'

const formatDate = (value: string) => new Date(value).toLocaleString()

const formatValue = (
  value: string | number | boolean | null | undefined,
): string => {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export const FormSubmissionsView = ({
  organization,
  formId,
}: {
  organization: schemas['Organization']
  formId: string
}) => {
  const { data: form } = useFormById(formId)
  const { data, isLoading } = useFormSubmissions(formId, { limit: 100 })

  const submissions = data?.items ?? []
  const total = data?.pagination.total_count ?? 0
  const fields = form?.attached_custom_fields ?? []

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <Link
          href={`/dashboard/${organization.slug}/products/lead-magnets`}
          className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black"
        >
          <span aria-hidden>←</span>
          <span>Back to Lead Magnets</span>
        </Link>
      </div>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
        <h1 className="text-xl font-semibold text-gray-900">
          {form ? `${form.title} — Submissions` : 'Submissions'}
        </h1>

        <div className="rounded-2xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total submissions</p>
          <p className="text-3xl font-semibold text-gray-900">{total}</p>
        </div>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        ) : submissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-gray-500">No submissions yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  {fields.map((field) => (
                    <th
                      key={field.custom_field_id}
                      className="px-4 py-3 font-medium"
                    >
                      {field.custom_field.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.map((submission) => (
                  <tr key={submission.id} className="text-gray-900">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {formatDate(submission.created_at)}
                    </td>
                    <td className="px-4 py-3">{submission.name || '—'}</td>
                    <td className="px-4 py-3">{submission.email}</td>
                    {fields.map((field) => (
                      <td key={field.custom_field_id} className="px-4 py-3">
                        {formatValue(
                          submission.custom_field_data[field.custom_field.slug],
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
