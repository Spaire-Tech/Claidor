'use client'

// Public, unauthenticated event landing page. Renders the same hero +
// rows + host card the in-portal EventDetailModal uses, so a shared
// link looks like the in-app modal "popped open" as a real page.
//
// RSVP itself still requires an enrolled customer session, so the
// primary CTA deep-links into the in-portal event (?event=<id> on the
// course community feed) where the viewer can RSVP + get reminders.
// When the event is live and a join link exists, the CTA becomes a
// direct "Join now" instead. The meeting link and Add-to-Calendar
// (via a same-origin .ics proxy) both work here without auth.

import { Avatar } from '@/components/Community/Avatar'
import { calendarLinksFor } from '@/components/Community/calendarLinks'
import styles from '@/components/Community/community.module.css'
import {
  IconAppleCalendar,
  IconCalendar,
  IconClock,
  IconGoogleCalendar,
  IconMapPin,
  IconOutlookCalendar,
  IconPlayCircle,
  IconShare,
  IconUsers,
  IconVideo,
} from '@/components/Community/icons'
import { useEffect, useRef, useState } from 'react'
import type { PublicEventData } from './page'

const TYPE_LABEL: Record<string, string> = {
  workshop: 'Workshop',
  office: 'Q&A',
  cohort: 'Watch Party',
  guest: 'Guest',
}

type Props = {
  event: PublicEventData
  organizationSlug: string
}

