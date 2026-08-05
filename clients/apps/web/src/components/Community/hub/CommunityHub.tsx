'use client'

/**
 * Community Hub — Creator console (full-page surface, replaces the v5
 * CommunityPreview). Implements the "Community Hub - Creator" design handoff:
 * frosted top nav, repositionable hero cover, Start · Feed · Activities ·
 * Events · Settings tabs, light/dark glass. Built section-by-section — this
 * file is the shell + theme + nav + hero + tab routing. Tab bodies land in
 * their own phases (see __design/creator-handoff/BUILD-PLAN.md §7).
 */
import {
  type CommunitySettingsRead,
  useCreatorCommunityIdentity,
  useCreatorCommunityMembers,
  useCreatorCommunitySettings,
  useUpdateCommunitySettings,
  useUploadPostImage,
} from '@/hooks/queries/community'
import { type CourseRead, usePreviewAccess } from '@/hooks/queries/courses'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { type CourseChannel, ActivitiesTab } from './Activities'
import { HeroCover } from './atoms'
import { EventsTab } from './Events'
import { FeedTab } from './Feed'
import './hub-extra.css'
import './hub.css'
import { Glyph } from './icons'
import { type ChannelOption } from './pickers'
import { SettingsTab } from './Settings'
import { StartTab } from './Start'

const { useState, useEffect, useRef, useCallback } = React

export type HubTab = 'start' | 'feed' | 'brief' | 'events' | 'frame'
const TABS: { k: HubTab; label: string }[] = [
  { k: 'start', label: 'Start' },
  { k: 'feed', label: 'Feed' },
  { k: 'brief', label: 'Activities' },
  { k: 'events', label: 'Events' },
  { k: 'frame', label: 'Settings' },
]

type Props = {
  organization: schemas['Organization']
  course: CourseRead
  /** Embedded inside the course editor: render the slim "Community › {course}"
   *  breadcrumb bar instead of the full-page nav (no back, no theme toggle, no
   *  draft pill), and let the editor control the theme. */
  embedded?: boolean
  dark?: boolean
}

