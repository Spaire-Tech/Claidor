'use client'

import {
  SOCIAL_PLATFORMS,
  getSocialPlatform,
} from '@/components/Profile/socialPlatforms'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import Public from '@mui/icons-material/Public'
import { schemas } from '@spaire/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@spaire/ui/components/atoms/Select'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { isValidSocialUrl, normalizeSocialUrl } from './utils'

type SocialLink = schemas['OrganizationSocialLink']

export const SocialLinkRow = ({
  social,
  onUpdate,
  onRemove,
}: {
  social: SocialLink
  onUpdate: (social: SocialLink) => void
  onRemove: () => void
}) => {
  const currentPlatform = getSocialPlatform(social.platform)
  const Icon = currentPlatform?.Icon ?? Public
  const [touched, setTouched] = useState(false)
  const showError = touched && !isValidSocialUrl(social.url)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-row items-center gap-2">
        <Select
          value={social.platform}
          onValueChange={(v) =>
            onUpdate({ ...social, platform: v as SocialLink['platform'] })
          }
        >
          <SelectTrigger className="h-10 w-[140px] shrink-0">
            <div className="flex items-center gap-x-2">
              <Icon className="h-4 w-4" />
              <span className="truncate text-xs">
                {currentPlatform?.label ?? 'Other'}
              </span>
            </div>
          </SelectTrigger>
          {/* z-[100] so the dropdown opens above the editor's
              EditPopover (z-90) when this row is rendered inside one. */}
          <SelectContent className="z-[100]">
            {SOCIAL_PLATFORMS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <div className="flex items-center gap-x-2">
                  <p.Icon className="h-4 w-4" />
                  <span>{p.label}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <input
          type="url"
          value={social.url}
          onChange={(e) => onUpdate({ ...social, url: e.target.value })}
          onBlur={() => {
            setTouched(true)
            const normalized = normalizeSocialUrl(social.url)
            if (normalized !== social.url) {
              onUpdate({ ...social, url: normalized })
            }
          }}
          placeholder="https://example.com"
          aria-invalid={showError ? true : undefined}
          className={twMerge(
            'min-w-0 flex-1 rounded-xl border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0',
            showError
              ? 'border-red-300 focus:border-red-400'
              : 'border-gray-200 focus:border-[#0066cc]',
          )}
        />
        <button
          type="button"
          onClick={onRemove}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <DeleteOutlined style={{ fontSize: 18 }} />
        </button>
      </div>
      {showError && (
        <p className="pl-[152px] text-[11px] text-red-500">
          Please enter a valid URL.
        </p>
      )}
    </div>
  )
}
