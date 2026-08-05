'use client'

import { schemas } from '@spaire/client'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import * as React from 'react'

type SavedBookmark = {
  lessonId: string
  courseId: string
  organizationSlug: string
  lessonTitle: string
  courseTitle: string | null
  thumbnailUrl: string | null
  durationSeconds: number | null
  savedAt: string
  storageKey: string
}

const BOOKMARK_PREFIX = 'polar:bookmark:'

const formatMinSec = (seconds: number | null): string => {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

const readBookmarks = (organizationSlug: string): SavedBookmark[] => {
  if (typeof window === 'undefined') return []
  const out: SavedBookmark[] = []
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i)
    if (!key || !key.startsWith(BOOKMARK_PREFIX)) continue
    const raw = window.localStorage.getItem(key)
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Partial<SavedBookmark>
      if (
        !parsed.lessonId ||
        !parsed.courseId ||
        !parsed.organizationSlug ||
        parsed.organizationSlug !== organizationSlug
      ) {
        continue
      }
      out.push({
        lessonId: parsed.lessonId,
        courseId: parsed.courseId,
        organizationSlug: parsed.organizationSlug,
        lessonTitle: parsed.lessonTitle ?? 'Untitled lesson',
        courseTitle: parsed.courseTitle ?? null,
        thumbnailUrl: parsed.thumbnailUrl ?? null,
        durationSeconds: parsed.durationSeconds ?? null,
        savedAt: parsed.savedAt ?? new Date().toISOString(),
        storageKey: key,
      })
    } catch {
      // Legacy entries (bare "1") have no metadata — skip them.
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt))
}

const BookmarkCard = ({
  bookmark,
  searchString,
  onRemove,
}: {
  bookmark: SavedBookmark
  searchString: string
  onRemove: () => void
}) => {
  const href =
    `/${bookmark.organizationSlug}/portal/courses/${bookmark.courseId}` +
    `?lesson=${bookmark.lessonId}` +
    (searchString ? `&${searchString}` : '')

  return (
    <div className="sp-card" style={{ position: 'relative' }}>
      <Link href={href} className="sp-card-media" aria-label={bookmark.lessonTitle}>
        {bookmark.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bookmark.thumbnailUrl} alt="" loading="lazy" />
        ) : (
          <div className="sp-card-media-fallback">Lesson</div>
        )}
      </Link>
      <div className="sp-card-body">
        <Link
          href={href}
          className="sp-card-title"
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          {bookmark.lessonTitle}
        </Link>
        <div className="sp-card-meta">
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bookmark.courseTitle ?? 'Masterclass'}
          </span>
          {bookmark.durationSeconds ? (
            <span>· {formatMinSec(bookmark.durationSeconds)}</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title="Remove bookmark"
        aria-label="Remove bookmark"
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          width: 28,
          height: 28,
          borderRadius: 999,
          background: 'rgba(0,0,0,0.55)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  )
}

const BookmarksPage = ({
  organization,
}: {
  organization: schemas['CustomerOrganization']
}) => {
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const [bookmarks, setBookmarks] = React.useState<SavedBookmark[]>([])
  const [hydrated, setHydrated] = React.useState(false)

  const refresh = React.useCallback(() => {
    setBookmarks(readBookmarks(organization.slug))
  }, [organization.slug])

  React.useEffect(() => {
    refresh()
    setHydrated(true)
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key.startsWith(BOOKMARK_PREFIX)) refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [refresh])

  const removeOne = (bookmark: SavedBookmark) => {
    window.localStorage.removeItem(bookmark.storageKey)
    refresh()
  }

  const clearAll = () => {
    if (!confirm('Remove all bookmarks?')) return
    for (const b of bookmarks) {
      window.localStorage.removeItem(b.storageKey)
    }
    refresh()
  }

  return (
    <div className="sp-route">
      <div className="sp-page-head">
        <div>
          <h1 className="sp-page-title">Bookmarks</h1>
          <p className="sp-page-sub">
            {!hydrated
              ? 'Loading…'
              : bookmarks.length === 0
                ? 'Lessons you bookmark will appear here.'
                : `${bookmarks.length} saved lesson${bookmarks.length === 1 ? '' : 's'}`}
          </p>
        </div>
        {hydrated && bookmarks.length > 0 && (
          <button
            type="button"
            className="sp-btn is-ghost"
            onClick={clearAll}
          >
            Clear all
          </button>
        )}
      </div>

      {!hydrated ? null : bookmarks.length === 0 ? (
        <div className="sp-empty">
          <div className="sp-empty-title">No bookmarks yet</div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            Open a lesson and tap the Bookmark button to save it here.
          </div>
          <Link
            href={`/${organization.slug}/portal/courses${searchString ? `?${searchString}` : ''}`}
            className="sp-btn is-ghost"
          >
            Browse courses
          </Link>
        </div>
      ) : (
        <div className="sp-grid">
          {bookmarks.map((b) => (
            <BookmarkCard
              key={b.storageKey}
              bookmark={b}
              searchString={searchString}
              onRemove={() => removeOne(b)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default BookmarksPage
