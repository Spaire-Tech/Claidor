'use client'

/**
 * Community Hub — Start tab (creator).
 *
 * Welcome + a 0/4 setup checklist (post a welcome · create an activity ·
 * schedule a live moment · publish) whose done-states derive from live data,
 * plus an "At a glance" list. Flips to a "ready to open the doors" banner once
 * everything's set.
 */
import {
  useCommunityActivities,
  useCommunityEvents,
  useCreatorCommunityPosts,
} from '@/hooks/queries/community'
import { type HubTab } from './CommunityHub'
import { Ring } from './atoms'
import { Glyph } from './icons'

type Task = {
  k: string
  done: boolean
  tt: string
  ts: string
  to: HubTab | null
}

export function StartTab({
  courseId,
  hostName,
  published,
  onPublish,
  goTab,
}: {
  courseId: string
  hostName: string
  published: boolean
  onPublish: () => void
  goTab: (t: HubTab) => void
}) {
  const postsQ = useCreatorCommunityPosts(courseId)
  const activitiesQ = useCommunityActivities(null, courseId, 'creator')
  const eventsQ = useCommunityEvents(null, courseId, 'creator')

  const hasPost = (postsQ.data?.pages ?? []).some((p) => p.items.length > 0)
  const hasActivity = (activitiesQ.data ?? []).length > 0
  const hasEvent = (eventsQ.data ?? []).length > 0

  const tasks: Task[] = [
    {
      k: 'welcome',
      done: hasPost,
      tt: 'Post a welcome',
      ts: 'Greet your members in the feed so the room feels alive on day one',
      to: 'feed',
    },
    {
      k: 'prompt',
      done: hasActivity,
      tt: 'Create an activity',
      ts: 'What you ask members to make — collects their submissions',
      to: 'brief',
    },
    {
      k: 'event',
      done: hasEvent,
      tt: 'Schedule a live moment',
      ts: 'Give the work its stakes — a critique or Q&A',
      to: 'events',
    },
    {
      k: 'publish',
      done: published,
      tt: 'Publish your community',
      ts: 'Open the doors and make it live for your students',
      to: null,
    },
  ]
  const doneCount = tasks.filter((t) => t.done).length
  const allDone = doneCount === tasks.length

  const glance: { label: string; hint: string; to: HubTab }[] = [
    {
      label: 'Feed',
      hint: 'Announcements and the running conversation with your members',
      to: 'feed',
    },
    {
      label: 'Activities',
      hint: 'The unit of work your room revolves around',
      to: 'brief',
    },
    {
      label: 'Events',
      hint: 'Live moments that give the work its stakes',
      to: 'events',
    },
    {
      label: 'Settings',
      hint: 'Identity, access, moderation, events, and notifications',
      to: 'frame',
    },
  ]

  return (
    <>
      {allDone ? (
        <div className="card ready" style={{ marginBottom: 30 }}>
          <span className="ready-ic">
            <Glyph d="check" size={24} stroke={2.6} />
          </span>
          <div className="ready-main">
            <h2>You’re ready to open the doors</h2>
            <p>
              Everything’s set. Invite your members and the room starts filling
              up.
            </p>
          </div>
          <div className="ready-cta">
            <button className="btn btn-primary" onClick={() => goTab('feed')}>
              Go to your feed{' '}
              <Glyph d="chevR" size={16} stroke={1.9} />
            </button>
          </div>
        </div>
      ) : (
        <div className="card setup" style={{ marginBottom: 30 }}>
          <div className="setup-ring">
            <Ring
              pct={(doneCount / tasks.length) * 100}
              size={96}
              stroke={9}
              label={`${doneCount}/${tasks.length}`}
              sub="done"
            />
          </div>
          <div className="setup-head">
            <div className="eyebrow">Welcome, {hostName}</div>
            <h2>Set your community up</h2>
            <p>
              A handful of choices — what the work is, the live moments that give
              it stakes, and opening the doors. Members never see these controls;
              they just experience the room they create.
            </p>
          </div>
          <div className="setup-tasks">
            {tasks.map((t) => (
              <button
                key={t.k}
                className={`task${t.done ? ' done' : ''}`}
                onClick={() => (t.to ? goTab(t.to) : onPublish())}
              >
                <span className="task-check">
                  <Glyph d="check" size={15} stroke={2.6} />
                </span>
                <span className="task-main">
                  <span className="task-tt">{t.tt}</span>
                  <span className="task-ts">{t.ts}</span>
                </span>
                <span className="task-cta">
                  {t.done ? (
                    'Done'
                  ) : (
                    <>
                      {t.k === 'publish' ? 'Publish' : 'Open'}{' '}
                      <Glyph d="chevR" size={15} stroke={2} />
                    </>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="glist-label">At a glance</div>
      <div className="card glist">
        {glance.map((g) => (
          <button
            key={g.to}
            className="grow"
            style={{ width: '100%', textAlign: 'left' }}
            onClick={() => goTab(g.to)}
          >
            <div className="grow-main">
              <div className="gl">{g.label}</div>
              <div className="gs">{g.hint}</div>
            </div>
            <div className="grow-ctl">
              <span className="task-cta">
                Open <Glyph d="chevR" size={15} stroke={2} />
              </span>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}
