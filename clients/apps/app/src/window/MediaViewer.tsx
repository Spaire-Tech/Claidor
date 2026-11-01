// Pictures and videos full screen (mac/Simeon/MediaViewer.swift,
// `sand-media-viewer`): a picture from the chat, or a picture's or a
// video's file card, read from the agent's computer or the web.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fileExtension,
  fileKind,
  lastPart,
  mediaCaption,
  wrap,
} from '../core/filePreview'
import type { AppStore } from '../core/store'
import { t } from '../l10n'
import { classes } from './classes'

/** A picture or a video in the viewer, with its caption (the picture's own words, else its name). */
export interface MediaItem {
  url: string
  agentId: string
  caption?: string
  name?: string
}

export const isVideo = (item: MediaItem) =>
  fileKind(item.name ?? lastPart(item.url)) === 'video'

/** The zoom a double click goes to, and the most the wheel goes to (`r7n`, `a7n`). */
const doubleClickZoom = 2.5
const largest = 4

/** A video's kind for the browser, from its name. */
function filmType(name: string): string {
  switch (fileExtension(name)) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'mov':
      return 'video/quicktime'
    case 'webm':
      return 'video/webm'
    case 'ogv':
      return 'video/ogg'
    default:
      return ''
  }
}

interface Picture {
  address: string
  width: number
  height: number
}

/** A picture's size once the browser has drawn it. */
function measured(address: string): Promise<Picture | undefined> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () =>
      resolve(
        image.naturalWidth > 0
          ? { address, width: image.naturalWidth, height: image.naturalHeight }
          : undefined,
      )
    image.onerror = () => resolve(undefined)
    image.referrerPolicy = 'no-referrer'
    image.src = address
  })
}

/**
 * Pictures and videos full screen (`sand-media-viewer`, `m7n`): black at
 * 92% over the window, padded 32. The picture as large as fits (at most 95%
 * of the window's width and 1400, never past its own pixels), 12 round with
 * a deep shadow; under it the caption ("photo.png · 1 / 2", 13, white at
 * 72%) and, with more than one, a strip of 48-point squares (8 round, 8
 * apart, the one shown ringed in white). Previous and Next (28, round,
 * white at 14%) at the sides, 24 in; Close (24, white at 85%) at the top
 * right. Left and right arrows go round; Escape closes. A click on a
 * picture closes it (after a moment, so a double click can zoom); a double
 * click zooms to 2.5 where clicked, or back; the wheel zooms to 4 where the
 * pointer is; zoomed, a drag moves it. A click outside the picture closes.
 * A video plays in the browser's own player, not until asked.
 */
