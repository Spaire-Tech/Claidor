'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const CROP_FRAME = 320 // visible crop area in CSS px (square)
const OUTPUT_SIZE = 512 // produced JPEG side length
const MIN_ZOOM = 1
const MAX_ZOOM = 3

type Props = {
  // What to position: a freshly-picked File, or the URL of the existing avatar
  // (so clicking the avatar re-opens this panel to reposition it).
  src: File | string
  onSave: (blob: Blob) => void | Promise<void>
  onCancel: () => void
  // "Replace" opens the file picker to choose a new image.
  onReplace: () => void
  // "Delete" removes the avatar entirely (only shown when one exists).
  onDelete?: () => void
  // Mirrors the Space's dark theme. The modal portals to <body> (outside the
  // editor's `.space-dark` root), so it carries its own marker class — its
  // Tailwind utilities then theme via the shared space-dark remap.
  dark?: boolean
  // 'builder' renders the masterclass builder's chrome (always-dark surfaces
  // with the ce-accent blue) — used by the course landing editor, which lives
  // inside the always-dark course builder. The default keeps the Space look.
  variant?: 'space' | 'builder'
}

/**
 * Native HTML canvas avatar positioner. Shows the image inside a square frame
 * with drag-to-reposition + a zoom slider, and outputs a centred 512×512 JPEG
 * so the avatar always renders cleanly.
 *
 * Opens both for a freshly-picked File and for the existing avatar URL (click
 * the avatar again to reposition). Footer carries Replace + Delete.
 *
 * Note on zoom: the preview <img> is sized larger than the frame and clipped.
 * Tailwind Preflight sets `img { max-width: 100% }`, which would clamp the
 * width while the inline height stayed fixed — squashing the image. We pin
 * `maxWidth/maxHeight: none` so zoom scales instead of stretching.
 */
