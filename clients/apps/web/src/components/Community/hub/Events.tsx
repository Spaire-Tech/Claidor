'use client'

/**
 * Community Hub — Events tab (creator).
 *
 * Live moments: a form (cover, type, custom date/time pickers, meeting provider
 * + link, description) → published cards split Upcoming / Past → an enroll-style
 * detail sheet. Wired to the existing community_event endpoints. To use the
 * existing backend unchanged we map the design's 3 type labels onto the stored
 * enum and infer the meeting provider from the saved URL.
 */
import {
  type CommunityEventCreateBody,
  type CommunityEventRead,
  type CommunityEventType,
  type CommunityEventUpdateBody,
  useCommunityEvents,
  useCreateCommunityEvent,
  useDeleteCommunityEvent,
  useRsvpCommunityEvent,
  useUpdateCommunityEvent,
  useUploadPostImage,
} from '@/hooks/queries/community'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { calendarLinksFor } from '../calendarLinks'
import { CoverDrop, Field, Seg } from './atoms'
import { useHub } from './context'
import { HeadInfo } from './HeadInfo'
import { Glyph } from './icons'
import {
  browserTz,
  DatePicker,
  providerFromUrl,
  type ProviderKey,
  ProviderLogo,
  providerOf,
  providerPlaceholder,
  ProviderSelect,
  TimePicker,
  toStartAtISO,
} from './pickers'

const { useEffect, useState } = React

/* type label ↔ stored enum (uses the existing enum values). Keep this map in
 * sync with PublicEventPage.tsx and emails/EventCard.tsx — all three must show
 * the same wording for a given stored type. */
const FORM_TYPES = ['Workshop', 'Q&A', 'Watch Party', 'Guest'] as const
const TYPE_LABEL: Record<CommunityEventType, string> = {
  workshop: 'Workshop',
  office: 'Q&A',
  cohort: 'Watch Party',
  guest: 'Guest',
}
const labelToType = (l: string): CommunityEventType =>
  l === 'Q&A'
    ? 'office'
    : l === 'Watch Party'
      ? 'cohort'
      : l === 'Guest'
        ? 'guest'
        : 'workshop'

const DURATIONS = [30, 45, 60, 90]

/* ---------- date/time display in the event's own tz ---------- */
function eventWhen(ev: CommunityEventRead) {
  const d = new Date(ev.start_at)
  const tz = ev.timezone || undefined
  return {
    short: d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: tz,
    }),
    time: d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    }),
    full: d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: tz,
    }),
  }
}

/* ---------- form ---------- */
type FormState = {
  title: string
  typeLabel: string
  date: string
  time: string
  dur: number
  provider: ProviderKey
  link: string
  desc: string
  cover: string
  coverPos: string
}
const emptyForm = (provider: ProviderKey): FormState => ({
  title: '',
  typeLabel: 'Workshop',
  date: '',
  time: '18:00',
  dur: 45,
  provider,
  link: '',
  desc: '',
  cover: '',
  coverPos: '50% 50%',
})

/* Build the editable form state from an existing event (edit mode). */
const formFromEvent = (
  ev: CommunityEventRead,
  fallbackProvider: ProviderKey,
): FormState => {
  const d = new Date(ev.start_at)
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n))
  return {
    title: ev.title || '',
    typeLabel: TYPE_LABEL[ev.type] ?? 'Workshop',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    dur: ev.duration_minutes,
    provider: ev.meeting_url
      ? (providerFromUrl(ev.meeting_url) as ProviderKey)
      : fallbackProvider,
    link: ev.meeting_url || '',
    desc: ev.description || '',
    cover: ev.cover_url || '',
    coverPos: ev.cover_object_position || '50% 50%',
  }
}

