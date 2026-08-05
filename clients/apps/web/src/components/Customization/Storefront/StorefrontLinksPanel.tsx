'use client'

import { Upload } from '@/components/FileUpload/Upload'
import { ConfirmModal } from '@/components/Modal/ConfirmModal'
import { StorefrontLinkItem } from '@/components/Profile/StorefrontLinks'
import { readSpaceItems } from '@/components/Profile/spaceItems'
import AddOutlined from '@mui/icons-material/AddOutlined'
import AddPhotoAlternateOutlined from '@mui/icons-material/AddPhotoAlternateOutlined'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import CodeOutlined from '@mui/icons-material/CodeOutlined'
import DeleteOutlined from '@mui/icons-material/DeleteOutlined'
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import GraphicEqOutlined from '@mui/icons-material/GraphicEqOutlined'
import Instagram from '@mui/icons-material/Instagram'
import LanguageOutlined from '@mui/icons-material/LanguageOutlined'
import LinkOutlined from '@mui/icons-material/LinkOutlined'
import MusicNoteOutlined from '@mui/icons-material/MusicNoteOutlined'
import PlayArrowOutlined from '@mui/icons-material/PlayArrowOutlined'
import PlayCircleOutlined from '@mui/icons-material/PlayCircleOutlined'
import ShareOutlined from '@mui/icons-material/ShareOutlined'
import StorefrontOutlined from '@mui/icons-material/StorefrontOutlined'
import WorkOutlineOutlined from '@mui/icons-material/WorkOutlineOutlined'
import YouTube from '@mui/icons-material/YouTube'
import { schemas } from '@spaire/client'
import { useCallback, useRef, useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'

import {
  detectPlatform,
  getDomain,
  isEmbeddablePlatform,
} from '../../Profile/linkPlatforms'

const TikTokIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em">
    <path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z" />
  </svg>
)

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  youtube: <YouTube style={{ fontSize: 16 }} />,
  spotify: <MusicNoteOutlined style={{ fontSize: 16 }} />,
  soundcloud: <MusicNoteOutlined style={{ fontSize: 16 }} />,
  tiktok: <TikTokIcon />,
  instagram: <Instagram style={{ fontSize: 16 }} />,
}

// ─── Image upload helper ──────────────────────────────────────────────────────

