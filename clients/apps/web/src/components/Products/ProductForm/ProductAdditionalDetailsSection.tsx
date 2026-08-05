'use client'

import { Section } from '@/components/Layout/Section'
import ClearOutlined from '@mui/icons-material/ClearOutlined'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import { useCallback, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { ProductFormType } from './ProductForm'

// Predefined detail attribute types shown in the dropdown
export const DETAIL_OPTIONS: { value: string; label: string }[] = [
  { value: 'pages', label: 'Pages' },
  { value: 'format', label: 'Format' },
  { value: 'language', label: 'Language' },
  { value: 'level', label: 'Level' },
  { value: 'duration', label: 'Duration' },
  { value: 'file_size', label: 'File Size' },
  { value: 'words', label: 'Word Count' },
  { value: 'chapters', label: 'Chapters' },
  { value: 'dimensions', label: 'Dimensions' },
  { value: 'resolution', label: 'Resolution' },
  { value: 'size', label: 'Size' },
  { value: 'edition', label: 'Edition' },
  { value: 'release_year', label: 'Release Year' },
  { value: 'compatible_with', label: 'Compatible With' },
  { value: 'license', label: 'License' },
]

export const DETAIL_OPTION_MAP: Record<string, string> = Object.fromEntries(
  DETAIL_OPTIONS.map((o) => [o.value, o.label]),
)

// Keys that belong to "additional details" (as opposed to raw developer metadata)
export const DETAIL_KEYS = new Set(DETAIL_OPTIONS.map((o) => o.value))

export const ProductAdditionalDetailsSection = () => {
  const { watch, setValue } = useFormContext<ProductFormType>()
  const metadata = watch('metadata') ?? []

  // Entries that match known detail keys
  const details = metadata.filter((m) => DETAIL_KEYS.has(String(m.key)))
  // Other metadata (non-detail) — we preserve these when updating
  const otherMetadata = metadata.filter((m) => !DETAIL_KEYS.has(String(m.key)))

  // Keys already in use
  const usedKeys = new Set(details.map((d) => String(d.key)))

  // State for pending new row
  const [pendingKey, setPendingKey] = useState<string>('')
  const [pendingValue, setPendingValue] = useState<string>('')

  const commitPending = useCallback(() => {
    if (!pendingKey || !pendingValue.trim()) return
    const without = details.filter((d) => d.key !== pendingKey)
    setValue(
      'metadata',
      [...otherMetadata, ...without, { key: pendingKey, value: pendingValue.trim() }],
      { shouldDirty: true },
    )
    setPendingKey('')
    setPendingValue('')
  }, [pendingKey, pendingValue, details, otherMetadata, setValue])

  const updateDetail = useCallback(
    (key: string, value: string) => {
      setValue(
        'metadata',
        [
          ...otherMetadata,
          ...details.map((d) => (d.key === key ? { ...d, value } : d)),
        ],
        { shouldDirty: true },
      )
    },
    [details, otherMetadata, setValue],
  )

  const removeDetail = useCallback(
    (key: string) => {
      setValue(
        'metadata',
        [...otherMetadata, ...details.filter((d) => d.key !== key)],
        { shouldDirty: true },
      )
    },
    [details, otherMetadata, setValue],
  )

  const availableOptions = DETAIL_OPTIONS.filter((o) => !usedKeys.has(o.value))

  return (
    <Section
      title="Additional Details"
      description="Define your product with details like format, length, and level."
    >
      <div className="flex flex-col gap-4">
        {/* Existing detail rows */}
        {details.length > 0 && (
          <div className="flex flex-col gap-2">
            {details.map((detail) => (
              <div
                key={String(detail.key)}
                className="flex flex-row items-center gap-2"
              >
                <div className="w-40 shrink-0">
                  <div className=" flex h-10 items-center rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
                    {DETAIL_OPTION_MAP[String(detail.key)] ?? String(detail.key)}
                  </div>
                </div>
                <div className="flex-1">
                  <Input
                    value={String(detail.value)}
                    placeholder="Value"
                    onChange={(e) => updateDetail(String(detail.key), e.target.value)}
                  />
                </div>
                <Button
                  className="border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100"
                  size="icon"
                  variant="secondary"
                  type="button"
                  onClick={() => removeDetail(String(detail.key))}
                >
                  <ClearOutlined fontSize="inherit" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new detail row */}
        {availableOptions.length > 0 && (
          <div className="flex flex-row items-start gap-2">
            <div className="w-40 shrink-0">
              <Select
                value={pendingKey}
                onValueChange={(v) => {
                  setPendingKey(v)
                  setPendingValue('')
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select attribute" />
                </SelectTrigger>
                <SelectContent>
                  {availableOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Input
                value={pendingValue}
                placeholder={pendingKey ? `Enter ${DETAIL_OPTION_MAP[pendingKey]?.toLowerCase() ?? 'value'}` : 'Value'}
                disabled={!pendingKey}
                onChange={(e) => setPendingValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitPending()
                  }
                }}
              />
            </div>
            <Button
              size="icon"
              variant="secondary"
              type="button"
              disabled={!pendingKey || !pendingValue.trim()}
              onClick={commitPending}
            >
              <AddOutlined fontSize="inherit" />
            </Button>
          </div>
        )}

      </div>
    </Section>
  )
}