export function MediaViewer({
  items,
  start,
  store,
  close,
}: {
  items: MediaItem[]
  start: number
  store: AppStore
  close: () => void
}) {
  const [index, setIndex] = useState(() => wrap(start, items.length))
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [pictures, setPictures] = useState<Record<string, Picture>>({})
  const [films, setFilms] = useState<Record<string, string>>({})
  const [failed, setFailed] = useState<Record<string, true>>({})
  const [box, setBox] = useState({ width: 0, height: 0 })
  const cell = useRef<HTMLDivElement>(null)
  const viewer = useRef<HTMLDivElement>(null)
  const made = useRef<string[]>([])
  const asked = useRef(new Set<string>())
  const clickTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const drag = useRef<{ x: number; y: number; from: { x: number; y: number } }>(
    undefined,
  )
  const item = items[Math.min(index, items.length - 1)]!

  // The pictures and videos read once each; their copies go with the viewer.
  const load = useCallback(
    async (entry: MediaItem) => {
      if (asked.current.has(entry.url)) return
      asked.current.add(entry.url)
      const fail = () => setFailed((was) => ({ ...was, [entry.url]: true }))
      const web = entry.url.startsWith('https://')
      if (isVideo(entry)) {
        if (web) {
          setFilms((was) => ({ ...was, [entry.url]: entry.url }))
          return
        }
        const read = await store.readForPreview(entry.url, entry.agentId)
        if (read.kind !== 'ready') return fail()
        const address = URL.createObjectURL(
          new Blob([read.data as BlobPart], {
            type: filmType(entry.name ?? lastPart(entry.url)),
          }),
        )
        made.current.push(address)
        setFilms((was) => ({ ...was, [entry.url]: address }))
        return
      }
      let address = entry.url
      if (!web) {
        const data = await store.readFile(entry.url, entry.agentId)
        if (!data) return fail()
        address = URL.createObjectURL(
          new Blob([data as BlobPart], {
            type:
              fileExtension(entry.name ?? entry.url) === 'svg'
                ? 'image/svg+xml'
                : '',
          }),
        )
        made.current.push(address)
      }
      const picture = await measured(address)
      if (!picture) return fail()
      setPictures((was) => ({ ...was, [entry.url]: picture }))
    },
    [store],
  )
  useEffect(() => {
    void load(item)
  }, [load, item])
  useEffect(() => {
    if (items.length > 1)
      for (const entry of items) if (!isVideo(entry)) void load(entry)
  }, [load, items])
  useEffect(() => {
    const copies = made.current
    return () => {
      for (const address of copies) URL.revokeObjectURL(address)
      clearTimeout(clickTimer.current)
    }
  }, [])

  // The cell's size, for the picture's fit and its zoom.
  useEffect(() => {
    const element = cell.current
    if (!element) return
    const seen = new ResizeObserver(() =>
      setBox({ width: element.clientWidth, height: element.clientHeight }),
    )
    seen.observe(element)
    return () => seen.disconnect()
  }, [])

  const picture = pictures[item.url]
  const film = films[item.url]
  const video = isVideo(item)

  /** The picture's size at 1×: its own pixels, made smaller to fit the cell and 95% of the window's width or 1400; a video as large as fits. */
  const fitted = (() => {
    const natural = picture
      ? { width: picture.width, height: picture.height }
      : { width: 16, height: 9 }
    if (box.width <= 0 || box.height <= 0) return { width: 0, height: 0 }
    const widest = Math.min(box.width, Math.min((box.width + 64) * 0.95, 1400))
    const ratio = Math.min(widest / natural.width, box.height / natural.height)
    const grow = video ? ratio : Math.min(ratio, 1)
    return {
      width: Math.round(natural.width * grow),
      height: Math.round(natural.height * grow),
    }
  })()

  const clamp = (next: { x: number; y: number }, at: number) => {
    const spareX = Math.max(0, (fitted.width * at - box.width) / 2)
    const spareY = Math.max(0, (fitted.height * at - box.height) / 2)
    return {
      x: Math.min(spareX, Math.max(-spareX, next.x)),
      y: Math.min(spareY, Math.max(-spareY, next.y)),
    }
  }

  /** Zooms keeping the point under the pointer where it is, 1 to 4, the picture kept over the cell. */
  const zoom = (target: number, point: { x: number; y: number }) => {
    if (video || !picture) return
    const next = Math.min(largest, Math.max(1, target))
    if (next === scale) return
    const from = { x: point.x - box.width / 2, y: point.y - box.height / 2 }
    const content = {
      x: (from.x - offset.x) / scale,
      y: (from.y - offset.y) / scale,
    }
    const moved =
      next <= 1
        ? { x: 0, y: 0 }
        : {
            x: offset.x + content.x * (scale - next),
            y: offset.y + content.y * (scale - next),
          }
    setScale(next)
    setOffset(clamp(moved, next))
  }

  const inCell = (event: { clientX: number; clientY: number }) => {
    const rect = cell.current!.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }
  const onPicture = (point: { x: number; y: number }) => {
    const width = fitted.width * scale
    const height = fitted.height * scale
    const left = (box.width - width) / 2 + offset.x
    const top = (box.height - height) / 2 + offset.y
    return (
      point.x >= left &&
      point.x <= left + width &&
      point.y >= top &&
      point.y <= top + height
    )
  }

  const go = useCallback(
    (step: number) => {
      const next = wrap(index + step, items.length)
      if (next === index) return
      setScale(1)
      setOffset({ x: 0, y: 0 })
      setIndex(next)
    },
    [index, items.length],
  )

  // Escape closes, the arrows go round, before anything under it hears them; the keys go back after.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    viewer.current?.focus()
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowLeft' && items.length > 1) go(-1)
      else if (event.key === 'ArrowRight' && items.length > 1) go(1)
      else return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', keys, true)
    return () => {
      window.removeEventListener('keydown', keys, true)
      before?.focus?.()
    }
  }, [close, go, items.length])

  const status = (
    <span className="media-status">
      {failed[item.url] ? t("Couldn't load media") : t('Loading media…')}
    </span>
  )
  const label =
    items.length > 1
      ? t`Media ${index + 1} of ${items.length}`
      : t('Media preview')
  return (
    <div
      ref={viewer}
      className="media-viewer"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      onWheel={(event) => {
        if (video || !picture || !cell.current) return
        zoom(scale * Math.exp(-event.deltaY * 0.0015), inCell(event))
      }}
    >
      <div className="media-column">
        <div
          ref={cell}
          className="media-cell"
          onClick={(event) => {
            if ((event.target as Element).closest('button, video')) return
            const point = inCell(event)
            const onIt = onPicture(point)
            if (event.detail >= 2) {
              clearTimeout(clickTimer.current)
              if (!onIt || video) return
              if (scale > 1) {
                setScale(1)
                setOffset({ x: 0, y: 0 })
              } else zoom(doubleClickZoom, point)
              return
            }
            // A video's own controls take its clicks; a zoomed picture stays open.
            if (onIt && (video || scale > 1)) return
            if (!onIt) return close()
            clickTimer.current = setTimeout(close, 250)
          }}
          onPointerDown={(event) => {
            if (scale <= 1 || event.button !== 0) return
            drag.current = { x: event.clientX, y: event.clientY, from: offset }
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start) return
            setOffset(
              clamp(
                {
                  x: start.from.x + event.clientX - start.x,
                  y: start.from.y + event.clientY - start.y,
                },
                scale,
              ),
            )
          }}
          onPointerUp={() => {
            drag.current = undefined
          }}
        >
          {video ? (
            film ? (
              <video
                className="media-film"
                src={film}
                controls
                preload="metadata"
                style={{ width: fitted.width, height: fitted.height }}
              />
            ) : (
              status
            )
          ) : picture ? (
            <img
              className={scale > 1 ? 'media-picture zoomed' : 'media-picture'}
              src={picture.address}
              alt={item.caption ?? item.name ?? t('Media preview')}
              referrerPolicy="no-referrer"
              draggable={false}
              style={{
                width: fitted.width,
                height: fitted.height,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              }}
            />
          ) : (
            status
          )}
          {items.length > 1 && (
            <>
              <NavButton
                side="previous"
                label={t('Previous media')}
                onClick={() => go(-1)}
              />
              <NavButton
                side="next"
                label={t('Next media')}
                onClick={() => go(1)}
              />
            </>
          )}
        </div>
        <span className="media-caption">
          {mediaCaption(item.caption, item.name, item.url, index, items.length)}
        </span>
        {items.length > 1 && (
          <div className="media-strip">
            {items.map((entry, position) => {
              const thumb = pictures[entry.url]
              return (
                <button
                  key={entry.url + position}
                  type="button"
                  className={
                    position === index ? 'media-thumb shown' : 'media-thumb'
                  }
                  aria-label={t`View media ${position + 1} of ${items.length}`}
                  onClick={() => go(position - index)}
                >
                  {thumb ? (
                    <img
                      src={thumb.address}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      aria-hidden="true"
                    >
                      {isVideo(entry) ? (
                        <path d="M4 2.5v9l7.5-4.5z" fill="currentColor" />
                      ) : (
                        <g fill="none" stroke="currentColor" strokeWidth="1.2">
                          <rect
                            x="1.5"
                            y="2.5"
                            width="11"
                            height="9"
                            rx="1.5"
                          />
                          <path d="m1.5 9.5 3-3 3 3 2-2 3 3" />
                        </g>
                      )}
                    </svg>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className="media-close"
        title={t('Close media preview')}
        aria-label={t('Close media preview')}
        onClick={close}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path
            d="M2.5 2.5l7 7M9.5 2.5l-7 7"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  )
}

/** Previous or Next (`sand-media-viewer__nav`): 28, round, white at 14%, its glyph white at 92%. */
function NavButton({
  side,
  label,
  onClick,
}: {
  side: 'previous' | 'next'
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={classes('media-nav', side)}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path
          d={
            side === 'previous'
              ? 'M7.5 2.5 4 6l3.5 3.5'
              : 'M4.5 2.5 8 6l-3.5 3.5'
          }
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
