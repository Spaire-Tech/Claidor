'use client'

import { CourseRead } from '@/hooks/queries/courses'
import { useUpdateOrganization } from '@/hooks/queries/org'
import { schemas } from '@spaire/client'
import { cn } from '@spaire/ui/lib/utils'
import { useMutation } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '../../Toast/use-toast'
// Reuse the *real* customer-portal sign-in stylesheet so this canvas is
// genuinely WYSIWYG — same split layout, tokens, type scale the customer sees.
import '../../../app/(main)/[organization]/portal/_auth/portal-auth.css'

const SIGN_IN_IMAGE_PATH = (organizationId: string) =>
  `${process.env.NEXT_PUBLIC_API_URL}/v1/organizations/${organizationId}/customer-portal-sign-in-image`

const DEFAULT_POSITION = '50% 50%'

type Theme = 'light' | 'dark'

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

const parsePosition = (p: string): { x: number; y: number } => {
  const [a, b] = p.split(/\s+/)
  const x = parseFloat(a)
  const y = parseFloat(b)
  return { x: Number.isNaN(x) ? 50 : x, y: Number.isNaN(y) ? 50 : y }
}

const MoonIcon = () => (
  <svg
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
)

const SunIcon = () => (
  <svg
    width="19"
    height="19"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2.6M12 19.4V22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M2 12h2.6M19.4 12H22M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
  </svg>
)

/**
 * Course-builder "Auth" tab.
 *
 * Renders the *real* customer-portal sign-in screen full-bleed under the tabs
 * (same component styling the customer sees) and edits it in place like the
 * Landing canvas: add a cover photo, drag to reposition, replace/remove, and
 * choose the light/dark appearance. Everything autosaves.
 *
 * The portal sign-in is org-scoped, so the image + theme apply to the creator's
 * whole portal (every product and course), not just this course. When no image
 * is uploaded the portal falls back to a course cover — the canvas shows this
 * course's cover as that default.
 */