function EventForm({
  courseId,
  defaultProvider,
  editing = null,
  onCancel,
  onCreated,
  showToast,
}: {
  courseId: string
  defaultProvider: ProviderKey
  /** When set, the form edits this event instead of creating a new one. */
  editing?: CommunityEventRead | null
  onCancel: (() => void) | null
  onCreated: () => void
  showToast: (m: string) => void
}) {
  const [form, setForm] = useState<FormState>(() =>
    editing
      ? formFromEvent(editing, defaultProvider)
      : emptyForm(defaultProvider),
  )
  const set = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }))
  const [busy, setBusy] = useState(false)
  const uploadImg = useUploadPostImage(null, courseId, 'creator')
  const create = useCreateCommunityEvent(null, courseId, 'creator')
  const update = useUpdateCommunityEvent(null, courseId, 'creator')

  const can = form.title.trim() && form.date && !busy
  const onCover = async (file: File, dataUrl: string) => {
    set({ cover: dataUrl })
    try {
      const res = await uploadImg.mutateAsync(file)
      set({ cover: res.public_url })
    } catch {
      set({ cover: '' })
      showToast('Could not upload that image')
    }
  }

  const submit = async () => {
    if (!can) return
    setBusy(true)
    try {
      if (editing) {
        const body: CommunityEventUpdateBody = {
          title: form.title.trim(),
          type: labelToType(form.typeLabel),
          description: form.desc.trim() || null,
          start_at: toStartAtISO(form.date, form.time),
          duration_minutes: form.dur,
          meeting_url: form.link.trim() || null,
          cover_url: form.cover || null,
        }
        await update.mutateAsync({ eventId: editing.id, body })
        showToast('Event updated')
      } else {
        const body: CommunityEventCreateBody = {
          title: form.title.trim(),
          type: labelToType(form.typeLabel),
          description: form.desc.trim() || null,
          start_at: toStartAtISO(form.date, form.time),
          timezone: browserTz(),
          duration_minutes: form.dur,
          meeting_url: form.link.trim() || null,
          cover_url: form.cover || null,
          cover_object_position: form.cover ? form.coverPos : null,
        }
        await create.mutateAsync(body)
        showToast('Event scheduled')
      }
      onCreated()
    } catch {
      showToast(
        editing
          ? 'Could not update that event'
          : 'Could not schedule that event',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card form-card">
      <div className="form-title">
        {editing ? 'Edit live moment' : 'Schedule a live moment'}
      </div>
      <Field label="Cover image">
        <CoverDrop
          src={form.cover}
          onFile={onCover}
          pos={form.coverPos}
          onPos={(p) => set({ coverPos: p })}
        />
      </Field>
      <Field label="Type">
        <Seg
          value={form.typeLabel}
          options={[...FORM_TYPES]}
          onChange={(v) => set({ typeLabel: v })}
        />
      </Field>
      <Field label="Title">
        <input
          className="input"
          value={form.title}
          placeholder="e.g. Live Welcome Q&A"
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>
      <div className="field-row">
        <Field label="Date">
          <DatePicker value={form.date} onChange={(v) => set({ date: v })} />
        </Field>
        <Field label="Time">
          <TimePicker value={form.time} onChange={(v) => set({ time: v })} />
        </Field>
      </div>
      <Field label="Duration">
        <select
          className="input"
          value={form.dur}
          onChange={(e) => set({ dur: Number(e.target.value) })}
        >
          {DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d} min
            </option>
          ))}
        </select>
      </Field>
      <Field label="Meeting link">
        <div className="meet-row">
          <ProviderSelect
            value={form.provider}
            onChange={(v) => set({ provider: v })}
          />
          <input
            className="input"
            value={form.link}
            placeholder={providerPlaceholder(form.provider)}
            onChange={(e) => set({ link: e.target.value })}
          />
        </div>
      </Field>
      <Field label="Description">
        <textarea
          className="textarea"
          value={form.desc}
          placeholder="What happens in this session?"
          onChange={(e) => set({ desc: e.target.value })}
        />
      </Field>
      <div className="form-foot">
        <span className="sp" />
        {onCancel && (
          <button className="btn btn-quiet btn-sm" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!can}
          style={!can ? { opacity: 0.4 } : undefined}
          onClick={submit}
        >
          {busy
            ? editing
              ? 'Saving…'
              : 'Scheduling…'
            : editing
              ? 'Save changes'
              : 'Schedule'}
        </button>
      </div>
    </div>
  )
}

