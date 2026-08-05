'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — shared rich composer (Feed).
 *
 * Wired to the real post-create pipeline: text, photo (S3 → file_id), video
 * (Mux direct upload → mux_upload_id), emoji (emoji-mart, native set — no CDN
 * sprites so it always renders), polls (2–4 options), and event-link (embed a
 * scheduled event; clicking the attached card opens its detail sheet). The
 * composer owns all upload state and hands a finished CommunityPostCreateBody
 * to `onCreate`.
 *
 * GIF is intentionally omitted for now.
 */
import {
  type CommunityEventRead,
  type CommunityIOMode,
  type CommunityPostCreateBody,
  useCommunityEvents,
  useUploadPostImage,
  useUploadPostVideo,
} from '@/hooks/queries/community'
import data from '@emoji-mart/data'
import Picker from '@emoji-mart/react'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { EventSheet } from './Events'
import { HubAvatar } from './HubAvatar'
import { Glyph } from './icons'
import { fmtDateLabel, providerFromUrl, ProviderLogo } from './pickers'

const { useRef, useState } = React

const TYPE_LABEL: Record<string, string> = {
  workshop: 'Workshop',
  office: 'Q&A',
  cohort: 'Watch Party',
  guest: 'Guest',
}

/* ---------- compact event attach card ---------- */
function EventAttach({
  ev,
  onOpen,
  onRemove,
}: {
  ev: CommunityEventRead
  onOpen?: () => void
  onRemove?: () => void
}) {
  const provider = providerFromUrl(ev.meeting_url)
  return (
    <div
      className={`ev-attach ${onOpen ? 'tap' : ''}`}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
    >
      <div
        className="ev-attach-cover"
        style={{
          backgroundImage: ev.cover_url ? `url(${ev.cover_url})` : undefined,
          backgroundPosition: ev.cover_object_position || 'center',
        }}
      >
        <span className="ev-attach-prov">
          <ProviderLogo k={provider} size={22} />
        </span>
      </div>
      <div className="ev-attach-body">
        <div className="ev-attach-type">{TYPE_LABEL[ev.type] ?? ev.type}</div>
        <div className="ev-attach-title">{ev.title || 'Untitled event'}</div>
        <div className="ev-attach-when">
          <Glyph d="calendar" size={13} stroke={1.9} />{' '}
          {fmtDateLabel(ev.start_at.slice(0, 10))}
        </div>
      </div>
      {onRemove && (
        <button
          className="ev-attach-rm"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          aria-label="Remove"
        >
          <Glyph d="close" size={15} stroke={2.2} />
        </button>
      )}
    </div>
  )
}

/* ---------- emoji picker, rendered in a portal so card backdrop-filter
   stacking contexts can't bury it under the feed ---------- */
function EmojiPortal({
  anchor,
  onPick,
  onClose,
}: {
  anchor: DOMRect
  onPick: (native: string) => void
  onClose: () => void
}) {
  // Position below the button, clamped to the viewport (flip up if it would
  // overflow the bottom).
  const W = 352
  const H = 420
  let left = anchor.left
  if (left + W > window.innerWidth - 12) left = window.innerWidth - W - 12
  if (left < 12) left = 12
  const below = anchor.bottom + 8
  const openUp = below + H > window.innerHeight - 12
  const top = openUp ? Math.max(12, anchor.top - H - 8) : below
  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 4000 }}
      />
      <div style={{ position: 'fixed', top, left, zIndex: 4001 }}>
        <Picker
          data={data}
          set="native"
          theme="auto"
          previewPosition="none"
          skinTonePosition="none"
          onEmojiSelect={(e: { native: string }) => onPick(e.native)}
        />
      </div>
    </>,
    document.body,
  )
}

type Props = {
  courseId: string
  mode?: CommunityIOMode
  /** Customer session token (customer mode); null/undefined for the creator. */
  token?: string | null
  avatar?: string | null
  authorName?: string | null
  placeholder?: string
  cta?: string
  onCreate: (body: CommunityPostCreateBody) => Promise<unknown>
  onPosted?: () => void
  showToast: (m: string) => void
}

