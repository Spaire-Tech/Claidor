'use client'

/**
 * Community Hub — Members tab (student view).
 *
 * The room's roster: the host (sealed), then everyone else. Read-only — members
 * see who they're learning alongside. Uses the customer-portal members list.
 */
import {
  type CommunityMemberRead,
  useCommunityMembers,
} from '@/hooks/queries/community'
import * as React from 'react'
import { HeadInfo } from './HeadInfo'
import { HubAvatar } from './HubAvatar'
import { Glyph } from './icons'

function joinedLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `Joined ${d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
}

export function MembersTab({
  courseId,
  token,
}: {
  courseId: string
  token: string
}) {
  const membersQ = useCommunityMembers(token, courseId)
  const members = React.useMemo<CommunityMemberRead[]>(
    () => membersQ.data ?? [],
    [membersQ.data],
  )
  // Host(s) first, then students.
  const ordered = React.useMemo(
    () =>
      [...members].sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'instructor' ? -1 : 1
        return (a.name ?? '').localeCompare(b.name ?? '')
      }),
    [members],
  )

  return (
    <>
      <div className="cr-head">
        <div>
          <div className="h">
            Members
            <HeadInfo>
              Everyone in the room with you. Hosts are marked with a seal; the
              rest are members learning alongside you.
            </HeadInfo>
          </div>
        </div>
      </div>

      {membersQ.isLoading ? (
        <div className="members">
          {[0, 1, 2].map((i) => (
            <div key={i} className="member">
              <span className="mav hub-av-fallback" />
              <div className="member-id">
                <div className="mn">Loading…</div>
              </div>
            </div>
          ))}
        </div>
      ) : membersQ.isError ? (
        <div className="card crf-empty">
          <span className="crf-empty-ic">
            <Glyph d="users" size={26} stroke={1.7} />
          </span>
          <h3>Couldn&apos;t load members</h3>
          <p>Something went wrong. Please refresh to try again.</p>
        </div>
      ) : ordered.length === 0 ? (
        <div className="card crf-empty">
          <span className="crf-empty-ic">
            <Glyph d="users" size={26} stroke={1.7} />
          </span>
          <h3>No members yet</h3>
          <p>You’re early. As people join the course, they’ll appear here.</p>
        </div>
      ) : (
        <div className="members">
          {ordered.map((m) => {
            const isHost = m.kind === 'instructor'
            return (
              <div className="member" key={m.id}>
                <HubAvatar name={m.name} url={m.avatar_url} className="mav" />
                <div className="member-id">
                  <div className="mn">
                    {m.name ?? 'Member'}
                    {isHost && (
                      <span className="role">
                        <Glyph d="seal" size={13} stroke={1.7} /> Host
                      </span>
                    )}
                  </div>
                  <div className="mr">
                    {isHost
                      ? 'Host of this community'
                      : joinedLabel(m.joined_at)}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