export const AvatarCropModal = ({
  src,
  onSave,
  onCancel,
  onReplace,
  onDelete,
  dark = false,
  variant = 'space',
}: Props) => {
  const builder = variant === 'builder'
  const [imgUrl, setImgUrl] = useState<string | null>(null)
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const dragRef = useRef<{
    startX: number
    startY: number
    x: number
    y: number
    pid: number
  } | null>(null)

  // Decode the source (File or URL) into an Image we can draw to canvas.
  useEffect(() => {
    setImgEl(null)
    setError(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })

    const isFile = typeof src !== 'string'
    const url = isFile ? URL.createObjectURL(src) : src
    setImgUrl(url)

    const img = new Image()
    // Remote avatars must be CORS-enabled to export the cropped canvas; our
    // CDN sends the header. If it can't, we surface a recoverable error.
    if (!isFile) img.crossOrigin = 'anonymous'
    img.onload = () => setImgEl(img)
    img.onerror = () =>
      setError(
        isFile
          ? "We couldn't read this image in your browser. If it's a HEIC photo, export it as JPEG first."
          : "We couldn't load this image to reposition it. Try Replace to upload a new one.",
      )
    img.src = url

    return () => {
      if (isFile) URL.revokeObjectURL(url)
    }
  }, [src])

  // baseScale fills the frame edge-to-edge at zoom = 1 (cover).
  const baseScale = imgEl
    ? Math.max(CROP_FRAME / imgEl.naturalWidth, CROP_FRAME / imgEl.naturalHeight)
    : 1
  const scale = baseScale * zoom
  const dispW = imgEl ? imgEl.naturalWidth * scale : 0
  const dispH = imgEl ? imgEl.naturalHeight * scale : 0

  const clamp = useCallback(
    (next: { x: number; y: number }) => {
      const maxX = Math.max(0, (dispW - CROP_FRAME) / 2)
      const maxY = Math.max(0, (dispH - CROP_FRAME) / 2)
      return {
        x: Math.max(-maxX, Math.min(maxX, next.x)),
        y: Math.max(-maxY, Math.min(maxY, next.y)),
      }
    },
    [dispW, dispH],
  )

  // Re-clamp the offset whenever the displayed image size changes (zoom, or the
  // image just finished loading).
  useEffect(() => {
    setOffset((prev) => clamp(prev))
  }, [clamp])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!imgEl) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      x: offset.x,
      y: offset.y,
      pid: e.pointerId,
    }
  }
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pid !== e.pointerId) return
    setOffset(
      clamp({
        x: drag.x + (e.clientX - drag.startX),
        y: drag.y + (e.clientY - drag.startY),
      }),
    )
  }
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pid === e.pointerId) {
      e.currentTarget.releasePointerCapture(e.pointerId)
      dragRef.current = null
    }
  }

  const handleSave = async () => {
    if (!imgEl || saving) return
    setSaving(true)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT_SIZE
      canvas.height = OUTPUT_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setError("Your browser doesn't support image cropping. Try Chrome or Safari.")
        return
      }
      // Source rect in image-natural pixels: the square visible inside the crop
      // frame. centre-of-image − offset/scale gives the current crop centre.
      const sourceSide = CROP_FRAME / scale
      const cx = imgEl.naturalWidth / 2 - offset.x / scale
      const cy = imgEl.naturalHeight / 2 - offset.y / scale
      const sx = cx - sourceSide / 2
      const sy = cy - sourceSide / 2
      ctx.drawImage(
        imgEl,
        sx,
        sy,
        sourceSide,
        sourceSide,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE,
      )
      let blob: Blob | null = null
      try {
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.92),
        )
      } catch {
        // Tainted canvas (CORS) — only possible when repositioning an existing
        // remote avatar whose host didn't send CORS headers.
        blob = null
      }
      if (!blob) {
        setError(
          'Could not save this crop. Use Replace to upload the image again.',
        )
        return
      }
      await onSave(blob)
    } finally {
      setSaving(false)
    }
  }

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Position your avatar"
    >
      <div
        className={
          builder
            ? 'flex w-[440px] max-w-full flex-col gap-5 rounded-2xl bg-[#1c1c1e] p-7 text-[#f5f5f7] shadow-2xl ring-1 ring-white/10'
            : `flex w-[420px] max-w-full flex-col gap-4 rounded-2xl bg-white p-6 shadow-2xl${
                dark ? ' space-dark' : ''
              }`
        }
      >
        <div>
          {builder && (
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#2997ff]">
              Profile picture
            </div>
          )}
          <h2
            className={
              builder
                ? 'text-xl font-semibold tracking-tight text-[#f5f5f7]'
                : 'text-lg font-semibold text-gray-900'
            }
          >
            Position your avatar
          </h2>
          <p
            className={
              builder
                ? 'mt-1.5 text-[13px] leading-relaxed text-[#9a9aa2]'
                : 'mt-1 text-sm text-gray-500'
            }
          >
            Drag to reposition, slide to zoom. Saved at 512×512.
          </p>
        </div>

        {error ? (
          <div
            className={
              builder
                ? 'rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400 ring-1 ring-red-500/25'
                : 'rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'
            }
          >
            {error}
          </div>
        ) : !imgEl ? (
          <div
            className={
              builder
                ? 'self-center animate-pulse rounded-2xl bg-white/10'
                : 'self-center animate-pulse rounded-2xl bg-gray-100'
            }
            style={{ width: CROP_FRAME, height: CROP_FRAME }}
          />
        ) : (
          <div
            className={
              builder
                ? 'relative self-center cursor-grab overflow-hidden rounded-2xl bg-black select-none ring-1 ring-white/10 active:cursor-grabbing'
                : 'relative self-center cursor-grab overflow-hidden rounded-2xl bg-gray-900 select-none active:cursor-grabbing'
            }
            style={{ width: CROP_FRAME, height: CROP_FRAME, touchAction: 'none' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl ?? ''}
              alt=""
              draggable={false}
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: dispW,
                height: dispH,
                // Defeat Tailwind Preflight's `img { max-width:100% }`, which
                // would clamp the width and squash the image.
                maxWidth: 'none',
                maxHeight: 'none',
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                pointerEvents: 'none',
              }}
            />
            {/* Subtle inner border to show the crop bounds */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/30"
            />
          </div>
        )}

        <div className={builder ? 'flex flex-col gap-2' : 'flex flex-col gap-1'}>
          <label
            htmlFor="avatar-zoom"
            className={
              builder
                ? 'text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9a9aa2]'
                : 'text-xs font-medium text-gray-700'
            }
          >
            Zoom
          </label>
          <input
            id="avatar-zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            disabled={!imgEl}
            className="w-full"
            style={builder ? { accentColor: '#2997ff' } : undefined}
          />
        </div>

        {/* Footer — Replace / Delete on the left, Cancel / Save on the right. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onReplace}
              disabled={saving}
              className={
                builder
                  ? 'rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-[#f5f5f7] hover:bg-white/15 disabled:opacity-50'
                  : 'rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50'
              }
            >
              Replace
            </button>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                disabled={saving}
                className={
                  builder
                    ? 'rounded-full px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50'
                    : 'rounded-xl px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50'
                }
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className={
                builder
                  ? 'rounded-full px-4 py-2 text-sm font-medium text-[#9a9aa2] hover:bg-white/10 disabled:opacity-50'
                  : 'rounded-xl px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-100 disabled:opacity-50'
              }
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!imgEl || saving}
              className={
                builder
                  ? 'rounded-full bg-[#2997ff] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1a85f0] disabled:opacity-50'
                  : 'rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50'
              }
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