export function PublicEventPage({ event, organizationSlug }: Props) {
  const [shareToast, setShareToast] = useState<string | null>(null)

  const start = new Date(event.start_at)
  const tz = event.timezone || 'UTC'
  const whenDate = new Intl.DateTimeFormat([], {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(start)
  const whenTime = new Intl.DateTimeFormat([], {
    timeZone: tz,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(start)

  const coverPos = event.cover_object_position || '50% 50%'
  const coverStyle: React.CSSProperties = event.cover_url
    ? {
        backgroundImage: `url(${event.cover_url})`,
        backgroundPosition: coverPos,
        backgroundSize: 'cover',
      }
    : { background: 'linear-gradient(135deg, #1f1f1f, #4a4a4a)' }

  // Same-origin .ics proxy (see ./ics/route.ts) so the download
  // attribute works — a cross-origin api.spairehq.com link would be
  // ignored by the browser's `download` and navigate instead.
  const icsUrl = `/${organizationSlug}/events/${event.id}/ics`
  const calLinks = calendarLinksFor(
    {
      title: event.title,
      startAt: event.start_at,
      durationMinutes: event.duration_minutes,
      description: event.description,
      location: event.location,
      // Include the join link in the calendar entry — it's the one
      // field that matters for an online event.
      meetingUrl: event.meeting_url,
    },
    icsUrl,
  )

  // Deep-link into the in-portal event (link + RSVP live there). The
  // `?event=` param tells the community feed to auto-open this event's
  // modal. Without a session the portal routes through request-access,
  // the standard customer entry.
  const portalUrl = `/${organizationSlug}/portal/courses/${event.course_id}/community?event=${event.id}`
  const shareUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : `https://spaire.app/${organizationSlug}/events/${event.id}`

  const onShare = async () => {
    try {
      if (
        typeof navigator !== 'undefined' &&
        'share' in navigator &&
        typeof navigator.share === 'function'
      ) {
        await navigator.share({ title: event.title, url: shareUrl })
        return
      }
      await navigator.clipboard.writeText(shareUrl)
      setShareToast('Link copied')
      setTimeout(() => setShareToast(null), 2000)
    } catch {
      // User cancelled or clipboard blocked — silent.
    }
  }

  return (
    // Outer wrapper mimics the modal's `.eventIframe` interior
    // (without the faux browser chrome — this IS the real URL). We
    // pad top/bottom so the hero doesn't collide with the org header.
    //
    // `styles.root` is required: it defines the `--c-*` color tokens the
    // `.ev*` classes below consume. Without it the card text/panels/borders
    // fall back to the (dark-Space) inherited color — white text on the
    // white card. We keep the page background transparent so the wrapper
    // still sits on the org layout's surface, not the token's grey.
    <div
      className={styles.root}
      style={{ paddingTop: 8, paddingBottom: 80, background: 'transparent' }}
    >
      <article
        style={{
          maxWidth: 760,
          margin: '0 auto',
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 16px 48px rgba(0,0,0,0.10)',
          overflow: 'hidden',
        }}
      >
        <div className={styles.evHero}>
          <div className={styles.evHeroImg} style={coverStyle} />
          <div className={styles.evHeroGrad} />
          <div className={styles.evHeroMeta}>
            {event.live ? (
              <span className={styles.evHeroLive}>
                <span className={styles.dot} /> Live now
              </span>
            ) : event.past ? (
              <span
                className={styles.evHeroType}
                style={{ background: 'rgba(0,0,0,0.55)', color: '#fff' }}
              >
                Past
              </span>
            ) : null}
            <span className={styles.evHeroType}>
              {TYPE_LABEL[event.type] ?? event.type}
            </span>
          </div>
        </div>

        <div className={styles.evBody}>
          <div className={styles.evDatePill}>
            <IconCalendar size={11} /> {event.live ? 'Happening now' : whenDate}
          </div>
          <h1 className={styles.evTitle}>{event.title}</h1>

          <div className={styles.evRows}>
            <span className={styles.evRowIcon}>
              <IconClock size={16} />
            </span>
            <div className={styles.evRowText}>
              <strong>
                {event.live ? 'In progress' : `${whenDate} · ${whenTime}`}
              </strong>
              <div className={styles.evRowTextSub}>
                {event.duration_minutes} min · {event.course_name}
              </div>
            </div>

            <span className={styles.evRowIcon}>
              <IconMapPin size={16} />
            </span>
            <div className={styles.evRowText}>
              <strong>
                {event.meeting_url ? 'Online' : event.location || 'Online'}
              </strong>
              {event.meeting_url && !event.past ? (
                <div className={styles.evRowTextSub}>
                  <a
                    href={event.meeting_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{
                      color: 'var(--c-ink)',
                      wordBreak: 'break-all',
                      textDecoration: 'underline',
                      textUnderlineOffset: 2,
                    }}
                  >
                    {event.meeting_url}
                  </a>
                </div>
              ) : null}
            </div>

            <span className={styles.evRowIcon}>
              <IconUsers size={16} />
            </span>
            <div className={styles.evRowText}>
              <strong>Open to members of this course</strong>
              <div className={styles.evRowTextSub}>
                Enrol to RSVP and get reminders
              </div>
            </div>
          </div>

          <div className={styles.evSectionTitle}>Hosted by</div>
          <div className={styles.evHostCard}>
            <Avatar
              name={event.host.name}
              avatarUrl={event.host.avatar_url || undefined}
              size={44}
            />
            <div className={styles.evHostCardInfo}>
              <div className={styles.evHostCardName}>{event.host.name}</div>
              <div className={styles.evHostCardSub}>Instructor</div>
            </div>
          </div>

          <div className={styles.evSectionTitle}>About this event</div>
          <div className={styles.evDesc}>
            {event.description || 'No description yet.'}
          </div>
        </div>

        <div className={styles.evFooter}>
          <div className={styles.evFooterMeta}>
            <span>
              {event.live
                ? 'Live now'
                : event.past
                  ? 'Past event'
                  : 'Doors open 5 min before'}
            </span>
            <strong>
              {event.duration_minutes} min ·{' '}
              {TYPE_LABEL[event.type] ?? event.type}
            </strong>
          </div>
          <div
            className={styles.evFooterActions}
            style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}
          >
            <button
              type="button"
              className={`${styles.evFooterBtn} ${styles.evFooterBtnGhost}`}
              onClick={onShare}
              title="Copy share link"
            >
              <IconShare size={14} /> Share
            </button>
            <PublicCalendarMenu links={calLinks} />
            {event.live && event.meeting_url ? (
              // Live + we have the link: one tap straight into the room.
              <a
                href={event.meeting_url}
                target="_blank"
                rel="noreferrer noopener"
                className={`${styles.evFooterBtn} ${styles.evFooterBtnLive}`}
              >
                <IconVideo size={14} /> Join now
              </a>
            ) : event.past ? null : (
              // Upcoming: send them into the portal event where they can
              // RSVP + get reminders.
              <a
                href={portalUrl}
                className={`${styles.evFooterBtn} ${styles.evFooterBtnPrimary}`}
              >
                <IconPlayCircle size={14} /> RSVP in portal
              </a>
            )}
          </div>
        </div>
      </article>

      {shareToast ? (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            background: '#111',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 12,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
          role="status"
        >
          {shareToast}
        </div>
      ) : null}
    </div>
  )
}

function PublicCalendarMenu({
  links,
}: {
  links: { google: string; outlook: string; ics: string }
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (e.target instanceof Node && wrapperRef.current.contains(e.target)) {
        return
      }
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className={`${styles.evFooterBtn} ${styles.evFooterBtnGhost}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <IconCalendar size={14} /> Add to calendar
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            right: 0,
            minWidth: 200,
            background: '#fff',
            border: '1px solid var(--c-line)',
            borderRadius: 12,
            boxShadow: '0 16px 40px rgba(0,0,0,0.16)',
            padding: 6,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            zIndex: 8,
          }}
        >
          <CalLinkA
            href={links.google}
            label="Google Calendar"
            icon={<IconGoogleCalendar size={18} />}
          />
          <CalLinkA
            href={links.outlook}
            label="Outlook"
            icon={<IconOutlookCalendar size={18} />}
          />
          <CalLinkA
            href={links.ics}
            label="Apple Calendar (.ics)"
            icon={<IconAppleCalendar size={18} />}
            download
          />
        </div>
      ) : null}
    </div>
  )
}

function CalLinkA({
  href,
  label,
  icon,
  download,
}: {
  href: string
  label: string
  icon?: React.ReactNode
  download?: boolean
}) {
  return (
    <a
      role="menuitem"
      href={href}
      target={download ? undefined : '_blank'}
      rel="noreferrer noopener"
      {...(download ? { download: '' } : {})}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        textAlign: 'left',
        padding: '8px 12px',
        borderRadius: 8,
        textDecoration: 'none',
        fontSize: 13,
        color: 'var(--c-ink)',
      }}
    >
      {icon}
      <span>{label}</span>
    </a>
  )
}
