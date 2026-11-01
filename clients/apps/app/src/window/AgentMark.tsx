// An agent's picture (`AgentMark`, `AgentPicture` and `GroupMark` in
// mac/Simeon/Pictures.swift): its face or its own picture in a circle with a
// faint edge; a group without a picture of its own as its first members
// drawn together, each later one cut out of the ones before by a small gap;
// past four members, three and "+N".

import { useId } from 'react'
import { groupGap, groupSlots, pictureURL } from '../core/faces'
import type { Agent } from '../core/models'

type Member =
  | { kind: 'picture'; url: string }
  | { kind: 'blank' }
  | { kind: 'more'; count: number }

function memberOf(agent: Agent): Member {
  const url = pictureURL(agent)
  return url ? { kind: 'picture', url } : { kind: 'blank' }
}

function GroupMark({ members, size }: { members: Member[]; size: number }) {
  const id = useId()
  const shown: Member[] =
    members.length > 4
      ? [...members.slice(0, 3), { kind: 'more', count: members.length - 3 }]
      : members
  const slots = groupSlots(shown.length, size)
  const gap = groupGap(size)
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <defs>
        {shown.map((_, index) => {
          const slot = slots[index]!
          const r = slot.size / 2
          return (
            <g key={index}>
              <clipPath id={`${id}-clip-${index}`}>
                <circle cx={slot.x + r} cy={slot.y + r} r={r} />
              </clipPath>
              {/* What later members cut from this one: their circle widened by the gap. */}
              <mask id={`${id}-mask-${index}`}>
                <rect width={size} height={size} fill="white" />
                {slots.slice(index + 1, shown.length).map((later, j) => (
                  <circle
                    key={j}
                    cx={later.x + later.size / 2}
                    cy={later.y + later.size / 2}
                    r={later.size / 2 + gap}
                    fill="black"
                  />
                ))}
              </mask>
            </g>
          )
        })}
      </defs>
      {shown.map((member, index) => {
        const slot = slots[index]!
        const r = slot.size / 2
        return (
          <g key={index} mask={`url(#${id}-mask-${index})`}>
            {member.kind === 'picture' ? (
              <>
                <image
                  href={member.url}
                  x={slot.x}
                  y={slot.y}
                  width={slot.size}
                  height={slot.size}
                  preserveAspectRatio="xMidYMid slice"
                  clipPath={`url(#${id}-clip-${index})`}
                />
                <circle
                  cx={slot.x + r}
                  cy={slot.y + r}
                  r={r - 0.25}
                  fill="none"
                  stroke="var(--picture-edge)"
                  strokeWidth={0.5}
                />
              </>
            ) : (
              <circle
                cx={slot.x + r}
                cy={slot.y + r}
                r={r}
                fill="var(--member-blank)"
              />
            )}
            {member.kind === 'more' && (
              <text
                x={slot.x + r}
                y={slot.y + r}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={slot.size * 0.34}
                fontWeight={500}
                fill="var(--member-more)"
              >
                +{member.count}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function Picture({ url, size }: { url?: string; size: number }) {
  return (
    <span className="picture" style={{ width: size, height: size }}>
      {url && <img src={url} alt="" />}
    </span>
  )
}

export function AgentMark({
  agent,
  agents,
  size,
}: {
  agent: Agent
  agents: readonly Agent[]
  size: number
}) {
  if (agent.isGroup && !pictureURL(agent)) {
    const members = agent.memberIds
      .map((id) => agents.find((other) => other.id === id))
      .filter((member): member is Agent => member != null)
      .map(memberOf)
    // A group whose members this app does not know (someone else's room): the quiet disc.
    if (members.length === 0) return <Picture size={size} />
    return <GroupMark members={members} size={size} />
  }
  return <Picture url={pictureURL(agent)} size={size} />
}
