'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// Tag input with full scrollable dropdown. Used for skills + languages.
// The dropdown is portaled to document.body so it isn't clipped by the
// EditPopover body's `overflow-y: auto`.

export const TagInput = ({
  value,
  onChange,
  options,
  placeholder,
  allowCustom = false,
}: {
  value: string[]
  onChange: (tags: string[]) => void
  options: string[]
  placeholder: string
  allowCustom?: boolean
}) => {
  const [search, setSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [coords, setCoords] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const filtered = options.filter(
    (o) => !value.includes(o) && o.toLowerCase().includes(search.toLowerCase()),
  )

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setSearch('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (allowCustom && e.key === 'Enter' && search.trim()) {
      e.preventDefault()
      addTag(search)
    }
  }

  // Track input position so the portaled dropdown follows it through
  // scroll / resize / popover layout shifts.
  useLayoutEffect(() => {
    if (!showDropdown) return
    const update = () => {
      const el = inputRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setCoords({ left: rect.left, top: rect.bottom, width: rect.width })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [showDropdown])

  // Avoid SSR portal errors.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="relative">
      {value.length > 0 && (
        <div className="mb-2 flex flex-row flex-wrap gap-1.5">
          {value.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-x-1 rounded-full bg-gray-100 px-2.5 py-1 text-[12px] text-gray-700"
            >
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="ml-0.5 text-gray-400 hover:text-gray-600"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0066cc] focus:outline-none focus:ring-0"
        />
      </div>
      {mounted &&
        showDropdown &&
        filtered.length > 0 &&
        coords &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              left: coords.left,
              top: coords.top + 4,
              width: coords.width,
              zIndex: 1000,
            }}
            className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
          >
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange([...value, option])
                  setSearch('')
                }}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                {option}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
