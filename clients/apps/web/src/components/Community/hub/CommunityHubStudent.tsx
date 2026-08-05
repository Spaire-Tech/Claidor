'use client'
/* eslint-disable @next/next/no-img-element */

/**
 * Community Hub — STUDENT (customer portal) shell.
 *
 * The member-facing mirror of the creator console. Same design language and the
 * same leaf components (Composer, posts, comments, polls, activity & event
 * cards) — wired to the customer-portal endpoints and limited to a member's
 * capabilities via <HubProvider viewer="member">. Read-only hero, no publish,
 * no moderation. Tabs: Feed · Activities · Events · Members · Profile.
 */
import { PortalLoading } from '@/app/(main)/[organization]/portal/_components/PortalLoading'
import {
  useCommunityMembers,
  useCommunitySettings,
} from '@/hooks/queries/community'
import { useCustomerCourse } from '@/hooks/queries/courses'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { ActivitiesTab } from './Activities'
import { HubProvider } from './context'
import { EventsTab } from './Events'
import { StudentFeedTab } from './Feed'
import './hub-extra.css'
import './hub.css'
import { HubAvatar } from './HubAvatar'
import { MembersTab } from './Members'
import { ProfileTab } from './Profile'

const { useState, useRef, useCallback, useMemo, useEffect } = React

// The customer portal (this student community view included) is always dark.
function usePortalDark(_slug: string): boolean {
  return true
}

type StudentTab = 'feed' | 'brief' | 'events' | 'members' | 'profile'
const TABS: { k: StudentTab; label: string }[] = [
  { k: 'feed', label: 'Feed' },
  { k: 'brief', label: 'Activities' },
  { k: 'events', label: 'Events' },
  { k: 'members', label: 'Members' },
  { k: 'profile', label: 'Profile' },
]

export function CommunityHubStudent({
  courseId,
  token,
  organizationSlug,
}: {
  courseId: string
  token: string
  organizationSlug: string
}) {
  const router = useRouter()
  const dark = usePortalDark(organizationSlug)

  const detailQ = useCustomerCourse(token, courseId)
  const settingsQ = useCommunitySettings(token, courseId)
  const membersQ = useCommunityMembers(token, courseId)

  const detail = detailQ.data
  const settings = settingsQ.data
  const course = detail?.course
  const memberCount = membersQ.data?.length ?? 0

  const selfName = detail?.customer_name || 'You'
  const selfAvatar = detail?.customer_avatar_url ?? null
  const selfEnrollmentId = detail?.enrollment_id ?? null

  const brand = course?.instructor_name || 'Your host'
  const title =
    settings?.feed_title_override || course?.title || 'Your community'
  const eyebrow = settings?.feed_eyebrow_override || `Hosted by ${brand}`
  const cover =
    settings?.hero_thumbnail_url || course?.thumbnail_url || undefined
  const coverPos =
    settings?.hero_thumbnail_object_position ||
    course?.thumbnail_object_position ||
    'center 36%'

  const lessonsCount = useMemo(
    () =>
      (course?.modules ?? []).reduce((n, m) => n + (m.lessons?.length ?? 0), 0),
    [course?.modules],
  )

  const [tab, setTab] = useState<StudentTab>('feed')

  const [toast, setToast] = useState<string | null>(null)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((m: string) => {
    setToast(m)
    if (tRef.current) clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 2400)
  }, [])

  const goToCourse = () =>
    router.push(`/${organizationSlug}/portal/courses/${courseId}`)

  const ctx = useMemo(
    () => ({
      mode: 'customer' as const,
      token,
      viewer: 'member' as const,
      selfEnrollmentId,
    }),
    [token, selfEnrollmentId],
  )

  // Hold the whole hub behind the boot loader until the course detail AND
  // community settings have landed. Rendering earlier painted the hero
  // without its cover (then with the course thumbnail, then with the
  // settings override + saved object-position) — the "image jumps into
  // place" glitch on entering Community.
  if (detailQ.isLoading || settingsQ.isLoading) {
    return <PortalLoading />
  }

  return (
    <HubProvider value={ctx}>
      <div className={`spaire-hub ${dark ? 'dark' : ''}`}>
        <div className="mh-cover is-static">
          {cover && (
            <img src={cover} alt="" style={{ objectPosition: coverPos }} />
          )}
          <div className="wrap mh-head">
            <h1 className="mh-title">{title}</h1>
            <div className="mh-by">{eyebrow}</div>
          </div>
        </div>

        <div className="mh-bar">
          <div className="wrap mh-bar-in">
            <div className="mh-meta">
              <b>{memberCount}</b> {memberCount === 1 ? 'member' : 'members'}
            </div>
            <span className="spacer" />
            <span className="who">
              <HubAvatar
                name={selfName}
                url={selfAvatar}
                style={{ width: 28, height: 28 }}
              />
              {selfName}
            </span>
          </div>
        </div>

        <div className="tabs cr-tabs">
          <div className="wrap tabs-in">
            {TABS.map((t) => (
              <button
                key={t.k}
                className={`tab ${tab === t.k ? 'on' : ''}`}
                onClick={() => setTab(t.k)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="wrap content">
          {tab === 'feed' ? (
            <StudentFeedTab
              courseId={courseId}
              token={token}
              selfName={selfName}
              selfAvatar={selfAvatar}
              showToast={showToast}
            />
          ) : tab === 'brief' ? (
            <ActivitiesTab
              courseId={courseId}
              selfName={selfName}
              selfAvatar={selfAvatar}
              showToast={showToast}
            />
          ) : tab === 'events' ? (
            <EventsTab
              courseId={courseId}
              orgSlug={organizationSlug}
              defaultProvider={settings?.default_meeting_provider ?? 'zoom'}
              memberRsvp={settings?.member_rsvp ?? true}
              showToast={showToast}
            />
          ) : tab === 'members' ? (
            <MembersTab courseId={courseId} token={token} />
          ) : (
            <ProfileTab
              token={token}
              selfName={selfName}
              selfAvatar={selfAvatar}
              courseTitle={course?.title ?? 'your masterclass'}
              brandName={brand}
              lessonsCount={lessonsCount}
              onGoToCourse={goToCourse}
              showToast={showToast}
            />
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    </HubProvider>
  )
}
