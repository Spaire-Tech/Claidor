'use client'

import { useCustomerDownloadables } from '@/hooks/queries'
import { createClientSideAPI } from '@/utils/client'
import { schemas } from '@spaire/client'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import * as React from 'react'
import {
  BookIcon,
  CheckIcon,
  DocIcon,
  DownloadIcon,
  ExternalIcon,
  HeadphonesIcon,
  VideoIcon,
} from '../_components/icons'
import { PortalLoading } from '../_components/PortalLoading'

// Backend enriches DownloadableRead with optional product fields. Cast at the
// boundary; ./hooks/queries's generic schema doesn't know about the new
// fields yet (they're additive — old consumers still work).
type EnrichedDownloadable = schemas['DownloadableRead'] & {
  product_id?: string | null
  product_name?: string | null
  product_category?:
    | 'ebook'
    | 'template'
    | 'assets'
    | 'course'
    | 'guide'
    | 'music'
    | 'video'
    | 'photo'
    | 'software'
    | 'coaching'
    | 'membership'
    | 'other'
    | null
  product_thumbnail_url?: string | null
  downloaded_count?: number
  last_downloaded_at?: string | null
}

type CategoryKey =
  | 'all'
  | 'ebooks'
  | 'guides'
  | 'templates'
  | 'audio'
  | 'video'
  | 'images'
  | 'files'

const CATEGORY_LABEL: Record<CategoryKey, string> = {
  all: 'All',
  ebooks: 'Ebooks',
  guides: 'Guides',
  templates: 'Templates',
  audio: 'Audio',
  video: 'Video',
  images: 'Images',
  files: 'Files',
}

const PRODUCT_CATEGORY_TO_KEY: Record<string, CategoryKey> = {
  ebook: 'ebooks',
  guide: 'guides',
  template: 'templates',
  music: 'audio',
  video: 'video',
  photo: 'images',
  assets: 'files',
  software: 'files',
  coaching: 'files',
  membership: 'files',
  other: 'files',
  course: 'files',
}

const categoryFromMime = (mime: string): CategoryKey => {
  const m = mime.toLowerCase()
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('image/')) return 'images'
  if (m === 'application/pdf') return 'guides'
  if (m === 'application/epub+zip') return 'ebooks'
  return 'files'
}

const categoryFor = (item: EnrichedDownloadable): CategoryKey => {
  if (item.product_category) {
    const key = PRODUCT_CATEGORY_TO_KEY[item.product_category]
    if (key && key !== 'files') return key
  }
  return categoryFromMime(item.file.mime_type)
}

const formatLabel = (mime: string): string => {
  const m = mime.toLowerCase()
  if (m === 'application/pdf') return 'PDF'
  if (m === 'application/epub+zip') return 'EPUB'
  if (m.startsWith('audio/mp3') || m === 'audio/mpeg') return 'MP3'
  if (m.startsWith('audio/wav') || m === 'audio/x-wav') return 'WAV'
  if (m.startsWith('audio/')) return 'Audio'
  if (m === 'video/mp4') return 'MP4'
  if (m.startsWith('video/')) return 'Video'
  if (m.startsWith('image/jpeg')) return 'JPG'
  if (m.startsWith('image/png')) return 'PNG'
  if (m.startsWith('image/')) return 'Image'
  if (m === 'application/zip') return 'ZIP'
  // Fall back to the subtype, capped to 4 chars (e.g. "msword" → "MSWO").
  const sub = m.split('/')[1] ?? 'file'
  return sub.slice(0, 4).toUpperCase()
}

const FormatGlyph = ({ mime }: { mime: string }) => {
  const m = mime.toLowerCase()
  if (m.startsWith('audio/')) return <HeadphonesIcon size={28} />
  if (m.startsWith('video/')) return <VideoIcon size={28} />
  if (m === 'application/epub+zip') return <BookIcon size={28} />
  return <DocIcon size={28} />
}

const formatDate = (iso: string | null | undefined): string | null => {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return null
  }
}

