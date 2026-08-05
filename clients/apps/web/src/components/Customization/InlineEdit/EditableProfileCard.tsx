'use client'

import { focalPointToObjectPosition } from '@/components/Customization/Storefront/StorefrontSidebar/utils'
import {
  LANGUAGE_OPTIONS,
  PROFILE_TITLE_OPTIONS,
  SKILL_OPTIONS,
} from '@/components/Customization/Storefront/StorefrontSidebar/constants'
import { SocialLinkRow } from '@/components/Customization/Storefront/StorefrontSidebar/SocialLinkRow'
import { TagInput } from '@/components/Customization/Storefront/StorefrontSidebar/TagInput'
import {
  type FileObject,
  useFileUpload,
} from '@/components/FileUpload'
import LogoType from '@/components/Brand/LogoType'
import {
  SOCIAL_PLATFORMS,
  getSocialIcon,
} from '@/components/Profile/socialPlatforms'
import { StorefrontLinkItem } from '@/components/Profile/StorefrontLinks'
import {
  removeSpaceItem,
  reorderSpaceItem,
  resolveSpaceItems,
  type ResolvedSpaceItem,
} from '@/components/Profile/spaceItems'
import { toast } from '@/components/Toast/use-toast'
import AddOutlined from '@mui/icons-material/AddOutlined'
import CloseOutlined from '@mui/icons-material/CloseOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import TranslateOutlined from '@mui/icons-material/TranslateOutlined'
import Verified from '@mui/icons-material/Verified'
import { isValidationError, schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Switch from '@spaire/ui/components/atoms/Switch'
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { type FileRejection } from 'react-dropzone'
import { useFormContext } from 'react-hook-form'
import { useUpdateOrganization } from '@/hooks/queries'
import { AvatarCropModal } from './AvatarCropModal'
import { Editable } from './Editable'
import { EditPopover } from './EditPopover'

// Best-effort: turn a PATCH /v1/organizations/{id} error into a short,
// readable string. Validation errors (422) have a structured `detail`
// list — surface the offending fields so users aren't left guessing
// when an auto-save silently rejects an upload.
const formatOrgUpdateError = (
  error: { detail?: unknown },
  fallback: string,
): string => {
  const detail = error.detail
  if (isValidationError(detail)) {
    return detail
      .slice(0, 2)
      .map((e) => {
        const field = e.loc.slice(1).join('.') || 'value'
        return `${field}: ${e.msg}`
      })
      .join('; ')
  }
  if (typeof detail === 'string') return detail
  return fallback
}

// Draggable thumbnail used in the highlights strip. The remove (×)
// button is a sibling element so its pointer events never trigger the
// drag listeners that live on the image itself.
const DraggableHighlight = ({
  product,
  onRemove,
}: {
  product: schemas['ProductStorefront']
  onRemove: (productId: string) => void
}) => {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    listeners,
    attributes,
  } = useSortable({ id: product.id })
  return (
    <div
      ref={setNodeRef}
      className="group relative shrink-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={product.medias[0].public_url}
        alt={product.name}
        className="h-16 w-16 cursor-grab rounded-lg object-cover"
        style={{ touchAction: 'none' }}
        draggable={false}
        {...listeners}
        {...attributes}
      />
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onRemove(product.id)
        }}
        // Center the 20px button on the image's top-right corner so it
        // reads as a "remove badge" sitting on the corner, not as a
        // chip pasted inside the image. -10px (h-5 / 2) is the magic
        // number. The carousel wrapper's pt-2 pr-2 (below) gives this
        // overhang room — without that padding the overflow-x scroll
        // container clips the badge back inside the image, which is
        // the bug the user was seeing.
        className="absolute -right-2.5 -top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-900 text-white opacity-0 shadow transition-opacity hover:bg-black focus:opacity-100 group-hover:opacity-100"
        aria-label={`Remove ${product.name} from carousel`}
      >
        <CloseOutlined style={{ fontSize: 12 }} />
      </button>
    </div>
  )
}

