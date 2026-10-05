import { useMemo, useState } from "react";

import type { AgentSummary } from "../bridge/types.js";
import type { WindowStateSnapshot, WindowStore } from "../state/store.js";
import { Avatar, GroupAvatar } from "./Avatar.js";

export function formatWhen(timestampMs: number | null | undefined, now = Date.now()): string {
  if (timestampMs == null || !Number.isFinite(timestampMs)) return "";
  const date = new Date(timestampMs);
  const today = new Date(now);
  const sameDay = date.toDateString() === today.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (now - timestampMs < 6 * 86_400_000) return date.toLocaleDateString([], { weekday: "short" });
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function previewOf(agent: AgentSummary): string {
  if (agent.isRunningTurn === true || agent.isComposingMessage === true) return agent.currentActivity?.label ?? "Working…";
  return agent.lastMessagePreview ?? agent.description ?? "";
}

export function Sidebar({ store, state }: { readonly store: WindowStore; readonly state: WindowStateSnapshot }) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const agents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return state.agents;
    return state.agents.filter(agent => `${agent.name} ${agent.title ?? ""} ${agent.lastMessagePreview ?? ""}`.toLowerCase().includes(needle));
  }, [state.agents, query]);
  const pinned = agents.filter(agent => state.pinnedAgentIds.includes(agent.id));
  const rest = agents.filter(agent => !state.pinnedAgentIds.includes(agent.id));
  const byId = new Map(state.agents.map(agent => [agent.id, agent] as const));
  const initials = (state.personName ?? "").split(/\s+/).filter(Boolean).map(part => part[0]!.toUpperCase()).slice(0, 2).join("") || "•";

  return (
    <aside className="sidebar" data-collapsed={state.sidebarCollapsed ? "true" : "false"}>
      <div className="sidebar__drag" />
      <div className="sidebar__header">
        <button type="button" className="icon-button" title="Collapse sidebar (⌘B)" aria-label="Collapse sidebar" onClick={() => store.toggleSidebar()}>
          <SidebarIcon />
        </button>
        <button type="button" className="icon-button" title="New agent" aria-label="New agent">
          <PlusIcon />
        </button>
      </div>
      <label className="search">
        <SearchIcon />
        <input type="search" placeholder="Search" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search agents" />
      </label>
      <nav className="roster" aria-label="Agents">
        {pinned.length > 0 ? <SectionLabel>Pinned</SectionLabel> : null}
        {pinned.map(agent => <AgentRow key={agent.id} agent={agent} byId={byId} active={agent.id === state.activeAgentId} onOpen={() => void store.openAgent(agent.id)} />)}
        {rest.map(agent => <AgentRow key={agent.id} agent={agent} byId={byId} active={agent.id === state.activeAgentId} onOpen={() => void store.openAgent(agent.id)} />)}
        {agents.length === 0 ? <p className="roster__empty">{query.length > 0 ? "Nothing matches." : "No chats yet."}</p> : null}
      </nav>
      <div className="sidebar__footer">
        <button type="button" className="account-button" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
          <span className="account-button__initials">{initials}</span>
        </button>
        <button type="button" className="link-button">Connect apps</button>
        {menuOpen ? (
          <div className="menu" role="menu">
            <div className="menu__who">{state.personName ?? (state.auth.kind === "logged-in" ? state.auth.email ?? "" : "")}</div>
            <button type="button" role="menuitem" className="menu__item" onClick={() => setMenuOpen(false)}>Settings</button>
            <button type="button" role="menuitem" className="menu__item" onClick={() => setMenuOpen(false)}>About Simeon</button>
            <button type="button" role="menuitem" className="menu__item menu__item--danger" onClick={() => { setMenuOpen(false); void store.signOut(); }}>Log out</button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { readonly children: string }) {
  return <div className="roster__section">{children}</div>;
}

function AgentRow({ agent, byId, active, onOpen }: { readonly agent: AgentSummary; readonly byId: ReadonlyMap<string, AgentSummary>; readonly active: boolean; readonly onOpen: () => void }) {
  const members = (agent.memberIds ?? []).map(id => byId.get(id)).filter((member): member is AgentSummary => member != null);
  const unread = agent.hasUnread === true && !active;
  return (
    <button type="button" className={`agent-row${active ? " agent-row--active" : ""}${unread ? " agent-row--unread" : ""}`} onClick={onOpen} aria-current={active ? "page" : undefined}>
      {agent.isGroup === true && members.length > 0 ? <GroupAvatar members={members} size={40} /> : <Avatar agent={agent} size={40} />}
      <span className="agent-row__text">
        <span className="agent-row__top">
          <span className="agent-row__name">{agent.name}</span>
          {agent.title != null && agent.title.length > 0 ? <span className="agent-row__title">{agent.title}</span> : null}
          <span className="agent-row__when">{formatWhen(agent.lastActivityAt ?? agent.updatedAt)}</span>
        </span>
        <span className="agent-row__preview">{previewOf(agent)}</span>
      </span>
      {unread ? <span className="agent-row__dot" aria-label="Unread" /> : null}
    </button>
  );
}

function PlusIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" /></svg>; }
function SearchIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none" /><path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>; }
function SidebarIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" fill="none" /><path d="M6 3v10" stroke="currentColor" strokeWidth="1.4" /></svg>; }