/* ---------- card ---------- */
function EventCard({
  ev,
  onOpen,
  past,
}: {
  ev: CommunityEventRead
  onOpen: (ev: CommunityEventRead) => void
  past?: boolean
}) {
  const when = eventWhen(ev)
  const provider = providerFromUrl(ev.meeting_url)
  return (
    <button
      className={`ev-card ${past ? 'is-past' : ''}`}
      onClick={() => onOpen(ev)}
    >
      <div
        className="ev-card-cover"
        style={{
          backgroundImage: ev.cover_url ? `url(${ev.cover_url})` : undefined,
          backgroundPosition: ev.cover_object_position || 'center',
        }}
      >
        <span className="ev-card-type">{TYPE_LABEL[ev.type]}</span>
        <span className="ev-card-prov">
          <ProviderLogo k={provider} size={26} />
        </span>
        {past && <span className="ev-card-past">Ended</span>}
      </div>
      <div className="ev-card-body">
        <div className="ev-card-when">
          <Glyph d="calendar" size={14} stroke={1.9} /> {when.short} ·{' '}
          {when.time}
        </div>
        <div className="ev-card-title">{ev.title || 'Untitled event'}</div>
        {(ev.going || ev.rsvp_count > 0) && (
          <div className="ev-card-rsvp">
            {ev.going && (
              <span className="ev-card-going">
                <Glyph d="check" size={13} stroke={2.4} /> Going
              </span>
            )}
            {ev.rsvp_count > 0 && (
              <span className="ev-card-count">
                {ev.rsvp_count} {ev.rsvp_count === 1 ? 'going' : 'going'}
              </span>
            )}
          </div>
        )}
        <div className="ev-card-join">
          {past ? (
            <>
              View recap <Glyph d="chevR" size={15} stroke={2} />
            </>
          ) : ev.meeting_url ? (
            <>
              Join with {providerOf(provider).name}{' '}
              <Glyph d="chevR" size={15} stroke={2} />
            </>
          ) : (
            <>
              View details <Glyph d="chevR" size={15} stroke={2} />
            </>
          )}
        </div>
      </div>
    </button>
  )
}

