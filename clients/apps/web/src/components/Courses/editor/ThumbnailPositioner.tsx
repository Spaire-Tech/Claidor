'use client'

import OpenWithOutlined from '@mui/icons-material/OpenWithOutlined'
import { useEffect, useRef, useState } from 'react'

interface ThumbnailPositionerProps {
  src: string
  value: string | null
  onChange: (next: string) => void
  /**
   * Fires once when the user releases the drag (mouseup / touchend) or hits
   * Reset. Pair this with a debounced PATCH so the position propagates to
   * every other site that shows the thumbnail — outline grid, landing
   * preview, customer portal — without forcing the user to click Save.
   */
  onCommit?: (next: string) => void
  className?: string
}

const DEFAULT_POSITION = '50% 50%'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const parsePosition = (value: string | null): { x: number; y: number } => {
  const fallback = { x: 50, y: 50 }
  if (!value) return fallback
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 2) return fallback
  const x = parseFloat(parts[0])
  const y = parseFloat(parts[1])
  if (Number.isNaN(x) || Number.isNaN(y)) return fallback
  return { x: clamp(x, 0, 100), y: clamp(y, 0, 100) }
}

export const formatPosition = (x: number, y: number) =>
  `${x.toFixed(1)}% ${y.toFixed(1)}%`

export const ThumbnailPositioner = ({
  src,
  value,
  onChange,
  onCommit,
  className,
}: ThumbnailPositionerProps) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(() => parsePosition(value))
  const [dragging, setDragging] = useState(false)
  const lastEmittedRef = useRef<string>(value ?? DEFAULT_POSITION)

  useEffect(() => {
    setPos(parsePosition(value))
  }, [value])

  const setFromClientPoint = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100)
    const y = clamp(((clientY - rect.top) / rect.height) * 100, 0, 100)
    setPos({ x, y })
    const next = formatPosition(x, y)
    lastEmittedRef.current = next
    onChange(next)
  }

  useEffect(() => {
    if (!dragging) return
    const handleMove = (e: MouseEvent) => {
      e.preventDefault()
      setFromClientPoint(e.clientX, e.clientY)
    }
    const handleUp = () => {
      setDragging(false)
      onCommit?.(lastEmittedRef.current)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging, onCommit])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setFromClientPoint(e.clientX, e.clientY)
    setDragging(true)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) setFromClientPoint(t.clientX, t.clientY)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (t) setFromClientPoint(t.clientX, t.clientY)
  }

  const handleTouchEnd = () => {
    onCommit?.(lastEmittedRef.current)
  }

  const reset = () => {
    setPos({ x: 50, y: 50 })
    lastEmittedRef.current = DEFAULT_POSITION
    onChange(DEFAULT_POSITION)
    onCommit?.(DEFAULT_POSITION)
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="group relative aspect-video w-full overflow-hidden rounded-xl border border-gray-200 bg-gray-100 select-none"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <img
          src={src}
          alt="Thumbnail"
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `${pos.x}% ${pos.y}%` }}
        />
        <div
          className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/15"
        />
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
            <OpenWithOutlined sx={{ fontSize: 12 }} />
            Drag to reposition
          </span>
        </div>
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black/60 shadow"
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
        <span>
          Position: {pos.x.toFixed(0)}% × {pos.y.toFixed(0)}%
        </span>
        <button
          type="button"
          onClick={reset}
          className="font-medium text-gray-600 hover:text-gray-900"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
