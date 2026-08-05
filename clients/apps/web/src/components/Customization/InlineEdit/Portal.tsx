'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children as a top-level child of document.body. Used by every
 * modal / popover in the editor so backdrop-filter can blur the entire
 * editor canvas (otherwise it gets caught in whatever ancestor stacking
 * context the modal happens to live in).
 *
 * SSR-safe: returns null until mounted.
 */
export const Portal = ({ children }: { children: ReactNode }) => {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