function uploadImageFile(
  organization: schemas['Organization'],
  file: File,
): Promise<string | null> {
  return new Promise((resolve) => {
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
}

// ─── Link edit card ───────────────────────────────────────────────────────────

const LinkEditCard = ({
  link,
  organization,
  isLoading,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  registerRef,
}: {
  link: StorefrontLinkItem
  organization: schemas['Organization']
  isLoading?: boolean
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (link: StorefrontLinkItem) => void
  onRemove: () => void
  registerRef?: (el: HTMLDivElement | null) => void
}) => {
  const domain = getDomain(link.url)
  const icon = link.platform ? (
    PLATFORM_ICONS[link.platform]
  ) : (
    <LinkOutlined style={{ fontSize: 16 }} />
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const url = await uploadImageFile(organization, file)
    if (url) onUpdate({ ...link, image_url: url })
    setUploadingImage(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div
      ref={registerRef}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
    >
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
        onClick={onToggle}
      >
        {link.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.image_url}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl object-cover"
          />
        ) : isLoading ? (
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-gray-100" />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-400">
            {icon}
          </div>
        )}

        <div className="min-w-0 flex-1">
          {isLoading ? (
            <div className="h-3 w-32 animate-pulse rounded bg-gray-100" />
          ) : (
            <p className="truncate text-sm font-medium text-gray-900">
              {link.title || domain}
            </p>
          )}
          <p className="truncate text-xs text-gray-400">{domain}</p>
        </div>

        {link.type === 'embedded' && (
          <span className="bg-primary/10 text-primary shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium">
            Embed
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-400"
          >
            <DeleteOutlined style={{ fontSize: 15 }} />
          </button>
          <div className="flex h-7 w-7 items-center justify-center text-gray-400">
            {isExpanded ? (
              <ExpandLessOutlined style={{ fontSize: 18 }} />
            ) : (
              <ExpandMoreOutlined style={{ fontSize: 18 }} />
            )}
          </div>
        </div>
      </div>

      {/* Expanded edit form */}
      {isExpanded && (
        <div className="flex flex-col gap-5 border-t border-gray-100 px-4 pt-4 pb-5">
          {/* Cover image */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Cover Image
            </label>
            <div className="flex items-center gap-3">
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                {link.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={link.image_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <AddPhotoAlternateOutlined
                      style={{ fontSize: 22 }}
                      className="text-gray-300"
                    />
                  </div>
                )}
                {uploadingImage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void handleImageUpload(e)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AddPhotoAlternateOutlined style={{ fontSize: 14 }} />
                  {link.image_url ? 'Change image' : 'Upload image'}
                </button>
                {link.image_url && (
                  <button
                    type="button"
                    onClick={() => onUpdate({ ...link, image_url: null })}
                    className="text-left text-xs text-gray-400 hover:text-gray-600"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Title
            </label>
            <input
              type="text"
              value={link.title ?? ''}
              onChange={(e) =>
                onUpdate({ ...link, title: e.target.value || null })
              }
              placeholder={domain}
              className="focus:border-primary w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Description
            </label>
            <textarea
              value={link.description ?? ''}
              onChange={(e) =>
                onUpdate({ ...link, description: e.target.value || null })
              }
              placeholder="Short description…"
              rows={2}
              className="focus:border-primary w-full resize-none rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Link-type metadata ──────────────────────────────────────────────────────

type LinkMode = 'url' | 'embed'

type ModeCopy = {
  label: string
  Icon: React.ComponentType<{ style?: React.CSSProperties }>
  heading: string
  description: string
  placeholder: string
  bestFor: {
    label: string
    Icon: React.ComponentType<{ style?: React.CSSProperties }>
  }[]
}

const MODE_COPY: Record<LinkMode, ModeCopy> = {
  url: {
    label: 'URL',
    Icon: LinkOutlined,
    heading: 'URL link',
    description:
      'Share any web destination — a website, affiliate link, portfolio, article, or store. Visitors open the link in a new tab.',
    placeholder: 'https://your-website.com',
    bestFor: [
      { label: 'Website', Icon: LanguageOutlined },
      { label: 'Affiliate link', Icon: ShareOutlined },
      { label: 'Portfolio', Icon: WorkOutlineOutlined },
      { label: 'Article', Icon: ArticleOutlined },
      { label: 'Store', Icon: StorefrontOutlined },
      { label: 'Other URL', Icon: CodeOutlined },
    ],
  },
  embed: {
    label: 'Embed',
    Icon: PlayCircleOutlined,
    heading: 'Embedded content',
    description:
      'Embed rich media that plays inline on your space — perfect for showcasing videos, tracks, and audio without sending visitors away.',
    placeholder: 'https://youtube.com/watch?v=…',
    bestFor: [
      { label: 'YouTube', Icon: YouTube },
      { label: 'Spotify', Icon: MusicNoteOutlined },
      { label: 'SoundCloud', Icon: GraphicEqOutlined },
      { label: 'YouTube Shorts', Icon: PlayArrowOutlined },
    ],
  },
}

// ─── Panel ────────────────────────────────────────────────────────────────────

export const StorefrontLinksPanel = ({
  organization,
  onBack,
}: {
  organization: schemas['Organization']
  onBack: () => void
}) => {
  const { watch, setValue, getValues } =
    useFormContext<schemas['OrganizationUpdate']>()
  const settings = watch('storefront_settings')
  const storefrontLinks: StorefrontLinkItem[] = ((settings as any)
    ?.storefront_links ?? []) as StorefrontLinkItem[]

  const [mode, setMode] = useState<LinkMode>('url')
  const [newUrl, setNewUrl] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [fetchingId, setFetchingId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const topRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  const scrollToTop = () => {
    requestAnimationFrame(() => {
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const copy = MODE_COPY[mode]

  const setLinks = useCallback(
    (links: StorefrontLinkItem[]) => {
      const current = getValues('storefront_settings') as any
      setValue(
        'storefront_settings',
        { ...(current ?? {}), storefront_links: links } as any,
        { shouldDirty: true },
      )
    },
    [getValues, setValue],
  )

  const switchMode = (next: LinkMode) => {
    setMode(next)
    setAddError(null)
    scrollToTop()
  }

  const addLink = useCallback(async () => {
    const url = newUrl.trim()
    if (!url) return

    // Basic URL validation up-front.
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      setAddError('Please enter a valid URL (including https://).')
      return
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      setAddError('URL must start with http:// or https://')
      return
    }

    const platform = detectPlatform(url)
    const isEmbeddable = isEmbeddablePlatform(platform?.id)

    if (mode === 'embed' && !isEmbeddable) {
      setAddError(
        "We can't embed this link inline. Switch to URL to add it as a card.",
      )
      return
    }

    const type = mode === 'embed' ? 'embedded' : 'standard'
    const id = crypto.randomUUID()
    const newLink: StorefrontLinkItem = {
      id,
      url,
      title: null,
      description: null,
      image_url: null,
      type,
      platform: platform?.id ?? null,
    }

    setNewUrl('')
    setAddError(null)
    setFetchingId(id)
    setExpandedIds((prev) => new Set([...prev, id]))

    const currentSettings =
      (getValues('storefront_settings') as any) ?? {}
    const current = (currentSettings.storefront_links ?? []) as StorefrontLinkItem[]
    // Also stitch the new link into space_items so it actually shows
    // on the Space. We deliberately do NOT auto-append "unseen" link
    // ids in the resolver anymore (see Profile/spaceItems.ts — that
    // path made removal impossible), so every add path has to write
    // space_items itself. For Spaces still on the legacy model
    // (space_items empty), the renderer derives from storefront_links
    // anyway, so we leave space_items empty in that case.
    const persistedItems = readSpaceItems(currentSettings)
    const spaceItemsPatch =
      persistedItems.length > 0
        ? {
            space_items: [
              ...persistedItems,
              { kind: 'link' as const, id: newLink.id },
            ],
          }
        : {}
    setValue(
      'storefront_settings',
      {
        ...currentSettings,
        storefront_links: [...current, newLink],
        ...spaceItemsPatch,
      } as any,
      { shouldDirty: true },
    )

    // Scroll the panel back to the top so the user sees the full flow
    // and the fresh entry sliding into the list below.
    scrollToTop()

    try {
      const res = await fetch(
        `/api/link-preview?url=${encodeURIComponent(url)}`,
      )
      if (res.ok) {
        const meta = await res.json()
        const latest =
          (getValues('storefront_settings') as any)?.storefront_links ?? []
        setLinks(
          (latest as StorefrontLinkItem[]).map((l) =>
            l.id === id
              ? {
                  ...l,
                  title: meta.title ?? null,
                  description: meta.description ?? null,
                  image_url: meta.image_url ?? null,
                }
              : l,
          ),
        )
      }
    } catch {}

    setFetchingId(null)
  }, [newUrl, mode, getValues, setLinks])

  const updateLink = useCallback(
    (updated: StorefrontLinkItem) => {
      const current =
        (getValues('storefront_settings') as any)?.storefront_links ?? []
      setLinks(
        (current as StorefrontLinkItem[]).map((l) =>
          l.id === updated.id ? updated : l,
        ),
      )
    },
    [getValues, setLinks],
  )

  const removeLink = useCallback(
    (id: string) => {
      const currentSettings =
        (getValues('storefront_settings') as any) ?? {}
      const current = (currentSettings.storefront_links ?? []) as StorefrontLinkItem[]
      // Drop the link from storefront_links AND from space_items so
      // the renderer can't resurrect it from the materialised order.
      // Same caveat as addLink: only patch space_items when it's
      // already populated; legacy-mode Spaces let it stay empty so
      // the resolver keeps deriving from storefront_links.
      const persistedItems = readSpaceItems(currentSettings)
      const spaceItemsPatch =
        persistedItems.length > 0
          ? {
              space_items: persistedItems.filter(
                (i) => !(i.kind === 'link' && i.id === id),
              ),
            }
          : {}
      setValue(
        'storefront_settings',
        {
          ...currentSettings,
          storefront_links: current.filter((l) => l.id !== id),
          ...spaceItemsPatch,
        } as any,
        { shouldDirty: true },
      )
      setExpandedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    },
    [getValues, setValue],
  )

  // Confirm before removing a link. The delete button (h-7 w-7 next to
  // the chevron) is easy to mis-tap, and the link's metadata + cover are
  // not recoverable.
  const [pendingLinkRemoval, setPendingLinkRemoval] = useState<string | null>(
    null,
  )
  const pendingLink =
    pendingLinkRemoval !== null
      ? storefrontLinks.find((l) => l.id === pendingLinkRemoval)
      : null

  const toggleExpanded = (id: string) => {
    let opening = false
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        opening = true
      }
      return next
    })
    if (opening) {
      // Wait two frames so the expanded content is in the DOM before measuring.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          cardRefs.current
            .get(id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }),
      )
    }
  }

  const urlLinks = storefrontLinks.filter((l) => l.type === 'standard')
  const embedLinks = storefrontLinks.filter((l) => l.type === 'embedded')
  const activeList = mode === 'embed' ? embedLinks : urlLinks

  return (
    <>
      {/* Fixed back arrow — always reachable, pinned to viewport top-left */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="fixed top-20 left-6 z-40 hidden h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 md:flex"
      >
        <ArrowBackOutlined style={{ fontSize: 20 }} />
      </button>

      <div className="flex h-full flex-col">
        {/* Scrollable body — roomy padding, generous gaps */}
        <div className="flex flex-1 flex-col gap-10 overflow-y-auto px-2 pt-2 pb-6">
          {/* Anchor used to scroll the panel back to the top. */}
          <div ref={topRef} aria-hidden className="-mb-10 h-0 scroll-mt-24" />

          {/* Type picker */}
          <div className="flex flex-col gap-5">
            <h3 className="text-lg font-semibold text-gray-900">
              What type of link
            </h3>
            <div className="grid grid-cols-2 gap-4">
              {(Object.keys(MODE_COPY) as LinkMode[]).map((key) => {
                const { Icon, label } = MODE_COPY[key]
                const isActive = mode === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchMode(key)}
                    className={twMerge(
                      'flex items-center justify-center gap-2.5 rounded-2xl border-2 px-4 py-5 text-sm font-medium transition-all',
                      isActive
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-700',
                    )}
                  >
                    <Icon style={{ fontSize: 20 }} />
                    {label}
                  </button>
                )
              })}
            </div>

            {/* Description */}
            <div className="flex flex-col gap-1.5">
              <p className="text-base font-semibold text-gray-900">
                {copy.heading}
              </p>
              <p className="text-sm leading-relaxed text-gray-500">
                {copy.description}
              </p>
            </div>

            {/* Best for */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Best for
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {copy.bestFor.map(({ label, Icon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-2.5 text-sm text-gray-700"
                  >
                    <Icon style={{ fontSize: 18 }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Add link input */}
          <div className="flex flex-col gap-3 border-t border-gray-100 pt-8">
            <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
              Add {copy.label} link
            </label>
            <div className="flex gap-2.5">
              <input
                type="url"
                value={newUrl}
                onChange={(e) => {
                  setNewUrl(e.target.value)
                  if (addError) setAddError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void addLink()
                  }
                }}
                placeholder={copy.placeholder}
                className={twMerge(
                  'min-w-0 flex-1 rounded-xl border bg-white px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none',
                  addError
                    ? 'border-red-300 focus:border-red-400'
                    : 'focus:border-primary border-gray-200',
                )}
              />
              <button
                type="button"
                onClick={() => void addLink()}
                disabled={!newUrl.trim()}
                className="bg-primary flex h-[46px] shrink-0 items-center gap-1.5 rounded-xl px-5 text-sm font-medium text-white transition-opacity hover:opacity-85 disabled:cursor-default disabled:opacity-40"
              >
                <AddOutlined style={{ fontSize: 16 }} />
                Add
              </button>
            </div>
            {addError ? (
              <p className="text-xs text-red-500">{addError}</p>
            ) : (
              <p className="text-xs text-gray-400">
                {mode === 'embed'
                  ? 'Paste a YouTube, Spotify, or SoundCloud link to embed it inline.'
                  : 'Paste any https:// link — we’ll fetch its title, description, and cover automatically.'}
              </p>
            )}
          </div>

          {/* Links list — scoped to current mode */}
          {activeList.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
                <LinkOutlined
                  style={{ fontSize: 24 }}
                  className="text-gray-400"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">
                  No {copy.label.toLowerCase()} links yet
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Paste a URL above to add your first{' '}
                  {mode === 'embed' ? 'embed' : 'link'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
                Your {copy.label} links
              </label>
              <div className="flex flex-col gap-3">
                {activeList.map((link) => (
                  <LinkEditCard
                    key={link.id}
                    link={link}
                    organization={organization}
                    isLoading={fetchingId === link.id}
                    isExpanded={expandedIds.has(link.id)}
                    onToggle={() => toggleExpanded(link.id)}
                    onUpdate={updateLink}
                    onRemove={() => setPendingLinkRemoval(link.id)}
                    registerRef={(el) => {
                      if (el) cardRefs.current.set(link.id, el)
                      else cardRefs.current.delete(link.id)
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Hint when the other mode has items */}
          {mode === 'url' && embedLinks.length > 0 && (
            <button
              type="button"
              onClick={() => switchMode('embed')}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3.5 text-left text-xs text-gray-500 transition-colors hover:bg-gray-100"
            >
              <span>
                You also have {embedLinks.length} embed
                {embedLinks.length !== 1 ? 's' : ''}
              </span>
              <span className="text-primary font-medium">
                Switch to Embed →
              </span>
            </button>
          )}
          {mode === 'embed' && urlLinks.length > 0 && (
            <button
              type="button"
              onClick={() => switchMode('url')}
              className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3.5 text-left text-xs text-gray-500 transition-colors hover:bg-gray-100"
            >
              <span>
                You also have {urlLinks.length} URL link
                {urlLinks.length !== 1 ? 's' : ''}
              </span>
              <span className="text-primary font-medium">Switch to URL →</span>
            </button>
          )}
        </div>
      </div>

      <ConfirmModal
        isShown={pendingLinkRemoval !== null}
        hide={() => setPendingLinkRemoval(null)}
        title="Remove this link?"
        description={
          pendingLink
            ? `${pendingLink.title || getDomain(pendingLink.url)} will be removed from your Space along with its cover image and metadata.`
            : ''
        }
        destructive
        destructiveText="Remove link"
        onConfirm={() => {
          if (pendingLinkRemoval) removeLink(pendingLinkRemoval)
          setPendingLinkRemoval(null)
        }}
      />
    </>
  )
}
