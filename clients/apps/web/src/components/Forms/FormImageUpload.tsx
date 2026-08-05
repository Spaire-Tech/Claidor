'use client'

import { Upload } from '@/components/FileUpload/Upload'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import OpenWithOutlined from '@mui/icons-material/OpenWithOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { useCallback, useRef, useState } from 'react'

const DEFAULT_POSITION = '50% 50%'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const parsePosition = (value: string | null): { x: number; y: number } => {
  if (!value) return { x: 50, y: 50 }
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) return { x: 50, y: 50 }
  const x = parseFloat(parts[0])
  const y = parseFloat(parts[1])
  if (Number.isNaN(x) || Number.isNaN(y)) return { x: 50, y: 50 }
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) }
}

const formatPosition = (x: number, y: number) =>
  `${x.toFixed(1)}% ${y.toFixed(1)}%`

export interface FormImageUploadProps {
  organization: schemas['Organization']
  imageUrl: string | null
  onChange: (imageUrl: string | null) => void
  // Cover focal point (CSS object-position). When provided, the preview
  // becomes drag-to-reposition — matching the Space cover image.
  position?: string | null
  onPositionChange?: (position: string) => void
}

export const FormImageUpload = ({
  organization,
  imageUrl,
  onChange,
  position,
  onPositionChange,
}: FormImageUploadProps) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)

  // ── Drag-to-reposition ──────────────────────────────────────────
  const canReposition = !!onPositionChange
  const pos = parsePosition(position ?? DEFAULT_POSITION)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    posX: number
    posY: number
    width: number
    height: number
    pointerId: number
  } | null>(null)
  // Live position during drag — kept local so we only emit one change on
  // release rather than ~60 per second.
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!canReposition) return
    // Don't hijack pointer events that started on the hover buttons
    // (Replace / Remove) — capturing here would eat their click.
    if ((e.target as HTMLElement).closest('button')) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: pos.x,
      posY: pos.y,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !isDragging) return
    const dxPct = ((e.clientX - drag.startX) / drag.width) * 100
    const dyPct = ((e.clientY - drag.startY) / drag.height) * 100
    // Drag the image, not the focal point: moving right reveals the left
    // of the image, so the focal point moves the opposite way.
    const newX = clamp(drag.posX - dxPct, 0, 100)
    const newY = clamp(drag.posY - dyPct, 0, 100)
    setDragPos({ x: newX, y: newY })
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag && e.currentTarget.hasPointerCapture(drag.pointerId)) {
      e.currentTarget.releasePointerCapture(drag.pointerId)
    }
    if (dragPos) {
      onPositionChange?.(formatPosition(dragPos.x, dragPos.y))
      setDragPos(null)
    }
    setIsDragging(false)
    dragRef.current = null
  }

  const livePos = dragPos ?? pos

  const handleFile = useCallback(
    (file: File) => {
      setUploading(true)
      setProgress(0)
      const upload = new Upload({
        organization,
        service: 'product_media',
        file,
        onFileProcessing: () => {},
        onFileCreate: () => {},
        onFileUploadProgress: (f, uploaded) => {
          if (f.size > 0) setProgress(Math.round((uploaded / f.size) * 100))
        },
        onFileUploaded: (response) => {
          setUploading(false)
          setProgress(100)
          onChange((response as schemas['ProductMediaFileRead']).public_url)
          // A fresh image starts centered so the old focal point doesn't
          // crop the new picture oddly.
          onPositionChange?.(DEFAULT_POSITION)
        },
        onFileError: () => setUploading(false),
      })
      upload.run().catch(() => setUploading(false))
    },
    [organization, onChange, onPositionChange],
  )

  return (
    <div className="flex flex-col gap-2">
      {imageUrl ? (
        <>
          <div
            className="group relative overflow-hidden rounded-xl border border-gray-200 select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              cursor: canReposition
                ? isDragging
                  ? 'grabbing'
                  : 'grab'
                : 'default',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Cover"
              draggable={false}
              className="pointer-events-none h-40 w-full object-cover"
              style={{
                objectPosition: `${livePos.x}% ${livePos.y}%`,
              }}
            />
            {canReposition ? (
              <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                <span className="flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
                  <OpenWithOutlined sx={{ fontSize: 12 }} />
                  Drag to reposition
                </span>
              </div>
            ) : null}
            <div className="absolute top-2 right-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => onChange(null)}
              >
                Remove
              </Button>
            </div>
          </div>
          {canReposition ? (
            <div className="flex items-center justify-between px-0.5 text-xs text-gray-500">
              <span>Drag the image to reposition its focal point.</span>
              <button
                type="button"
                onClick={() => onPositionChange?.(DEFAULT_POSITION)}
                className="font-medium text-gray-600 hover:text-gray-900"
              >
                Reset
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-8 text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
        >
          <ImageOutlined />
          <span className="text-sm">
            {uploading ? `Uploading… ${progress}%` : 'Upload a cover image'}
          </span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}
