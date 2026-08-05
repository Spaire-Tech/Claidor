'use client'

import { StorefrontForm } from '@/components/Profile/StorefrontForm'
import { useFormPublic } from '@/hooks/queries/forms'
import { useEffect, useRef } from 'react'

// Standalone, iframe-friendly render of a single published form. Reports its
// height to the parent window so an optional resizer script can fit the
// iframe to the content.
export const EmbedFormView = ({ formId }: { formId: string }) => {
  const { data: form, isLoading } = useFormPublic(formId)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const post = () => {
      window.parent?.postMessage(
        { type: 'spaire:embed:resize', formId, height: el.scrollHeight },
        '*',
      )
    }
    post()
    const observer = new ResizeObserver(post)
    observer.observe(el)
    return () => observer.disconnect()
  }, [formId, form])

  return (
    <div ref={ref} className="mx-auto w-full max-w-md p-4">
      {isLoading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100" />
      ) : form ? (
        <StorefrontForm form={form} />
      ) : (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          This form isn&apos;t available.
        </div>
      )}
    </div>
  )
}