export function AuthTab({
  course,
  organization,
}: {
  course: CourseRead
  organization: schemas['Organization']
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(
    organization.customer_portal_sign_in_image_url ?? null,
  )
  const [position, setPosition] = useState<string>(
    organization.customer_portal_sign_in_image_position ?? DEFAULT_POSITION,
  )
  const [theme, setTheme] = useState<Theme>(
    organization.customer_portal_sign_in_theme === 'dark' ? 'dark' : 'light',
  )
  const [dragging, setDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const visualRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{
    clientX: number
    clientY: number
    posX: number
    posY: number
  } | null>(null)
  const positionRef = useRef(position)
  useEffect(() => {
    positionRef.current = position
  }, [position])

  const updateOrg = useUpdateOrganization()

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(SIGN_IN_IMAGE_PATH(organization.id), {
        method: 'POST',
        body: form,
        credentials: 'include',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<schemas['Organization']>
    },
    onSuccess: (data) => {
      setImageUrl(data.customer_portal_sign_in_image_url ?? null)
      setPosition(
        data.customer_portal_sign_in_image_position ?? DEFAULT_POSITION,
      )
      toast({ title: 'Sign-in image updated' })
    },
    onError: (err) => {
      toast({
        title: 'Failed to upload image',
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const remove = useMutation({
    mutationFn: async () => {
      const res = await fetch(SIGN_IN_IMAGE_PATH(organization.id), {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`API ${res.status}: ${text}`)
      }
      return res.json() as Promise<schemas['Organization']>
    },
    onSuccess: (data) => {
      setImageUrl(data.customer_portal_sign_in_image_url ?? null)
      setPosition(
        data.customer_portal_sign_in_image_position ?? DEFAULT_POSITION,
      )
      toast({ title: 'Sign-in image removed' })
    },
    onError: (err) => {
      toast({
        title: 'Failed to remove image',
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })

  const handleFiles = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        toast({ title: 'Please choose an image file' })
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'Image must be under 10 MB' })
        return
      }
      upload.mutate(file)
    },
    [upload],
  )

  const usingCustom = !!imageUrl
  const previewUrl = imageUrl ?? course.thumbnail_url ?? null
  // Reposition applies to the uploaded image. While showing the course-cover
  // fallback, we mirror that course's own object-position (read-only).
  const activePosition = usingCustom
    ? position
    : (course.thumbnail_object_position ?? DEFAULT_POSITION)

  const commitPosition = useCallback(() => {
    updateOrg.mutate({
      id: organization.id,
      body: { customer_portal_sign_in_image_position: positionRef.current },
    })
  }, [updateOrg, organization.id])

  const chooseTheme = useCallback(
    (next: Theme) => {
      if (next === theme) return
      setTheme(next)
      updateOrg.mutate({
        id: organization.id,
        body: { customer_portal_sign_in_theme: next },
      })
    },
    [theme, updateOrg, organization.id],
  )

  // Drag-to-reposition: grab-and-move (the image follows the cursor), live
  // while dragging, persisted on release. Only active for an uploaded image
  // (the fallback course cover is read-only here).
  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      e.preventDefault()
      const el = visualRef.current
      const start = dragStart.current
      if (!el || !start) return
      const rect = el.getBoundingClientRect()
      // % the cursor has travelled across the frame…
      const dx = ((e.clientX - start.clientX) / rect.width) * 100
      const dy = ((e.clientY - start.clientY) / rect.height) * 100
      // …and move the image WITH it: dragging right reveals the left of the
      // photo, which means object-position decreases.
      const nx = clamp(start.posX - dx, 0, 100)
      const ny = clamp(start.posY - dy, 0, 100)
      setPosition(`${nx.toFixed(1)}% ${ny.toFixed(1)}%`)
    }
    const onUp = () => {
      setDragging(false)
      dragStart.current = null
      commitPosition()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging, commitPosition])

  const onVisualMouseDown = (e: React.MouseEvent) => {
    if (!usingCustom || !visualRef.current) return
    e.preventDefault()
    const { x, y } = parsePosition(positionRef.current)
    dragStart.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      posX: x,
      posY: y,
    }
    setDragging(true)
  }

  const busy = upload.isPending || remove.isPending || updateOrg.isPending
  const dark = theme === 'dark'

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Slim status bar — mirrors the Landing tab + the creator theme control. */}
      <div className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[12px] text-gray-500">Customer portal</span>
          <span className="text-[13px] text-gray-400">›</span>
          <span className="truncate text-[13px] font-medium text-gray-900">
            Sign-in page
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span
            className="text-[11.5px] text-gray-400"
            role="status"
            aria-live="polite"
          >
            {busy ? 'Saving…' : 'Changes save automatically'}
          </span>
          <a
            href={`/${organization.slug}/portal/request`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-200 bg-white px-3 py-[6px] text-[12px] font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Preview ↗
          </a>
        </div>
      </div>

      {/* Full-bleed real sign-in canvas. */}
      <div className="flex-1 overflow-hidden">
        <div
          className={cn('spaire-portal', dark && 'sp-dark')}
          style={{ height: '100%' }}
        >
          <div className="spauth spauth--embed">
            {/* LEFT — the editable photo */}
            <div
              ref={visualRef}
              className={cn(
                'spauth-visual',
                usingCustom && 'spauth-visual--editable',
                dragging && 'spauth-dragging',
              )}
              {...(previewUrl ? { 'data-filled': '' } : {})}
              onMouseDown={onVisualMouseDown}
            >
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="spauth-visual-img"
                  src={previewUrl}
                  alt=""
                  draggable={false}
                  style={{ objectPosition: activePosition }}
                />
              )}
              <div className="spauth-scrim" />
              <div className="spauth-brand">{organization.name}</div>

              {/* empty state — no upload and no course cover to fall back to */}
              {!previewUrl && (
                <div
                  className="spauth-empty"
                  onClick={() => !busy && fileInputRef.current?.click()}
                >
                  <div className="spauth-empty-icon">
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="9" cy="9" r="2" />
                      <path d="m21 15-3.5-3.5L8 21" />
                    </svg>
                  </div>
                  <div className="spauth-empty-title">Add a cover photo</div>
                  <div className="spauth-empty-sub">
                    Click to upload the image your customers see when they sign
                    in. Applies to your whole portal.
                  </div>
                </div>
              )}

              {/* reposition hint (only when an uploaded image is draggable) */}
              {usingCustom && (
                <div className="spauth-edit-hint">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
                  </svg>
                  Drag to reposition
                </div>
              )}

              {/* floating controls, centered so they're seen. Stop mousedown
                  from starting a reposition drag so clicks register. */}
              {previewUrl && (
                <div
                  className="spauth-edit-tools"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="spauth-edit-btn"
                    onClick={() => !busy && fileInputRef.current?.click()}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 9a8 8 0 0 1 13.6-3.2L20 8M20 4v4h-4" />
                      <path d="M20 15a8 8 0 0 1-13.6 3.2L4 16M4 20v-4h4" />
                    </svg>
                    {usingCustom ? 'Replace image' : 'Upload image'}
                  </button>
                  {usingCustom && (
                    <button
                      type="button"
                      className="spauth-edit-btn spauth-edit-btn--danger"
                      onClick={() => !busy && remove.mutate()}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleFiles(e.target.files?.[0])
                  e.target.value = ''
                }}
              />
            </div>

            {/* RIGHT — non-interactive preview of the flow, with the
                creator's appearance toggle (the icon) top-right */}
            <div className="spauth-panel spauth-panel--preview">
              <div className="spauth-topbar">
                <button
                  type="button"
                  className="spauth-toggle"
                  onClick={() => chooseTheme(dark ? 'light' : 'dark')}
                  aria-label={
                    dark ? 'Switch to light mode' : 'Switch to dark mode'
                  }
                  title={dark ? 'Light mode' : 'Dark mode'}
                >
                  {dark ? <SunIcon /> : <MoonIcon />}
                </button>
              </div>
              <div className="spauth-stage">
                <div className="spauth-inner">
                  <h1 className="spauth-title">Sign in</h1>
                  <p className="spauth-sub">
                    Enter your email address to access your purchases. A
                    verification code will be sent to you.
                  </p>
                  <div className="spauth-field">
                    <label className="spauth-field-label">Email address</label>
                    <div
                      className="spauth-field-input"
                      style={{ lineHeight: '54px' }}
                    >
                      <span style={{ color: 'var(--au-t3)' }}>
                        you@example.com
                      </span>
                    </div>
                  </div>
                  <div className="spauth-btn">Send code</div>
                  <p className="spauth-footnote">
                    By continuing you agree to the Terms &amp; Privacy Policy.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* status footer: which image is in use */}
      <div className="flex h-9 flex-shrink-0 items-center justify-between border-t border-gray-200 bg-white px-4 text-[12px] text-gray-500">
        <span>
          {usingCustom
            ? 'Using your uploaded image. Drag the photo to reposition.'
            : previewUrl
              ? "Using this course's cover as the default. Upload an image to customize."
              : 'No image yet — add a cover photo or set a course cover in Settings.'}
        </span>
      </div>
    </div>
  )
}