const DownloadCard = ({
  item,
  index,
  onDownloaded,
}: {
  item: EnrichedDownloadable
  index: number
  onDownloaded: () => void
}) => {
  const category = categoryFor(item)
  const isDownloaded = (item.downloaded_count ?? 0) > 0
  const lastLabel = formatDate(item.last_downloaded_at)
  const fmtLabel = formatLabel(item.file.mime_type)

  return (
    <article
      className="sp-card sp-dl-card sp-fade-in"
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
    >
      <div className="sp-dl-cover">
        {item.product_thumbnail_url ? (
          <img src={item.product_thumbnail_url} alt="" loading="lazy" />
        ) : (
          <div className="sp-dl-cover-fallback">
            <FormatGlyph mime={item.file.mime_type} />
          </div>
        )}
        <span className="sp-dl-format">{fmtLabel}</span>
        {isDownloaded && (
          <span
            className="sp-dl-done"
            title={`Downloaded ${item.downloaded_count}×`}
          >
            <CheckIcon size={11} />
          </span>
        )}
      </div>
      <div className="sp-dl-body">
        <h3 className="sp-card-title">
          {item.product_name || item.file.name || 'Untitled download'}
        </h3>
        <div className="sp-dl-meta">
          <span>{CATEGORY_LABEL[category]}</span>
          <span className="sp-dot-sep" aria-hidden />
          <span>{item.file.size_readable}</span>
          {lastLabel && (
            <>
              <span className="sp-dot-sep" aria-hidden />
              <span>Last grabbed {lastLabel}</span>
            </>
          )}
        </div>
        <div className="sp-dl-actions">
          <a
            className={'sp-btn' + (isDownloaded ? ' is-ghost' : '')}
            href={item.file.download.url}
            download={item.file.name}
            onClick={onDownloaded}
          >
            <DownloadIcon size={13} />
            {isDownloaded ? 'Download again' : 'Download'}
          </a>
          <a
            className="sp-btn is-ghost sp-icon-action"
            href={item.file.download.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Preview"
            aria-label="Preview"
          >
            <ExternalIcon size={12} />
          </a>
        </div>
      </div>
    </article>
  )
}

const DownloadsBody = ({
  organization: _organization,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  customerSessionToken: string
}) => {
  const api = React.useMemo(
    () => createClientSideAPI(customerSessionToken),
    [customerSessionToken],
  )

  const {
    data: downloadables,
    isLoading,
    refetch,
  } = useCustomerDownloadables(api, { limit: 100 })

  const items: EnrichedDownloadable[] =
    (downloadables?.items as EnrichedDownloadable[] | undefined) ?? []

  const [filter, setFilter] = React.useState<CategoryKey>('all')

  // Build chips from the categories that actually appear. "All" is always
  // present; the rest are sorted by descending count so the busiest
  // categories surface first.
  const counts = React.useMemo(() => {
    const map: Record<CategoryKey, number> = {
      all: items.length,
      ebooks: 0,
      guides: 0,
      templates: 0,
      audio: 0,
      video: 0,
      images: 0,
      files: 0,
    }
    for (const item of items) {
      const cat = categoryFor(item)
      map[cat] += 1
    }
    return map
  }, [items])

  const visibleCategories = React.useMemo<CategoryKey[]>(() => {
    const present = (Object.keys(counts) as CategoryKey[]).filter(
      (c) => c !== 'all' && counts[c] > 0,
    )
    present.sort((a, b) => counts[b] - counts[a])
    return ['all', ...present]
  }, [counts])

  const filtered = React.useMemo(
    () =>
      filter === 'all' ? items : items.filter((i) => categoryFor(i) === filter),
    [items, filter],
  )

  const downloadedCount = items.filter(
    (i) => (i.downloaded_count ?? 0) > 0,
  ).length

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Downloads</h1>
          {!isLoading && (
            <p className="sp-page-sub">
              {items.length === 0
                ? 'Files from your purchases will show up here.'
                : `${items.length} file${
                    items.length === 1 ? '' : 's'
                  } in your library, ${downloadedCount} downloaded`}
            </p>
          )}
        </div>
        {items.length > 0 && (
          <a
            href="#"
            className="sp-btn is-ghost"
            onClick={(e) => {
              e.preventDefault()
              // Trigger a real <a download> per file within this user gesture
              // (same mechanism as the per-row Download button). Looping
              // window.open() instead got every file after the first
              // suppressed by the popup blocker.
              for (const item of filtered) {
                const a = document.createElement('a')
                a.href = item.file.download.url
                a.download = item.file.name
                a.rel = 'noopener'
                document.body.appendChild(a)
                a.click()
                a.remove()
              }
              setTimeout(() => refetch(), 1500)
            }}
          >
            <DownloadIcon size={13} /> Download all
          </a>
        )}
      </div>

      {isLoading ? (
        <PortalLoading variant="inline" />
      ) : items.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-title">No downloads yet</div>
          <div style={{ fontSize: 13 }}>
            Files from your purchases will appear here.
          </div>
        </div>
      ) : (
        <>
          <div
            className="sp-chips"
            role="tablist"
            aria-label="Download categories"
          >
            {visibleCategories.map((c) => (
              <button
                key={c}
                role="tab"
                type="button"
                aria-selected={filter === c}
                className={'sp-chip' + (filter === c ? ' is-active' : '')}
                onClick={() => setFilter(c)}
              >
                {CATEGORY_LABEL[c]}
                <span className="sp-chip-count">{counts[c]}</span>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="sp-empty">
              <div className="sp-empty-title">
                Nothing in {CATEGORY_LABEL[filter]} yet
              </div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>
                Try a different category, or view your full library.
              </div>
              <button
                type="button"
                className="sp-btn is-ghost"
                onClick={() => setFilter('all')}
              >
                View all downloads
              </button>
            </div>
          ) : (
            <div className="sp-grid">
              {filtered.map((item, i) => (
                <DownloadCard
                  key={item.id}
                  item={item}
                  index={i}
                  onDownloaded={() => refetch()}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const DownloadsPage = ({
  organization,
  customerSessionToken,
}: {
  organization: schemas['CustomerOrganization']
  customerSessionToken: string
}) => {
  return (
    <NuqsAdapter>
      <DownloadsBody
        organization={organization}
        customerSessionToken={customerSessionToken}
      />
    </NuqsAdapter>
  )
}

export default DownloadsPage
