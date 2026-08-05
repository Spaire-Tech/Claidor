'use client'

import { Upload } from '@/components/FileUpload/Upload'
import { schemas } from '@spaire/client'
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import { useRef, useState } from 'react'

// Once a URL or Embed has fetched a preview, this form lets the
// creator edit the auto-fetched fields (cover / title / description)
// before committing the link to the Space. Replaces the old "click +
// and it's saved as-is" flow that gave the creator no chance to
// override the OG-scraped values.

export type LinkDraft = {
  url: string
  title: string
  description: string
  image_url: string | null
}

const uploadCover = (
  organization: schemas['Organization'],
  file: File,
): Promise<string | null> =>
  new Promise((resolve) => {
    const upload = new Upload({
      organization,
      service: 'storefront_link',
      file,
      onFileProcessing: () => {},
      onFileCreate: () => {},
      onFileUploadProgress: () => {},
      onFileUploaded: (response) => {
        resolve(
          (response as schemas['StorefrontLinkFileRead']).public_url ?? null,
        )
      },
      onFileError: () => resolve(null),
    })
    upload.run()
  })

export const LinkEditForm = ({
  organization,
  initial,
  ctaLabel = 'Add to Space',
  onSubmit,
  onBack,
}: {
  organization: schemas['Organization']
  initial: LinkDraft
  ctaLabel?: string
  onSubmit: (draft: LinkDraft) => void
  onBack: () => void
}) => {
  const [draft, setDraft] = useState<LinkDraft>(initial)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const onPickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const url = await uploadCover(organization, file)
    setUploading(false)
    if (url) setDraft((d) => ({ ...d, image_url: url }))
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="wg-tab">
      <button type="button" className="wg-back" onClick={onBack}>
        ← Back
      </button>

      <div className="flex flex-col gap-4">
        {/* Cover image — clickable big box, falls back to preview thumb. */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Cover image
            <span className="ml-1.5 normal-case tracking-normal text-[10px] font-normal text-gray-400">
              Displays as 16:9 on your Space
            </span>
          </label>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-2xl border border-black/10 bg-white"
            style={
              draft.image_url
                ? {
                    backgroundImage: `url(${draft.image_url})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                  }
                : undefined
            }
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
              className="hidden"
              onChange={onPickCover}
            />
            {!draft.image_url && !uploading && (
              <div className="flex flex-col items-center gap-2 text-gray-400">
                <AddPhotoAlternateOutlined style={{ fontSize: 28 }} />
                <span className="text-xs">Upload image</span>
              </div>
            )}
            {uploading && (
              <div className="flex flex-col items-center gap-2 bg-white/80 p-2 text-xs text-gray-600">
                Uploading…
              </div>
            )}
            {draft.image_url && !uploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-gray-900">
                  Replace image
                </span>
              </div>
            )}
          </button>
          {draft.image_url && (
            <button
              type="button"
              onClick={() => setDraft((d) => ({ ...d, image_url: null }))}
              className="mt-2 text-xs text-gray-400 hover:text-gray-600"
            >
              Remove image
            </button>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Title
          </label>
          <input
            type="text"
            value={draft.title}
            onChange={(e) =>
              setDraft((d) => ({ ...d, title: e.target.value }))
            }
            placeholder={initial.title || 'Title'}
            className="atsp-form-input"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-semibold tracking-wide text-gray-500 uppercase">
            Description
          </label>
          <textarea
            value={draft.description}
            onChange={(e) =>
              setDraft((d) => ({ ...d, description: e.target.value }))
            }
            placeholder="Short description…"
            rows={3}
            className="atsp-form-input resize-none"
          />
        </div>

        <div className="wg-footer">
          <button
            type="button"
            className="wg-cta"
            onClick={() => onSubmit(draft)}
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
