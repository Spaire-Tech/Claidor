'use client'

import { FormResource } from '@/hooks/queries/forms'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useState } from 'react'
import { FormBuilder, FormBuilderValues } from './FormBuilder'
import { FormPreviewPanel } from './FormPreviewPanel'

/**
 * Full-screen split layout for building a lead-magnet form — builder on the
 * left, live preview on the right (mirrors the product creation page).
 */
export const CreateFormSplitPage = ({
  organization,
  initialForm,
}: {
  organization: schemas['Organization']
  initialForm?: FormResource
}) => {
  const [preview, setPreview] = useState<Partial<FormBuilderValues>>({})

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left panel — builder (fixed width, scrolls) */}
      <div className="flex w-full shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white md:w-[460px]">
        <div className="border-b border-gray-200 px-6 py-4">
          <Link
            href={`/dashboard/${organization.slug}/products/lead-magnets`}
            className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-black"
          >
            <ArrowBackOutlined fontSize="small" />
            <span>Back to Lead Magnets</span>
          </Link>
        </div>
        <div className="overflow-y-auto">
          <FormBuilder
            organization={organization}
            initialForm={initialForm}
            splitMode
            onChange={setPreview}
          />
        </div>
      </div>

      {/* Right panel — live preview (takes the rest of the page) */}
      <div className="hidden flex-1 flex-col overflow-y-auto p-10 md:flex">
        <div className="m-auto w-full max-w-4xl">
          <FormPreviewPanel organization={organization} values={preview} />
        </div>
      </div>
    </div>
  )
}