// Free-text title combo: user can pick from suggestions or type a
// custom title. Dropdown is portaled to document.body so the
// EditPopover's overflow: auto doesn't clip it (same fix as TagInput).
const ProfileTitleCombo = ({
  value,
  onChange,
  options,
  placeholder = 'e.g. Designer, Composer, Wedding photographer…',
}: {
  value: string
  onChange: (next: string) => void
  options: string[]
  placeholder?: string
}) => {
  const [showDropdown, setShowDropdown] = useState(false)
  const [coords, setCoords] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const filtered = options.filter((o) =>
    o.toLowerCase().includes(value.toLowerCase()),
  )

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

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0066cc] focus:outline-none focus:ring-0"
      />
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
                  onChange(option)
                  setShowDropdown(false)
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

type SocialLink = schemas['OrganizationSocialLink']

const MAX_VISIBLE_SKILLS = 4

const parseFocalPosition = (raw: string): { x: number; y: number } => {
  if (raw.includes('%') && raw.includes(' ')) {
    const [px, py] = raw.split(' ')
    return { x: parseFloat(px), y: parseFloat(py) }
  }
  return { x: 50, y: 50 }
}

/**
 * Editable variant of ProfileCard. Mirrors ProfileCard.tsx structure
 * 1:1 — same wrapper div, same banner / avatar / body grid, same
 * Tailwind classes, same gap math. The ONLY differences are:
 *
 *   - Cover image is wrapped in a hover-zone with a Replace button
 *     and a pointer-event drag handler for focal-point reposition.
 *   - Avatar is wrapped in a hover-zone with a Replace button.
 *   - Name + Description swap their <h1>/<p> for an <Editable> that
 *     keeps the same className so the visual is identical at rest.
 *   - Profile title + Skills + Languages + Available-for-work +
 *     Socials open EditPopovers when clicked.
 *
 * No bespoke layout, no bespoke margins. The card on the canvas is
 * the same card visitors see — just live.
 */
