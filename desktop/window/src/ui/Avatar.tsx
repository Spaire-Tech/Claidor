import type { AgentSummary } from "../bridge/types.js";

/** The agent's colour names the host uses, as two-stop gradients. */
const TONES: Record<string, readonly [string, string]> = {
  blue: ["#3f7fbf", "#6fc6b8"],
  teal: ["#2f9c8f", "#8fd3c5"],
  green: ["#4a9c5b", "#a8d8a0"],
  purple: ["#6b5bbf", "#b59de6"],
  orange: ["#d98a3f", "#f2c38f"],
  pink: ["#c95b8f", "#efa7c8"],
  red: ["#c9544f", "#efa29e"],
  grey: ["#6b7280", "#b7bcc6"],
};

function tone(color: string | null | undefined): readonly [string, string] {
  return TONES[(color ?? "blue").toLowerCase()] ?? TONES.blue!;
}

export function Avatar({ agent, size = 40 }: { readonly agent: AgentSummary; readonly size?: number }) {
  if (agent.avatarDataUrl != null && agent.avatarDataUrl.length > 0) {
    return <img className="avatar avatar--image" src={agent.avatarDataUrl} width={size} height={size} alt="" style={{ width: size, height: size }} />;
  }
  const [from, to] = tone(agent.avatarColor);
  const id = `avatar-${agent.id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ width: size, height: size }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <path d="M11 32c-4.6 0-8-3.3-8-7.6 0-3.7 2.6-6.8 6.1-7.4C10 11.6 14.5 7 20 7c5.1 0 9.3 3.8 10.3 8.8 3.8.5 6.7 3.7 6.7 7.6 0 4.7-3.6 8.6-8.4 8.6H11z" fill={`url(#${id})`} />
      <circle cx="15.5" cy="22" r="2.1" fill="#fff" opacity="0.92" />
      <circle cx="24.5" cy="22" r="2.1" fill="#fff" opacity="0.92" />
    </svg>
  );
}

/** A group's members, overlapped, as the group's face. */
export function GroupAvatar({ members, size = 40 }: { readonly members: readonly AgentSummary[]; readonly size?: number }) {
  const shown = members.slice(0, 3);
  return (
    <div className="avatar-group" style={{ width: size, height: size }}>
      {shown.map((member, index) => (
        <div key={member.id} className="avatar-group__member" style={{ left: index * (size * 0.28), top: index % 2 === 0 ? 0 : size * 0.3 }}>
          <Avatar agent={member} size={size * 0.62} />
        </div>
      ))}
    </div>
  );
}