/* ---------- detail sheet ---------- */
export function EventSheet({
  ev,
  courseId,
  orgSlug,
  memberRsvp = true,
  onClose,
  onEdit,
  onDeleted,
  showToast,
}: {
  ev: CommunityEventRead
  courseId?: string
  /** Org slug — enables the same-origin .ics download (Apple Calendar). */
  orgSlug?: string
  /** Settings gate: when false, the member RSVP button is hidden. */
  memberRsvp?: boolean
  onClose: () => void
  /** Host only: open the editor prefilled with this event. */
  onEdit?: (ev: CommunityEventRead) => void
  /** Host only: called after a successful delete so the list can refresh. */
  onDeleted?: () => void
  showToast: (m: string) => void
}) {
  const { viewer, mode, token } = useHub()
  const isHost = viewer === 'host'
  const isMember = viewer === 'member' && mode === 'customer'

  const rsvp = useRsvpCommunityEvent(token, courseId)
  const del = useDeleteCommunityEvent(null, courseId, 'creator')
  // Optimistic RSVP state so the button feels instant.
  const [going, setGoing] = useState(!!ev.going)
  const [count, setCount] = useState(ev.rsvp_count)
  const [calOpen, setCalOpen] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', h)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const provider = providerFromUrl(ev.meeting_url)
  const prov = providerOf(provider)
  const when = eventWhen(ev)
  const join = () => {
    if (ev.meeting_url) window.open(ev.meeting_url, '_blank')
    else showToast('No meeting link set')
  }

  const toggleRsvp = async () => {
    if (!courseId || rsvp.isPending) return
    const next = !going
    setGoing(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    try {
      const res = await rsvp.mutateAsync({ eventId: ev.id, going: next })
      setGoing(res.going)
      setCount(res.rsvp_count)
      // When confirming, the backend emails an .ics + bell + reminder schedule.
      showToast(res.going ? "You're going — check your email" : 'RSVP removed')
    } catch {
      // revert
      setGoing(!next)
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
      showToast('Could not update your RSVP')
    }
  }

  const onDelete = async () => {
    if (!courseId) return
    if (
      !window.confirm(
        `Delete "${ev.title || 'this event'}"? Members who RSVP'd will lose it. This cannot be undone.`,
      )
    )
      return
    try {
      await del.mutateAsync(ev.id)
      showToast('Event deleted')
      onDeleted?.()
      onClose()
    } catch {
      showToast('Could not delete that event')
    }
  }

  const cal = calendarLinksFor(
    {
      title: ev.title || 'Event',
      startAt: ev.start_at,
      durationMinutes: ev.duration_minutes,
      description: ev.description,
      location: ev.location,
      meetingUrl: ev.meeting_url,
    },
    orgSlug ? `/${orgSlug}/events/${ev.id}/ics` : '',
  )

  // Portal to <body> so the fixed overlay anchors to the viewport. Inside a
  // feed/composer card the surrounding `.crf-post` / `.card` gets a
  // backdrop-filter in dark mode, which would otherwise make this fixed
  // overlay anchor to that card ("opens inside a feed"). Re-apply the
  // `.spaire-hub` scope (and current theme) on the portal root so the scoped
  // styles still match.
  const isDark =
    typeof document !== 'undefined' &&
    !!document.querySelector('.spaire-hub.dark')
  return createPortal(
    <div className={`spaire-hub ${isDark ? 'dark' : ''}`}>
      <div className="ev-overlay" onClick={onClose}>
        <div className="ev-sheet" onClick={(e) => e.stopPropagation()}>
          <div
            className="ev-sheet-cover"
            style={{
              backgroundImage: ev.cover_url
                ? `url(${ev.cover_url})`
                : undefined,
              backgroundPosition: ev.cover_object_position || 'center',
            }}
          >
            <button className="ev-sheet-x" onClick={onClose} aria-label="Close">
              <Glyph d="close" size={18} stroke={2.2} />
            </button>
            <span className="ev-sheet-type">{TYPE_LABEL[ev.type]}</span>
            {ev.live && <span className="ev-sheet-live">● Live now</span>}
          </div>
          <div className="ev-sheet-body">
            <div className="ev-sheet-when">
              <Glyph d="calendar" size={15} stroke={1.9} /> {when.full} ·{' '}
              {when.time}
            </div>
            <h3 className="ev-sheet-title">{ev.title || 'Untitled event'}</h3>
            <div className="ev-sheet-prov">
              <ProviderLogo k={provider} size={22} /> Hosted on {prov.name} ·{' '}
              {ev.duration_minutes} min
            </div>
            {count > 0 && (
              <div className="ev-sheet-going">
                <Glyph d="users" size={14} stroke={1.9} /> {count}{' '}
                {count === 1 ? 'person going' : 'people going'}
              </div>
            )}
            {ev.description && (
              <p className="ev-sheet-desc">{ev.description}</p>
            )}

            {/* Member RSVP — confirming triggers the backend's confirmation
                email (with .ics), reminder schedule and bell notifications. */}
            {isMember && !ev.past && memberRsvp && (
              <button
                className={`ev-sheet-rsvp ${going ? 'going' : ''}`}
                onClick={toggleRsvp}
                disabled={rsvp.isPending}
              >
                {going ? (
                  <>
                    <Glyph d="check" size={17} stroke={2.4} /> You&apos;re going
                  </>
                ) : (
                  <>
                    <Glyph d="calendar" size={17} stroke={2} /> RSVP — I&apos;ll
                    be there
                  </>
                )}
              </button>
            )}

            {ev.meeting_url && (
              <button className="ev-sheet-join" onClick={join}>
                <ProviderLogo k={provider} size={24} /> Join with {prov.name}
                <Glyph d="chevR" size={16} stroke={2.2} />
              </button>
            )}

            {/* Add to calendar — Google / Outlook deep links + Apple .ics. */}
            {!ev.past && (
              <div className="ev-sheet-cal">
                <button
                  className="ev-sheet-cal-btn"
                  onClick={() => setCalOpen((o) => !o)}
                >
                  <Glyph d="calendar" size={16} stroke={1.9} /> Add to calendar
                  <Glyph d="chevD" size={15} stroke={2} />
                </button>
                {calOpen && (
                  <div className="ev-sheet-cal-menu">
                    <a href={cal.google} target="_blank" rel="noreferrer">
                      Google Calendar
                    </a>
                    <a href={cal.outlook} target="_blank" rel="noreferrer">
                      Outlook
                    </a>
                    {orgSlug && (
                      <a href={cal.ics} download>
                        Apple / iCal (.ics)
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {ev.meeting_url && (
              <div className="ev-sheet-url">{ev.meeting_url}</div>
            )}

            {/* Host controls. */}
            {isHost && (onEdit || courseId) && (
              <div className="ev-sheet-host">
                {onEdit && (
                  <button
                    className="btn btn-quiet btn-sm"
                    onClick={() => onEdit(ev)}
                  >
                    Edit event
                  </button>
                )}
                <button
                  className="ev-sheet-del"
                  onClick={onDelete}
                  disabled={del.isPending}
                >
                  <Glyph d="trash" size={15} stroke={2} /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/* ---------- tab ---------- */
export function EventsTab({
  courseId,
  orgSlug,
  defaultProvider = 'zoom',
  memberRsvp = true,
  showToast,
}: {
  courseId: string
  orgSlug?: string
  defaultProvider?: ProviderKey
  /** Settings gate: when false, members can't RSVP (button hidden). */
  memberRsvp?: boolean
  showToast: (m: string) => void
}) {
  const { viewer, mode, token } = useHub()
  const isHost = viewer === 'host'
  const eventsQ = useCommunityEvents(token, courseId, mode)
  const events = eventsQ.data ?? []
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<CommunityEventRead | null>(null)
  const [openEv, setOpenEv] = useState<CommunityEventRead | null>(null)

  const startEdit = (ev: CommunityEventRead) => {
    setOpenEv(null)
    setEditing(ev)
    setShowForm(true)
  }
  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
  }

  const upcoming = events
    .filter((e) => !e.past)
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
  const past = events
    .filter((e) => e.past)
    .sort((a, b) => b.start_at.localeCompare(a.start_at))

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Events
            <HeadInfo>
              {isHost
                ? 'Live moments that bring the room together — a workshop, a Q&A, or a watch party. Schedule one and it publishes a card members can join in a tap.'
                : 'Live moments with your host and the room — Q&As, watch parties, and workshops. Tap any card to see the details and join.'}
            </HeadInfo>
          </div>
        </div>
        {isHost && !showForm && events.length > 0 && (
          <button
            className="ev-add-btn"
            onClick={() => {
              setEditing(null)
              setShowForm(true)
            }}
            aria-label="New event"
          >
            <Glyph d="plus" size={20} stroke={2.2} />
          </button>
        )}
      </div>

      {isHost && showForm ? (
        <EventForm
          courseId={courseId}
          defaultProvider={defaultProvider}
          editing={editing}
          onCancel={editing || events.length > 0 ? () => closeForm() : null}
          onCreated={closeForm}
          showToast={showToast}
        />
      ) : eventsQ.isError ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic">
            <Glyph d="calendar" size={26} stroke={1.7} />
          </span>
          <h3>Couldn&apos;t load events</h3>
          <p>Something went wrong. Please refresh to try again.</p>
        </div>
      ) : events.length === 0 ? (
        <div className="card ev-empty">
          <span className="ev-empty-ic">
            <Glyph d="calendar" size={26} stroke={1.7} />
          </span>
          <h3>No live moments yet</h3>
          <p>
            {isHost
              ? 'Schedule a workshop, Q&A, or watch party. It publishes a card members can join with one tap when it goes live.'
              : 'When your host schedules a workshop, Q&A, or watch party, it shows up here for you to join.'}
          </p>
          {isHost && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditing(null)
                setShowForm(true)
              }}
            >
              Schedule an event
            </button>
          )}
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <div className="ev-sec-label">Upcoming · {upcoming.length}</div>
              <div className="ev-grid">
                {upcoming.map((ev) => (
                  <EventCard key={ev.id} ev={ev} onOpen={setOpenEv} />
                ))}
              </div>
            </>
          )}
          {past.length > 0 && (
            <>
              <div className="ev-sec-label past">Past · {past.length}</div>
              <div className="ev-grid ev-grid-past">
                {past.map((ev) => (
                  <EventCard key={ev.id} ev={ev} onOpen={setOpenEv} past />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {openEv && (
        <EventSheet
          ev={openEv}
          courseId={courseId}
          orgSlug={orgSlug}
          memberRsvp={memberRsvp}
          onClose={() => setOpenEv(null)}
          onEdit={isHost ? startEdit : undefined}
          onDeleted={() => setOpenEv(null)}
          showToast={showToast}
        />
      )}
    </>
  )
}