export function Composer({
  courseId,
  mode = 'creator',
  token = null,
  avatar,
  authorName,
  placeholder = 'Share an update with your community…',
  cta = 'Post',
  onCreate,
  onPosted,
  showToast,
}: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [images, setImages] = useState<{ file_id: string; url: string }[]>([])
  const [video, setVideo] = useState<{
    upload_id: string
    url: string
    progress: number
  } | null>(null)
  const [poll, setPoll] = useState<string[] | null>(null)
  const [event, setEvent] = useState<CommunityEventRead | null>(null)
  const [eventPick, setEventPick] = useState(false)
  const [sheetEvent, setSheetEvent] = useState<CommunityEventRead | null>(null)
  const [emojiRect, setEmojiRect] = useState<DOMRect | null>(null)
  const [busy, setBusy] = useState(false)

  const taRef = useRef<HTMLTextAreaElement>(null)
  const imgInput = useRef<HTMLInputElement>(null)
  const vidInput = useRef<HTMLInputElement>(null)
  const emojiBtn = useRef<HTMLButtonElement>(null)

  const uploadImg = useUploadPostImage(token, courseId, mode)
  const uploadVid = useUploadPostVideo(token, courseId, mode)
  const eventsQ = useCommunityEvents(token, courseId, mode)
  const events = eventsQ.data ?? []

  const av = avatar || undefined
  const name = authorName || 'You'

  const expand = () => {
    setOpen(true)
    setTimeout(() => taRef.current?.focus(), 0)
  }
  const reset = () => {
    setText('')
    setImages([])
    setVideo(null)
    setPoll(null)
    setEvent(null)
    setEventPick(false)
    setEmojiRect(null)
    setOpen(false)
  }

  const MAX_IMAGES = 4
  const onPickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const room = MAX_IMAGES - images.length
    if (room <= 0) {
      showToast(`You can attach up to ${MAX_IMAGES} photos`)
      return
    }
    const picked = Array.from(files).slice(0, room)
    if (picked.length < files.length) {
      showToast(`Only ${MAX_IMAGES} photos per post — added the first ${room}`)
    }
    setVideo(null)
    setOpen(true)
    setBusy(true)
    try {
      // Upload sequentially and append each so several photos can ride on one
      // post (LinkedIn-style gallery, capped at 4 to match the backend).
      for (const file of picked) {
        const res = await uploadImg.mutateAsync(file)
        setImages((prev) => [
          ...prev,
          { file_id: res.file_id, url: res.public_url },
        ])
      }
    } catch {
      showToast('Could not upload that image')
    } finally {
      setBusy(false)
    }
  }
  const removeImage = (fileId: string) =>
    setImages((prev) => prev.filter((im) => im.file_id !== fileId))
  const onPickVideo = async (file: File | undefined) => {
    if (!file) return
    setImages([])
    setVideo({ upload_id: '', url: URL.createObjectURL(file), progress: 0 })
    setOpen(true)
    setBusy(true)
    try {
      const res = await uploadVid.mutateAsync({
        file,
        onProgress: (f) => setVideo((v) => (v ? { ...v, progress: f } : v)),
      })
      setVideo((v) => (v ? { ...v, upload_id: res.upload_id, progress: 1 } : v))
    } catch {
      setVideo(null)
      showToast('Could not upload that video')
    } finally {
      setBusy(false)
    }
  }

  const insertEmoji = (native: string) => {
    setText((t) => t + native)
    setEmojiRect(null)
    setTimeout(() => taRef.current?.focus(), 0)
  }
  const toggleEmoji = () => {
    if (emojiRect) {
      setEmojiRect(null)
      return
    }
    const r = emojiBtn.current?.getBoundingClientRect()
    if (r) setEmojiRect(r)
  }

  const setPollOption = (i: number, v: string) =>
    setPoll((p) => (p ? p.map((o, j) => (j === i ? v : o)) : p))
  const addPollOption = () =>
    setPoll((p) => (p && p.length < 4 ? [...p, ''] : p))
  const rmPollOption = (i: number) =>
    setPoll((p) => (p && p.length > 2 ? p.filter((_, j) => j !== i) : p))

  const validPoll = !!poll && poll.filter((o) => o.trim()).length >= 2
  const hasContent =
    !!text.trim() ||
    images.length > 0 ||
    !!(video && video.upload_id) ||
    validPoll ||
    !!event

  const submit = async () => {
    if (!hasContent || busy) return
    const body: CommunityPostCreateBody = { body: text.trim() || ' ' }
    if (video && video.upload_id) {
      body.type = 'video'
      body.media = [
        { media_type: 'video', mux_upload_id: video.upload_id, position: 0 },
      ]
    } else if (images.length > 0) {
      body.media = images.map((im, i) => ({
        media_type: 'image' as const,
        file_id: im.file_id,
        position: i,
      }))
    }
    if (validPoll && poll)
      body.poll = { options: poll.map((o) => o.trim()).filter(Boolean) }
    if (event) body.event_id = event.id

    setBusy(true)
    try {
      await onCreate(body)
      reset()
      onPosted?.()
      showToast('Posted to your community')
    } catch {
      showToast('Could not post that')
    } finally {
      setBusy(false)
    }
  }

  const hiddenInputs = (
    <>
      <input
        ref={imgInput}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          onPickImages(e.target.files)
          e.target.value = ''
        }}
      />
      <input
        ref={vidInput}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          onPickVideo(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </>
  )

  if (!open) {
    return (
      <div className="card crf-composer">
        <div className="crf-comp-row">
          <HubAvatar name={name} url={av} />
          <button className="crf-comp-fake" onClick={expand}>
            {placeholder}
          </button>
        </div>
        <div className="crf-comp-quick">
          <button onClick={() => imgInput.current?.click()}>
            <Glyph d="image" size={18} stroke={1.8} /> Photo
          </button>
          <button onClick={() => vidInput.current?.click()}>
            <Glyph d="video" size={18} stroke={1.8} /> Video
          </button>
          <button
            onClick={() => {
              expand()
              setEventPick(true)
            }}
          >
            <Glyph d="calendar" size={18} stroke={1.8} /> Event
          </button>
        </div>
        {hiddenInputs}
      </div>
    )
  }

  return (
    <div className="card crf-composer open">
      <div className="crf-comp-head">
        <HubAvatar name={name} url={av} />
        <div className="crf-comp-who">
          <div className="n">{name}</div>
        </div>
        <button className="crf-more" onClick={reset} aria-label="Close">
          <Glyph d="close" size={18} stroke={2} />
        </button>
      </div>

      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />

      {images.length > 0 && (
        <div className={`comp-atts ${images.length === 1 ? 'one' : ''}`}>
          {images.map((im) => (
            <div className="comp-att" key={im.file_id}>
              <img src={im.url} alt="" />
              <button
                className="comp-att-rm"
                onClick={() => removeImage(im.file_id)}
                aria-label="Remove"
              >
                <Glyph d="close" size={15} stroke={2.2} />
              </button>
            </div>
          ))}
        </div>
      )}
      {video && (
        <div className="comp-att">
          <video src={video.url} controls playsInline />
          {video.progress < 1 && (
            <div className="comp-att-prog">
              <span style={{ width: `${Math.round(video.progress * 100)}%` }} />
            </div>
          )}
          <button
            className="comp-att-rm"
            onClick={() => setVideo(null)}
            aria-label="Remove"
          >
            <Glyph d="close" size={15} stroke={2.2} />
          </button>
        </div>
      )}
      {poll && (
        <div className="poll-build">
          <div className="poll-build-head">
            <span>Poll</span>
            <button onClick={() => setPoll(null)}>Remove</button>
          </div>
          {poll.map((o, i) => (
            <div key={i} className="poll-build-row">
              <input
                className="input"
                value={o}
                placeholder={`Option ${i + 1}`}
                maxLength={40}
                onChange={(e) => setPollOption(i, e.target.value)}
              />
              {poll.length > 2 && (
                <button
                  className="poll-build-rm"
                  onClick={() => rmPollOption(i)}
                  aria-label="Remove option"
                >
                  <Glyph d="close" size={14} stroke={2.2} />
                </button>
              )}
            </div>
          ))}
          {poll.length < 4 && (
            <button className="poll-build-add" onClick={addPollOption}>
              <Glyph d="plus" size={15} stroke={2} /> Add option
            </button>
          )}
        </div>
      )}
      {event && (
        <EventAttach
          ev={event}
          onOpen={() => setSheetEvent(event)}
          onRemove={() => setEvent(null)}
        />
      )}

      <div className="crf-comp-foot">
        <div className="crf-comp-tools">
          <button title="Photo" onClick={() => imgInput.current?.click()}>
            <Glyph d="image" size={20} stroke={1.8} />
          </button>
          <button title="Video" onClick={() => vidInput.current?.click()}>
            <Glyph d="video" size={20} stroke={1.8} />
          </button>
          <button
            ref={emojiBtn}
            title="Emoji"
            className={emojiRect ? 'on' : ''}
            onClick={toggleEmoji}
          >
            <Glyph d="smiley" size={20} stroke={1.8} />
          </button>
          <div className="tool-wrap">
            <button
              title="Event"
              className={event || eventPick ? 'on' : ''}
              onClick={() => setEventPick((v) => !v)}
            >
              <Glyph d="calendar" size={20} stroke={1.8} />
            </button>
            {eventPick && (
              <>
                <div
                  className="pop-scrim"
                  onClick={() => setEventPick(false)}
                />
                <div className="pop pop-event">
                  <div className="pop-title">Link an event</div>
                  {events.length === 0 ? (
                    <div className="pop-empty">
                      No events yet — schedule one in the Events tab.
                    </div>
                  ) : (
                    <div className="event-pick">
                      {events.map((ev) => (
                        <button
                          key={ev.id}
                          className="event-pick-row"
                          onClick={() => {
                            setEvent(ev)
                            setEventPick(false)
                          }}
                        >
                          <span
                            className="event-pick-cover"
                            style={{
                              backgroundImage: ev.cover_url
                                ? `url(${ev.cover_url})`
                                : undefined,
                              backgroundPosition:
                                ev.cover_object_position || 'center',
                            }}
                          />
                          <span className="event-pick-main">
                            <b>{ev.title || 'Untitled event'}</b>
                            <span>
                              {TYPE_LABEL[ev.type] ?? ev.type} ·{' '}
                              {fmtDateLabel(ev.start_at.slice(0, 10))}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        <span className="sp" />
        <button
          className="btn btn-primary btn-sm"
          disabled={!hasContent || busy}
          style={!hasContent || busy ? { opacity: 0.4 } : undefined}
          onClick={submit}
        >
          {busy ? 'Posting…' : cta}
        </button>
      </div>

      {emojiRect && (
        <EmojiPortal
          anchor={emojiRect}
          onPick={insertEmoji}
          onClose={() => setEmojiRect(null)}
        />
      )}
      {sheetEvent && (
        <EventSheet
          ev={sheetEvent}
          courseId={courseId}
          onClose={() => setSheetEvent(null)}
          showToast={showToast}
        />
      )}

      {hiddenInputs}
    </div>
  )
}