export function CommunityHub({
  organization,
  course,
  embedded = false,
  dark: darkProp,
}: Props) {
  const router = useRouter()
  const courseId = course.id

  // —— theme. Standalone: own persisted toggle. Embedded: controlled by the
  // editor (one unified `spaire_theme`), no toggle rendered here. ——
  const [internalDark, setInternalDark] = useState(false)
  useEffect(() => {
    setInternalDark(localStorage.getItem('spaire_theme') === 'dark')
  }, [])
  const toggleTheme = () =>
    setInternalDark((d) => {
      const next = !d
      localStorage.setItem('spaire_theme', next ? 'dark' : 'light')
      return next
    })
  const dark = darkProp ?? internalDark

  const [tab, setTab] = useState<HubTab>('start')

  // —— toast ——
  const [toast, setToast] = useState<string | null>(null)
  const tRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((m: string) => {
    setToast(m)
    if (tRef.current) clearTimeout(tRef.current)
    tRef.current = setTimeout(() => setToast(null), 2400)
  }, [])

  // —— data ——
  const settingsQ = useCreatorCommunitySettings(courseId)
  const updateSettings = useUpdateCommunitySettings(courseId)
  const membersQ = useCreatorCommunityMembers(courseId)
  const identityQ = useCreatorCommunityIdentity(courseId)
  const uploadImg = useUploadPostImage(null, courseId, 'creator')

  const settings = settingsQ.data
  const published = !!settings?.enabled
  const memberCount = membersQ.data?.length ?? 0

  // —— optimistic cover state layered over settings (instant preview) ——
  const [coverOverride, setCoverOverride] = useState<{
    url?: string
    pos?: string
  }>({})
  const cover =
    coverOverride.url ?? settings?.hero_thumbnail_url ?? course.thumbnail_url
  const coverPos =
    coverOverride.pos ?? settings?.hero_thumbnail_object_position ?? '50% 36%'

  const patch = useCallback(
    (p: Partial<CommunitySettingsRead>) => updateSettings.mutate(p),
    [updateSettings],
  )

  // drag-to-reposition: debounce the persisted write, keep the preview instant
  const posTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onCoverPos = (pos: string) => {
    setCoverOverride((o) => ({ ...o, pos }))
    if (posTimerRef.current) clearTimeout(posTimerRef.current)
    posTimerRef.current = setTimeout(
      () => patch({ hero_thumbnail_object_position: pos }),
      450,
    )
  }
  const onCoverFile = async (file: File, dataUrl: string) => {
    setCoverOverride((o) => ({ ...o, url: dataUrl })) // optimistic
    try {
      const res = await uploadImg.mutateAsync(file)
      setCoverOverride((o) => ({ ...o, url: res.public_url }))
      patch({ hero_thumbnail_url: res.public_url })
      showToast('Cover updated')
    } catch {
      setCoverOverride((o) => ({ ...o, url: undefined }))
      showToast('Could not upload that image')
    }
  }

  const publish = () => {
    if (published) {
      showToast('Your community is live')
      return
    }
    patch({ enabled: true })
    showToast('Your community is live')
  }

  const backToEditor = () =>
    router.push(`/dashboard/${organization.slug}/courses/${courseId}`)

  // "View as student" needs a portal session — mint one for the admin's own
  // account (same flow as the outline's Preview button); opening the portal
  // URL bare would just land on the sign-in screen.
  const previewAccess = usePreviewAccess()
  const viewAsStudent = async () => {
    try {
      const { token } = await previewAccess.mutateAsync(courseId)
      window.open(
        `/${organization.slug}/portal/courses/${courseId}/community?customer_session_token=${token}`,
        '_blank',
      )
    } catch {
      showToast('Could not open the student view')
    }
  }

  const name = settings?.feed_title_override || course.title || 'Your community'
  const host = course.instructor_name || organization.name
  const defaultTagline = `Hosted by ${host}`
  const tagline = settings?.feed_eyebrow_override || defaultTagline
  const selfName = identityQ.data?.name || host
  const selfAvatar =
    identityQ.data?.avatar_url || organization.avatar_url || null

  // Activities attach to a course "channel": episodes (lessons) for a series,
  // otherwise modules. Derived from the loaded course.
  const channel: CourseChannel = React.useMemo(() => {
    if (course.format === 'series') {
      const options: ChannelOption[] = course.modules.flatMap((m) =>
        (m.lessons ?? []).map((l) => ({
          id: l.id,
          label: l.title,
          thumb: l.thumbnail_url ?? null,
        })),
      )
      return { kind: 'lesson', noun: 'episode', options }
    }
    return {
      kind: 'module',
      noun: 'module',
      options: course.modules.map((m) => ({ id: m.id, label: m.title })),
    }
  }, [course.format, course.modules])

  const lessonsCount = React.useMemo(
    () => course.modules.reduce((n, m) => n + (m.lessons?.length ?? 0), 0),
    [course.modules],
  )

  return (
    <div
      className={`spaire-hub ${dark ? 'dark' : ''} ${
        embedded ? 'is-embedded' : ''
      }`}
    >
      {embedded ? (
        <div className="ch-statusbar">
          <div className="ch-crumb">
            <span className="ch-crumb-parent">Community</span>
            <span className="ch-crumb-sep">›</span>
            <span className="ch-crumb-title">
              {course.title ?? 'Untitled course'}
            </span>
          </div>
          <div className="ch-statusbar-right">
            <button
              className="btn btn-primary btn-sm"
              onClick={publish}
              disabled={published}
            >
              {published ? 'Published' : 'Publish'}
            </button>
          </div>
        </div>
      ) : (
        <header className="cr-top">
          <div className="wrap cr-top-in">
            <button className="cr-back" onClick={backToEditor}>
              <Glyph d="back" size={16} stroke={2.4} /> Editor
            </button>
            <div className="cr-crumb">{course.title}</div>
            <span className={`cr-state ${published ? 'live' : ''}`}>
              <span className="sdot" />
              {published ? 'Published' : 'Draft'}
            </span>
            <button
              className="cr-tt"
              aria-label="Toggle appearance"
              onClick={toggleTheme}
            >
              <span className="ic-moon">
                <Glyph d="moon" size={17} stroke={1.9} />
              </span>
              <span className="ic-sun">
                <Glyph d="sun" size={17} stroke={1.9} />
              </span>
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={publish}
              disabled={published}
            >
              {published ? 'Published' : 'Publish'}
            </button>
          </div>
        </header>
      )}

      <HeroCover
        src={cover}
        pos={coverPos}
        onFile={onCoverFile}
        onPos={onCoverPos}
      >
        <div className="wrap mh-head">
          <h1 className="mh-title">{name}</h1>
          <div className="mh-by">{tagline}</div>
        </div>
      </HeroCover>

      <div className="mh-bar">
        <div className="wrap mh-bar-in">
          <div className="mh-meta">
            <b>{memberCount}</b> {memberCount === 1 ? 'member' : 'members'}
            <span style={{ margin: '0 10px', opacity: 0.5 }}>·</span>
            <span className="mh-draft">
              {published ? 'Live' : 'Not published yet'}
            </span>
          </div>
          <span className="spacer" />
          <button
            className="btn btn-quiet btn-sm"
            onClick={viewAsStudent}
            disabled={previewAccess.isPending}
          >
            <Glyph d="eye" size={15} stroke={1.9} />{' '}
            {previewAccess.isPending ? 'Opening…' : 'View as student'}
          </button>
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
          <FeedTab
            courseId={courseId}
            selfName={selfName}
            selfAvatar={selfAvatar}
            showToast={showToast}
          />
        ) : tab === 'events' ? (
          <EventsTab
            courseId={courseId}
            orgSlug={organization.slug}
            defaultProvider={settings?.default_meeting_provider ?? 'zoom'}
            memberRsvp={settings?.member_rsvp ?? true}
            showToast={showToast}
          />
        ) : tab === 'brief' ? (
          <ActivitiesTab
            courseId={courseId}
            channel={channel}
            selfName={selfName}
            selfAvatar={selfAvatar}
            showToast={showToast}
          />
        ) : tab === 'frame' ? (
          <SettingsTab
            courseId={courseId}
            courseTitle={course.title ?? 'Your course'}
            brandName={organization.name}
            courseCoverUrl={course.thumbnail_url ?? null}
            defaultTagline={defaultTagline}
            lessonsCount={lessonsCount}
            onViewCourse={() =>
              window.open(
                `/${organization.slug}/portal/courses/${courseId}`,
                '_blank',
              )
            }
            onDeleted={backToEditor}
            showToast={showToast}
          />
        ) : (
          <StartTab
            courseId={courseId}
            hostName={selfName}
            published={published}
            onPublish={publish}
            goTab={setTab}
          />
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
