import { useEffect, useRef } from "react";

import type { AgentSummary, TranscriptEntry } from "../bridge/types.js";
import type { WindowStateSnapshot, WindowStore } from "../state/store.js";
import { Avatar, GroupAvatar } from "./Avatar.js";
import { Composer } from "./Composer.js";

export function Conversation({ store, state, agent }: { readonly store: WindowStore; readonly state: WindowStateSnapshot; readonly agent: AgentSummary }) {
  const entries = state.transcripts[agent.id] ?? [];
  const byId = new Map(state.agents.map(row => [row.id, row] as const));
  const members = (agent.memberIds ?? []).map(id => byId.get(id)).filter((member): member is AgentSummary => member != null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scroller.current;
    if (node != null) node.scrollTop = node.scrollHeight;
  }, [entries.length, agent.id]);
  return (
    <section className="conversation" data-agent-id={agent.id}>
      <header className="conversation__header">
        <div className="conversation__drag" />
        <div className="header-card">
          {agent.isGroup === true && members.length > 0 ? <GroupAvatar members={members} size={44} /> : <Avatar agent={agent} size={44} />}
          <div className="header-card__pills">
            <span className="pill pill--name">{agent.name}</span>
            {agent.isGroup !== true ? <button type="button" className="pill pill--icon" title={`Call ${agent.name}`} aria-label={`Call ${agent.name}`}><PhoneIcon /></button> : null}
          </div>
        </div>
      </header>
      <div className="transcript" ref={scroller}>
        {state.loadingTranscript === agent.id && entries.length === 0 ? <p className="transcript__note">Loading…</p> : null}
        {entries.length === 0 && state.loadingTranscript !== agent.id ? <p className="transcript__note">Say hello to {agent.name}.</p> : null}
        {groupByDay(entries).map(day => (
          <div key={day.key} className="transcript__day">
            <div className="transcript__stamp">{day.label}</div>
            {day.entries.map(entry => <Line key={entry.id} entry={entry} agent={agent} byId={byId} />)}
          </div>
        ))}
        {agent.isRunningTurn === true || agent.isComposingMessage === true ? <div className="line line--agent"><div className="bubble bubble--agent bubble--thinking"><span /><span /><span /></div></div> : null}
      </div>
      <Composer agent={agent} onSend={text => store.send(agent.id, text)} />
    </section>
  );
}

function groupByDay(entries: readonly TranscriptEntry[]): Array<{ key: string; label: string; entries: TranscriptEntry[] }> {
  const days: Array<{ key: string; label: string; entries: TranscriptEntry[] }> = [];
  for (const entry of entries) {
    const stamp = typeof entry.timestampMs === "number" ? entry.timestampMs : undefined;
    const date = stamp == null ? null : new Date(stamp);
    const key = date == null ? "undated" : date.toDateString();
    let day = days.at(-1);
    if (day == null || day.key !== key) {
      day = { key, label: date == null ? "" : dayLabel(date), entries: [] };
      days.push(day);
    }
    day.entries.push(entry);
  }
  return days;
}

function dayLabel(date: Date, now = new Date()): string {
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (date.toDateString() === now.toDateString()) return `Today ${time}`;
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

function Line({ entry, agent, byId }: { readonly entry: TranscriptEntry; readonly agent: AgentSummary; readonly byId: ReadonlyMap<string, AgentSummary> }) {
  if (entry.kind === "message" && entry.role === "user" && entry.fromAgent == null) {
    return <div className="line line--you"><div className="bubble bubble--you">{entry.content ?? ""}</div></div>;
  }
  if (entry.kind === "message" && entry.role === "user" && entry.fromAgent != null) {
    return <Spoken who={byId.get(entry.fromAgent.id) ?? null} name={entry.fromAgent.name} text={entry.content ?? ""} note="replied" />;
  }
  if (entry.kind === "message" && entry.role === "assistant") {
    return <Spoken who={agent} name={agent.name} text={entry.content ?? ""} note={entry.toAgent == null ? undefined : `to ${entry.toAgent.name}`} />;
  }
  if (entry.kind === "send-message") {
    const author = entry.author == null ? null : byId.get(entry.author.id) ?? null;
    const message = entry.message ?? {};
    if (message.type === "text" && typeof message.content === "string") return <Spoken who={author ?? (agent.isGroup === true ? null : agent)} name={entry.author?.name ?? agent.name} text={message.content} showName={agent.isGroup === true} />;
    if (message.type === "attachment" && typeof message.url === "string") return <div className="line line--agent"><FileCard url={message.url} /></div>;
    return <div className="line line--agent"><div className="bubble bubble--agent bubble--card">{describeCard(message)}</div></div>;
  }
  if (entry.kind === "event") {
    const type = typeof entry.event?.type === "string" ? entry.event.type : "event";
    return <div className="line line--event"><span className="event-chip">{type.replace(/-/g, " ")}</span></div>;
  }
  return null;
}

function Spoken({ who, name, text, note, showName }: { readonly who: AgentSummary | null; readonly name: string; readonly text: string; readonly note?: string | undefined; readonly showName?: boolean }) {
  return (
    <div className="line line--agent">
      {showName === true && who != null ? <span className="line__who"><Avatar agent={who} size={18} /> {name}</span> : null}
      <div className="bubble bubble--agent">{renderText(text)}</div>
      {note != null ? <span className="line__note">{note}</span> : null}
    </div>
  );
}

function FileCard({ url }: { readonly url: string }) {
  const name = decodeURIComponent(url.split("/").pop() ?? "file");
  const extension = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  return (
    <div className="file-card">
      <span className={`file-card__icon file-card__icon--${extension}`}>{extension.slice(0, 4) || "file"}</span>
      <span className="file-card__name">{name}</span>
      <span className="file-card__download" aria-hidden="true"><DownloadIcon /></span>
    </div>
  );
}

function describeCard(message: { readonly type?: string }): string {
  return `${message.type ?? "card"} (drawn in a later slice)`;
}

/** Plain text with **bold**, links and line breaks; markdown proper comes with the cards slice. */
function renderText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|https?:\/\/\S+)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^https?:\/\//.test(part)) return <a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>;
    return <span key={index}>{part}</span>;
  });
}

function PhoneIcon() { return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 2.5h2.3l1 2.6-1.4 1.1a8 8 0 0 0 4.4 4.4l1.1-1.4 2.6 1v2.3a1 1 0 0 1-1 1A10.5 10.5 0 0 1 2.5 3.5a1 1 0 0 1 1-1z" fill="currentColor" /></svg>; }
function DownloadIcon() { return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v8m0 0 3-3M8 10 5 7M3 13h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>; }