export const EditableProfileCard = ({
  organization: org,
  products = [],
}: {
  organization: schemas['Organization']
  products?: schemas['ProductStorefront'][]
}) => {
  const { watch, setValue, resetField } =
    useFormContext<schemas['OrganizationUpdate']>()
  const watched = watch()
  const settings = watched.storefront_settings ?? org.storefront_settings ?? {}
  const updateOrganization = useUpdateOrganization()

  // Sensors for the highlights-strip DnD context. Small activation
  // distance so the drag picks up the moment the pointer commits.
  const highlightSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  )

  // Read mirrors ProfileCard's read order so the visual rendering is
  // pixel-stable across both components.
  const showHeader = settings?.show_header ?? true
  const showLogo = settings?.show_logo ?? true
  const showName = settings?.show_name ?? true
  const showDescription = settings?.show_description ?? true
  const description = settings?.description ?? null
  const profileTitle = settings?.profile_title ?? null
  const skills = settings?.skills ?? []
  const languages = settings?.languages ?? []
  const availableForWork = settings?.available_for_work ?? false
  const headerFocal = settings?.header_focal_point ?? '50% 50%'

  const name = watched.name ?? org.name
  const avatarUrl = watched.avatar_url ?? org.avatar_url
  const headerUrl = settings?.header_image_url ?? null
  const socials: SocialLink[] = (watched.socials ??
    org.socials ??
    []) as SocialLink[]

  // ── Form-write helpers ───────────────────────────────────────────
  const updateName = (next: string) =>
    setValue('name', next, { shouldDirty: true })

  const updateSetting = useCallback(
    <K extends keyof NonNullable<schemas['OrganizationStorefrontSettings']>>(
      key: K,
      value: NonNullable<schemas['OrganizationStorefrontSettings']>[K],
    ) => {
      setValue(
        'storefront_settings',
        { ...settings, [key]: value },
        { shouldDirty: true },
      )
    },
    [settings, setValue],
  )

  // ── Cover image upload ─────────────────────────────────────────
  // Uploads persist immediately. The file is already on S3 once
  // `useFileUpload` calls back, so we save the URL on the org without
  // waiting for the global Publish button — otherwise users navigate
  // away thinking it saved and the image silently disappears.
  const onBannerFilesUpdated = useCallback(
    async (files: FileObject<schemas['StorefrontHeaderFileRead']>[]) => {
      if (files.length === 0) return
      const last = files[files.length - 1]
      // Only persist once the upload is fully done — `onFilesUpdated` fires on
      // every progress tick (see the avatar handler below for the same guard).
      if (last.isUploading || last.isProcessing || !last.public_url) return
      updateSetting('header_image_url', last.public_url)
      const nextSettings = {
        ...settings,
        header_image_url: last.public_url,
      } as schemas['OrganizationStorefrontSettings']
      try {
        const { error } = await updateOrganization.mutateAsync({
          id: org.id,
          body: { storefront_settings: nextSettings },
        })
        if (error) {
          toast({
            title: 'Cover save failed',
            description: formatOrgUpdateError(
              error,
              'Your cover uploaded but couldn’t be saved. Try again.',
            ),
          })
          return
        }
        setValue('storefront_settings', nextSettings, { shouldDirty: false })
        toast({ title: 'Cover updated' })
      } catch {
        toast({
          title: 'Cover save failed',
          description: 'Network error. Try again.',
        })
      }
    },
    [updateSetting, settings, setValue, updateOrganization, org.id],
  )

  const onFilesRejected = useCallback((rejections: FileRejection[]) => {
    if (rejections.length > 0) {
      toast({
        title: 'Upload failed',
        description: rejections[0].errors[0].message,
      })
    }
  }, [])

  const {
    getInputProps: getBannerInputProps,
    open: openBannerPicker,
  } = useFileUpload({
    organization: org,
    service: 'storefront_header',
    accept: {
      'image/jpeg': [],
      'image/png': [],
      'image/gif': [],
      'image/webp': [],
      'image/svg+xml': [],
      'image/heic': ['.heic'],
      'image/heif': ['.heif'],
      'image/avif': [],
      'image/bmp': [],
      'image/tiff': [],
    },
    maxSize: 10 * 1024 * 1024,
    onFilesUpdated: onBannerFilesUpdated,
    onFilesRejected,
    initialFiles: [],
  })

  // ── Avatar upload ──────────────────────────────────────────────
  // Auto-persist on upload — same rationale as the banner above. We
  // `resetField` so the form's dirty baseline now reflects the saved
  // value and the Publish button stops insisting the avatar is unsaved.
  const onAvatarFilesUpdated = useCallback(
    async (files: FileObject<schemas['OrganizationAvatarFileRead']>[]) => {
      if (files.length === 0) return
      const last = files[files.length - 1]
      // `onFilesUpdated` fires on EVERY upload tick (processing, create, each
      // progress update, done). Only act once the file is fully uploaded —
      // otherwise we'd PATCH the org + toast on every tick (the bug that made
      // the "saved" banner stack up endlessly).
      if (last.isUploading || last.isProcessing || !last.public_url) return
      setValue('avatar_url', last.public_url, { shouldDirty: true })
      try {
        const { error } = await updateOrganization.mutateAsync({
          id: org.id,
          body: { avatar_url: last.public_url },
        })
        if (error) {
          toast({
            title: 'Avatar save failed',
            description: formatOrgUpdateError(
              error,
              'Your avatar uploaded but couldn’t be saved. Try again.',
            ),
          })
          return
        }
        resetField('avatar_url', { defaultValue: last.public_url })
        toast({ title: 'Avatar updated' })
      } catch {
        toast({
          title: 'Avatar save failed',
          description: 'Network error. Try again.',
        })
      }
    },
    [setValue, resetField, updateOrganization, org.id],
  )

  // Avatar pipeline: pick → crop → upload. We bypass the dropzone's
  // built-in onDrop and call `uploadFile` ourselves with the cropped
  // JPEG so what hits S3 is always a square 512×512 image regardless
  // of input format (HEIC, AVIF, etc. just have to decode locally).
  const { uploadFile: uploadAvatarFile } = useFileUpload({
    organization: org,
    service: 'organization_avatar',
    accept: undefined,
    maxSize: 5 * 1024 * 1024,
    onFilesUpdated: onAvatarFilesUpdated,
    onFilesRejected,
    initialFiles: [],
  })

  const avatarInputRef = useRef<HTMLInputElement | null>(null)
  // What the crop/reposition modal is editing: a freshly-picked File, the
  // existing avatar URL (click the avatar to reposition), or nothing (closed).
  const [avatarEditSrc, setAvatarEditSrc] = useState<File | string | null>(null)
  // Remember the last full-resolution file picked this session so re-opening
  // the positioner repositions the original, not the downscaled crop.
  const originalAvatarFileRef = useRef<File | null>(null)

  const openAvatarPicker = () => avatarInputRef.current?.click()

  // Click the avatar: reposition the existing one (seeded with the original
  // file when we still have it, otherwise the saved URL); pick a file if empty.
  const onAvatarClick = () => {
    if (avatarUrl) {
      setAvatarEditSrc(originalAvatarFileRef.current ?? avatarUrl)
    } else {
      openAvatarPicker()
    }
  }

  const onAvatarInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset the input value so picking the same file twice in a row
    // still fires onChange.
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Unsupported file',
        description: 'Please choose an image.',
      })
      return
    }
    originalAvatarFileRef.current = file
    setAvatarEditSrc(file)
  }

  const onAvatarCropSave = (blob: Blob) => {
    const cropped = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
    uploadAvatarFile(cropped)
    setAvatarEditSrc(null)
  }

  // Remove the avatar entirely (Delete in the positioner).
  const onAvatarDelete = async () => {
    setAvatarEditSrc(null)
    originalAvatarFileRef.current = null
    setValue('avatar_url', null, { shouldDirty: true })
    try {
      const { error } = await updateOrganization.mutateAsync({
        id: org.id,
        body: { avatar_url: null },
      })
      if (error) {
        toast({ title: 'Could not remove avatar', description: 'Try again.' })
        return
      }
      resetField('avatar_url', { defaultValue: null })
      toast({ title: 'Avatar removed' })
    } catch {
      toast({ title: 'Could not remove avatar', description: 'Network error.' })
    }
  }

  // ── Cover drag-to-reposition ───────────────────────────────────
  const coverPos = parseFocalPosition(headerFocal)
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

  const onCoverPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!headerUrl) return
    // Don't hijack pointer events that originated on the hover-control
    // buttons (Replace, etc.). setPointerCapture on the parent would
    // otherwise eat the click before it reaches the button.
    if ((e.target as HTMLElement).closest('.hover-controls')) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    setIsDragging(true)
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: coverPos.x,
      posY: coverPos.y,
      width: rect.width,
      height: rect.height,
      pointerId: e.pointerId,
    }
  }

  // Live preview position during drag — stays in local state so the
  // form isn't dirtied 60 times per second. We commit to form state
  // (and storefront_settings.header_focal_point) ONCE on pointerup.
  const [dragFocal, setDragFocal] = useState<{ x: number; y: number } | null>(
    null,
  )

  const onCoverPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId || !isDragging) return
    const dxPct = ((e.clientX - drag.startX) / drag.width) * 100
    const dyPct = ((e.clientY - drag.startY) / drag.height) * 100
    const newX = Math.max(0, Math.min(100, drag.posX - dxPct))
    const newY = Math.max(0, Math.min(100, drag.posY - dyPct))
    setDragFocal({ x: newX, y: newY })
  }

  const onCoverPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag && e.currentTarget.hasPointerCapture(drag.pointerId)) {
      e.currentTarget.releasePointerCapture(drag.pointerId)
    }
    if (dragFocal) {
      updateSetting(
        'header_focal_point',
        `${dragFocal.x.toFixed(1)}% ${dragFocal.y.toFixed(1)}%`,
      )
      setDragFocal(null)
    }
    setIsDragging(false)
    dragRef.current = null
  }

  // ── Popover state ──────────────────────────────────────────────
  type PopoverKey =
    | 'profileTitle'
    | 'skills'
    | 'languages'
    | 'available'
    | 'socials'
    | null
  const [popover, setPopover] = useState<PopoverKey>(null)
  const contactUrl = settings?.contact_url ?? ''
  const [contactDraft, setContactDraft] = useState(contactUrl)

  // ─────────────────────────────────────────────────────────────────
  // Layout MUST match Profile/ProfileCard.tsx 1:1. Any wrapper / class
  // change here and the editor canvas drifts from the public render.
  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      {/* Banner — same aspect ratio + classes as ProfileCard. The
          hover-zone wraps the same <div className="relative"> so
          ProfileCard's 16/5 aspect stays intact; the file input is
          sibling so it doesn't affect layout. */}
      {showHeader && (
        <div
          className="hover-zone editable-image relative"
          onPointerDown={onCoverPointerDown}
          onPointerMove={onCoverPointerMove}
          onPointerUp={onCoverPointerUp}
          onPointerCancel={onCoverPointerUp}
          style={{
            cursor: headerUrl
              ? isDragging
                ? 'grabbing'
                : 'grab'
              : 'pointer',
          }}
        >
          <input {...getBannerInputProps()} />
          {headerUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={headerUrl}
              alt=""
              className="aspect-[16/5] w-full object-cover"
              style={{
                objectPosition: dragFocal
                  ? `${dragFocal.x.toFixed(1)}% ${dragFocal.y.toFixed(1)}%`
                  : focalPointToObjectPosition(headerFocal),
              }}
              draggable={false}
            />
          ) : (
            <button
              type="button"
              onClick={openBannerPicker}
              className="flex aspect-[16/5] w-full items-center justify-center bg-gradient-to-br from-gray-800 to-gray-950 text-sm text-white/70"
            >
              + Add a cover image
            </button>
          )}
          <div className="hover-controls">
            <button
              type="button"
              className="hc-btn"
              onClick={(e) => {
                e.stopPropagation()
                openBannerPicker()
              }}
            >
              <EditOutlined style={{ fontSize: 14 }} />
              Replace
            </button>
          </div>
        </div>
      )}

      <div className="relative flex flex-col px-6 pb-6">
        {/* Avatar — overlapping banner. Same -mt-10 / mt-6 logic and
            same h-20 w-20 dimensions as ProfileCard. The hover-zone
            wrapper doesn't change layout because it has display:
            inline-block (default) at the avatar's natural size. */}
        {showLogo && (
          <div className={showHeader ? '-mt-10' : 'mt-6'}>
            <div className="hover-zone editable-image relative inline-block">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                onChange={onAvatarInputChange}
                className="hidden"
              />
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name}
                  className="h-20 w-20 cursor-pointer rounded-xl border-4 border-white object-cover shadow-sm"
                  onClick={onAvatarClick}
                />
              ) : (
                <button type="button" onClick={onAvatarClick}>
                  <Avatar
                    className="h-20 w-20 rounded-xl border-4 border-white text-lg shadow-sm"
                    name={name}
                    avatar_url={null}
                  />
                </button>
              )}
              <div className="hover-controls">
                <button
                  type="button"
                  className="hc-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAvatarClick()
                  }}
                >
                  <EditOutlined style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Profile title label + Name + Verified.
            ProfileCard renders the eyebrow only when profileTitle is
            set. We add a dashed placeholder when empty so creators
            can discover the field. The container's gap-y-0.5 + mt is
            preserved. */}
        {showName && (
          <div className={`flex flex-col gap-y-0.5 ${showLogo ? 'mt-5' : 'mt-6'}`}>
            {profileTitle ? (
              <button
                type="button"
                onClick={() => setPopover('profileTitle')}
                className="self-start text-[11px] font-semibold tracking-widest text-emerald-600 uppercase"
              >
                {profileTitle}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setPopover('profileTitle')}
                className="self-start text-[11px] font-semibold tracking-widest text-gray-300 uppercase"
              >
                + Add a title
              </button>
            )}
            <div className="flex flex-row items-center gap-x-1.5">
              <Editable
                as="h1"
                className="text-[26px] font-bold leading-tight text-gray-950"
                value={name}
                onCommit={(v) => v && updateName(v)}
                placeholder="Your name"
              />
              <Verified className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        )}

        {/* Description — same mt-4, same text-[14px] leading-relaxed
            text-gray-500. Editable swaps the underlying <p> for a
            contentEditable but inherits the same classes. */}
        {showDescription && (
          <Editable
            as="p"
            className="mt-4 text-[14px] leading-relaxed text-gray-500"
            value={description ?? ''}
            onCommit={(v) => updateSetting('description', v || null)}
            placeholder="Introduce yourself in a sentence or two."
            multiline
            maxLength={160}
          />
        )}

        {/* Available-for-work + Languages row.
            ProfileCard hides this row entirely when both are empty;
            the editor always shows it so creators can discover both
            affordances. Pills use the SAME chip styling as
            ProfileCard. */}
        <div className="mt-4 flex flex-row flex-wrap items-center gap-2">
          {availableForWork ? (
            <button
              type="button"
              onClick={() => {
                setContactDraft(contactUrl)
                setPopover('available')
              }}
              className="rounded-full border border-blue-200 px-3 py-1 text-[12px] font-medium text-[#0066cc] transition-colors hover:bg-blue-50"
            >
              Work with me
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setContactDraft(contactUrl)
                setPopover('available')
              }}
              className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-[12px] text-gray-400 hover:border-gray-400"
            >
              + Work with me
            </button>
          )}
          {languages.length > 0 ? (
            <button
              type="button"
              onClick={() => setPopover('languages')}
              className="flex flex-row items-center gap-x-1.5 rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-500 hover:border-gray-300"
            >
              <TranslateOutlined style={{ fontSize: 14 }} />
              {languages.length <= 2
                ? languages.join(', ')
                : `${languages[0]}, ${languages.length - 1} more`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPopover('languages')}
              className="flex flex-row items-center gap-x-1.5 rounded-full border border-dashed border-gray-300 px-3 py-1 text-[12px] text-gray-400 hover:border-gray-400"
            >
              <TranslateOutlined style={{ fontSize: 14 }} />
              Languages
            </button>
          )}
        </div>

        {/* Skill tags — mirror ProfileCard's mt-3 + flex layout +
            individual chips. Each chip is the same size/border, but
            the row is wrapped in a button click target that opens the
            popover. */}
        {skills.length > 0 ? (
          <button
            type="button"
            onClick={() => setPopover('skills')}
            className="mt-3 flex flex-row flex-wrap gap-2 self-start text-left"
          >
            {skills.slice(0, MAX_VISIBLE_SKILLS).map((skill: string) => (
              <span
                key={skill}
                className="rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-600"
              >
                {skill}
              </span>
            ))}
            {skills.length > MAX_VISIBLE_SKILLS && (
              <span className="rounded-full border border-gray-200 px-3 py-1 text-[12px] text-gray-400">
                +{skills.length - MAX_VISIBLE_SKILLS}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPopover('skills')}
            className="mt-3 flex flex-row gap-2 self-start"
          >
            <span className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-[12px] text-gray-400">
              + Add skills
            </span>
          </button>
        )}

        {/* Social icons — same mt-4 + flex-row + gap-x-3. Read-only
            icons (popover handles add/edit/remove) plus a + chip. */}
        <div className="mt-4 flex flex-row items-center gap-x-3">
          {socials.map((social, i) => {
            const Icon = getSocialIcon(social.platform)
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPopover('socials')}
                className="text-gray-800 transition-colors hover:text-gray-950"
                aria-label={social.platform}
              >
                <Icon className="h-6 w-6" />
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setPopover('socials')}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400 hover:border-gray-400 hover:text-gray-600"
            aria-label="Add or edit social links"
          >
            <AddOutlined style={{ fontSize: 14 }} />
          </button>
        </div>

        {/* Highlights — the strip of product thumbnails on the profile
            card. Scoped to product items currently on the Space (per
            the shared resolver) so hidden products, removed products,
            and items dropped via Arrange don't leak in. Drag reorders
            within the strip and writes back to `space_items`. */}
        {(() => {
          const showCardProducts = settings?.show_card_products ?? true
          if (!showCardProducts) return null
          const resolved = resolveSpaceItems({
            settings,
            products,
            links: (settings?.storefront_links ?? []) as StorefrontLinkItem[],
          })
          const productItems = resolved.filter(
            (i): i is Extract<ResolvedSpaceItem, { kind: 'product' }> =>
              i.kind === 'product',
          )
          const withImages = productItems.filter(
            (i) => i.product.medias.length > 0,
          )
          if (withImages.length === 0) return null

          const handleDragEnd = (event: DragEndEvent) => {
            const { active, over } = event
            if (!over || active.id === over.id) return
            // The SortableContext uses raw product ids (it's a
            // product-only carousel), so we wrap each into a Space
            // item key — `product:<id>` — before asking the resolver
            // to apply the reorder.
            const patch = reorderSpaceItem({
              settings,
              products,
              links: (settings?.storefront_links ?? []) as StorefrontLinkItem[],
              fromId: `product:${String(active.id)}`,
              toId: `product:${String(over.id)}`,
            })
            if (!patch) return
            setValue(
              'storefront_settings',
              {
                ...(settings ?? {}),
                ...patch,
              } as schemas['OrganizationStorefrontSettings'],
              { shouldDirty: true },
            )
          }

          const handleRemove = (productId: string) => {
            // Highlights' (×) means "take this off the Space," same as
            // the Remove button on the canvas. Drop the item from
            // space_items AND from featured_product_ids so the legacy
            // carousel-scoping path can't resurrect it.
            const links = (settings?.storefront_links ?? []) as StorefrontLinkItem[]
            const removePatch = removeSpaceItem({
              settings,
              products,
              links,
              key: `product:${productId}`,
            })
            const featuredIds = (settings?.featured_product_ids ?? []) as string[]
            setValue(
              'storefront_settings',
              {
                ...(settings ?? {}),
                ...removePatch,
                featured_product_ids: featuredIds.filter(
                  (id) => id !== productId,
                ),
              } as schemas['OrganizationStorefrontSettings'],
              { shouldDirty: true },
            )
          }

          return (
            <DndContext
              sensors={highlightSensors}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={withImages.map((entry) => entry.product.id)}
                strategy={horizontalListSortingStrategy}
              >
                {/* pt-2 / pr-2 give the corner-anchored remove badge
                    room to overhang the top-right of each thumbnail
                    without getting clipped by the horizontal scroll
                    container's vertical-axis clipping (overflow-x:
                    auto turns overflow-y into effectively auto, so the
                    badge needs intrinsic clearance — there is no
                    "overflow visible on one axis only" in CSS). */}
                <div className="mt-5 flex flex-row gap-2 overflow-x-auto pt-3 pr-3 pb-1">
                  {withImages.map((entry) => (
                    <DraggableHighlight
                      key={entry.product.id}
                      product={entry.product}
                      onRemove={handleRemove}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )
        })()}

        {/* Subscribe form — disabled-but-styled exactly like
            ProfileCard's preview state, so the canvas matches the
            visitor view. */}
        <div className="mt-5 flex flex-row gap-2">
          <input
            type="email"
            disabled
            placeholder="Subscribe (disabled in preview)"
            className="min-w-0 flex-1 cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-[13px] text-gray-400 placeholder:text-gray-400"
          />
          <button
            type="button"
            disabled
            className="shrink-0 cursor-not-allowed rounded-xl bg-blue-500 px-5 py-2.5 text-[13px] font-medium text-white opacity-50"
          >
            Subscribe
          </button>
        </div>

        <div className="mt-6 flex flex-row items-center justify-center gap-x-1.5 border-t border-gray-100 pt-4">
          <span className="text-[11px] text-gray-400">Powered by</span>
          <LogoType className="h-4" />
        </div>
      </div>

      {/* ── Popovers ────────────────────────────────────────────────── */}

      <EditPopover
        title="Profile title"
        open={popover === 'profileTitle'}
        onClose={() => setPopover(null)}
      >
        <ProfileTitleCombo
          value={profileTitle ?? ''}
          onChange={(next) =>
            updateSetting('profile_title', next.trim() === '' ? null : next)
          }
          options={PROFILE_TITLE_OPTIONS as unknown as string[]}
        />
        <p className="text-xs text-gray-500">
          Pick from suggestions or type your own. Shown above your name in
          small caps.
        </p>
      </EditPopover>

      <EditPopover
        title="Skills"
        open={popover === 'skills'}
        onClose={() => setPopover(null)}
      >
        <p className="text-xs text-gray-500">
          Pick from the list or type a custom skill and press Enter.
        </p>
        <TagInput
          value={skills}
          onChange={(tags) => updateSetting('skills', tags)}
          options={SKILL_OPTIONS}
          placeholder="eg. Figma, Blender, etc."
          allowCustom
        />
      </EditPopover>

      <EditPopover
        title="Languages"
        open={popover === 'languages'}
        onClose={() => setPopover(null)}
      >
        <TagInput
          value={languages}
          onChange={(tags) => updateSetting('languages', tags)}
          options={LANGUAGE_OPTIONS}
          placeholder="eg. English, French, etc."
        />
      </EditPopover>

      <EditPopover
        title="Work with me"
        open={popover === 'available'}
        onClose={() => setPopover(null)}
        onConfirm={() => {
          const next = contactDraft.trim()
          if (!next) {
            updateSetting('contact_url', null)
            return
          }
          // Same scheme allowlist the backend enforces (organization/
          // schemas.py:_validate_contact_url). Doing it client-side
          // means the user finds out the typo before they hit Publish.
          const scheme = next.includes(':')
            ? next.split(':', 1)[0]!.toLowerCase()
            : ''
          if (scheme !== 'http' && scheme !== 'https' && scheme !== 'mailto') {
            toast({
              title: 'Contact link not saved',
              description:
                'Must start with https://, http://, or mailto:',
            })
            return
          }
          updateSetting('contact_url', next)
        }}
      >
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div>
            <div className="text-sm font-medium text-gray-900">
              Show the badge
            </div>
            <p className="text-xs text-gray-500">
              A green pill on your Space card.
            </p>
          </div>
          <Switch
            checked={availableForWork}
            onCheckedChange={(v) => updateSetting('available_for_work', v)}
          />
        </div>
        {availableForWork && (
          <div className="flex flex-col gap-y-1.5">
            <label className="text-xs font-medium text-gray-700">
              Contact link (optional)
            </label>
            <input
              type="text"
              value={contactDraft}
              onChange={(e) => setContactDraft(e.target.value)}
              placeholder=""
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#0066cc] focus:outline-none focus:ring-0"
            />
          </div>
        )}
      </EditPopover>

      <EditPopover
        title="Social links"
        open={popover === 'socials'}
        onClose={() => {
          // Drop empty rows on close so they don't sit in form state
          // dirtying the form (and so the user doesn't have to click
          // the X on every blank row they accidentally added).
          const cleaned = socials.filter((s) => s.url?.trim())
          if (cleaned.length !== socials.length) {
            setValue('socials', cleaned, { shouldDirty: true })
          }
          setPopover(null)
        }}
      >
        <div className="flex flex-col gap-3">
          {socials.map((social, idx) => (
            <SocialLinkRow
              key={idx}
              social={social}
              onUpdate={(s) => {
                const updated = [...socials]
                updated[idx] = s
                setValue('socials', updated, { shouldDirty: true })
              }}
              onRemove={() => {
                setValue(
                  'socials',
                  socials.filter((_, i) => i !== idx),
                  { shouldDirty: true },
                )
              }}
            />
          ))}
          <button
            type="button"
            disabled={socials.length >= SOCIAL_PLATFORMS.length}
            onClick={() => {
              // Default the new row to the first platform the creator
              // hasn't already added — avoids the "two Twitters" trap.
              // Once every platform has a row, the button is disabled.
              const used = new Set(socials.map((s) => s.platform))
              const next = SOCIAL_PLATFORMS.find((p) => !used.has(p.value))
              if (!next) return
              setValue(
                'socials',
                [
                  ...socials,
                  { platform: next.value, url: '' } as SocialLink,
                ],
                { shouldDirty: true },
              )
            }}
            className="flex flex-row items-center gap-x-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-300 disabled:hover:text-gray-500"
          >
            <AddOutlined style={{ fontSize: 18 }} />
            Add social link
          </button>
        </div>
      </EditPopover>

      {avatarEditSrc !== null && (
        <AvatarCropModal
          src={avatarEditSrc}
          onSave={onAvatarCropSave}
          onCancel={() => setAvatarEditSrc(null)}
          onReplace={openAvatarPicker}
          onDelete={avatarUrl ? onAvatarDelete : undefined}
          dark={
            ((settings as { theme?: 'light' | 'dark' }).theme ?? 'light') ===
            'dark'
          }
        />
      )}
    </div>
  )
}
