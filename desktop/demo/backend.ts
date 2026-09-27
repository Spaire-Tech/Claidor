/**
 * The demo's scripted backend: everything the app window asks Electron main
 * (window.desktop) and the coordinator (the gateway to the box) for, answered
 * from ./scenario.ts instead of a real Mac, box or server. Replies and events
 * use the host's own shapes (host-gateway-api.ts, roster-emit.ts,
 * roster-projection.ts, widget-responses.ts), so the pinned window draws them
 * the way it draws a real session.
 */
import {
  AGENTS, TRANSCRIPTS, ambientScript, at, creationScript, says, you,
  type Beat, type DemoAgent, type Entry,
} from "./scenario.js";

export interface DemoBackendHooks {
  readonly pushCoordinatorEvent: (family: string, payload: unknown) => void;
  readonly pushMainEvent: (event: string, payload: unknown) => void;
}

type Outcome = { status: "ok"; value: unknown } | { status: "failed"; failure: { code: string; message: string } };

const ok = (value: unknown): Outcome => ({ status: "ok", value });
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const unanswered = { main: new Set<string>(), coordinator: new Set<string>(), ipc: new Set<string>() };

const CONNECTED = [
  { id: "900001", name: "Gmail", identifier: "gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
  { id: "900002", name: "Notion", identifier: "notion", url: "https://mcp.notion.com/mcp" },
] as const;
const connectedServer = (s: (typeof CONNECTED)[number]) => ({
  id: s.id, name: s.name, serverIdentifier: s.identifier, accountKey: "default", rowServerIdentifier: s.identifier,
  transport: "http", url: s.url, toolCount: 12, customInstructions: "", isTeamServer: false, pluginId: s.identifier, status: "connected",
});

export function createDemoBackend(hooks: DemoBackendHooks) {
  const theme = { preference: "light", resolved: "light" };
  const persisted = new Map<string, unknown>();
  const epoch = "demo-" + Math.random().toString(36).slice(2);
  const sequences = new Map<string, number>();
  const stamp = (replicaKey: string) => {
    const sequence = (sequences.get(replicaKey) ?? 0) + 1;
    sequences.set(replicaKey, sequence);
    return { replicaKey, epoch, sequence };
  };

  const agents = new Map<string, DemoAgent>(AGENTS.map((a) => [a.id, a]));
  const transcripts = new Map<string, Entry[]>(Object.entries(TRANSCRIPTS).map(([id, entries]) => [id, [...entries]]));
  const outlines = new Map<string, Record<string, unknown>[]>();
  const running = new Map<string, { composing: boolean; activity?: Record<string, unknown> }>();
  const lastActivity = new Map<string, number>(AGENTS.map((a) => [a.id, at(a.minutesAgo)]));
  const unread = new Set<string>(["scout", "yodo"]);
  let activeAgentId = "simeon";
  let snapshotSeq = 0;
  let creationPlayed = false;
  let ambientStarted = false;

  const lastText = (entries: readonly Entry[]) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] as any;
      if (e.kind === "message" && typeof e.content === "string") return { id: e.id, text: e.content };
      if (e.kind === "send-message") {
        const m = e.message;
        if (m?.type === "text") return { id: e.id, text: m.content };
        if (m?.type === "widget") return { id: e.id, text: m.widget.prompt };
        if (m?.type === "email-draft") return { id: e.id, text: `Draft: ${m.draft.subject}` };
        if (m?.type === "connector") return { id: e.id, text: m.variant === "connected" ? `${m.connector} connected` : `Connect ${m.connector}` };
        if (m?.type === "connectors") return { id: e.id, text: `Connect ${m.connectors.join(", ")}` };
        if (m?.type === "auto-review-approval") return { id: e.id, text: `Approval required: ${m.approval.summary}` };
        if (m?.type === "attachment") return { id: e.id, text: "Sent a file" };
      }
    }
    return null;
  };
  const plain = (text: string) => text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);

  const summary = (agent: DemoAgent) => {
    const entries = transcripts.get(agent.id) ?? [];
    const last = lastText(entries);
    const time = lastActivity.get(agent.id) ?? at(agent.minutesAgo);
    const run = running.get(agent.id);
    const isUnread = unread.has(agent.id) && agent.id !== activeAgentId;
    return {
      id: agent.id, name: agent.name, description: agent.description, title: agent.title,
      avatarDataUrl: null, avatarVersion: null, avatarShape: "cloud", avatarColor: agent.color,
      createdAt: at(60 * 24 * 12), updatedAt: time, path: `/demo/${agent.id}/store.db`,
      isActive: agent.id === activeAgentId,
      isRunning: run != null, isRunningTurn: run != null, isComposingMessage: run?.composing ?? false, isRetrying: false,
      currentActivity: run?.activity,
      lastEntry: last == null ? null : { kind: "text", text: plain(last.text) },
      lastMessageId: last?.id ?? null, lastMessagePreview: last == null ? null : plain(last.text),
      newestEntryId: entries.at(-1)?.id ?? null,
      hasUnread: isUnread, unreadCount: isUnread ? 1 : 0, lastViewedAt: isUnread ? time - 1 : time, lastActivityAt: time,
      awaitingUserResponse: null, notificationsEnabled: true, notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false,
      origin: agent.id === "quill" ? "agent" : "user", isGroup: false, memberIds: [], conversationPartnerIds: [],
      snapshotEpoch: epoch, snapshotSeq: ++snapshotSeq,
    };
  };
  const roster = () => [...agents.values()].sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0)).map(summary);
  const windowOf = (id: string) => ({ entries: transcripts.get(id) ?? [], threadCounts: {} });

  const pushAgent = (id: string) => {
    const agent = agents.get(id);
    if (agent == null) return;
    hooks.pushCoordinatorEvent("agent-upserted", { activeAgentId, agent: summary(agent), ordered: stamp("roster") });
  };
  const pushRoster = () => {
    hooks.pushCoordinatorEvent("agents", { activeAgentId, agents: roster(), ordered: stamp("roster"), coverage: { kind: "complete-roster" } });
  };
  const pushTranscript = (agentId: string, event: Record<string, unknown>) => {
    hooks.pushCoordinatorEvent("transcript", { ...event, agentId, ordered: stamp(`transcript:${agentId}`) });
  };
  const append = (agentId: string, entry: Entry) => {
    const stamped = { ...entry, timestampMs: Date.now() };
    const list = transcripts.get(agentId) ?? [];
    list.push(stamped);
    transcripts.set(agentId, list);
    lastActivity.set(agentId, Date.now());
    if (agentId !== activeAgentId && !(stamped.kind === "message" && stamped.role === "user" && stamped.fromAgent == null)) unread.add(agentId);
    pushTranscript(agentId, { type: "appended", entry: stamped });
    pushAgent(agentId);
  };
  const update = (agentId: string, entryId: string, change: (entry: Entry) => Entry) => {
    const list = transcripts.get(agentId) ?? [];
    const index = list.findIndex((e) => e.id === entryId);
    if (index < 0) return null;
    list[index] = change(list[index]!);
    pushTranscript(agentId, { type: "updated", entry: list[index] });
    return list[index]!;
  };
  const setRunning = (agentId: string, on: boolean, activity?: Record<string, unknown>) => {
    if (on) running.set(agentId, { composing: activity == null, activity });
    else running.delete(agentId);
    pushAgent(agentId);
  };
  const outline = (agentId: string, item: Record<string, unknown>) => {
    const list = outlines.get(agentId) ?? [];
    const index = list.findIndex((i) => i.id === item.id);
    if (index >= 0) list[index] = item; else list.push(item);
    outlines.set(agentId, list);
    hooks.pushCoordinatorEvent("outline", { type: index >= 0 ? "updated" : "appended", agentId, item });
  };

  let liveCounter = 0;
  const nextId = (agentId: string, suffix: string) => `live-${agentId}-${++liveCounter}-${suffix}`;

  async function play(beats: readonly Beat[]): Promise<void> {
    const start = performance.now();
    for (const beat of beats) {
      const delay = beat.at - (performance.now() - start);
      if (delay > 0) await wait(delay);
      switch (beat.kind) {
        case "user": append(beat.agent, beat.entry); break;
        case "typing": setRunning(beat.agent, beat.on); break;
        case "step":
          outline(beat.agent, { kind: "tool-call", id: beat.id, name: beat.name, status: beat.status === "running" ? "running" : "completed", summary: beat.summary });
          setRunning(beat.agent, true, beat.status === "running" ? { kind: "tool", tool: beat.name, detail: beat.detail ?? beat.summary, ...(beat.target == null ? {} : { target: beat.target }) } : undefined);
          break;
        case "append": {
          const taken = (transcripts.get(beat.agent) ?? []).some((e) => e.id === beat.entry.id);
          append(beat.agent, taken ? { ...beat.entry, id: nextId(beat.agent, beat.entry.id) } : beat.entry);
          break;
        }
        case "create-agent":
          agents.set(beat.agent.id, beat.agent);
          transcripts.set(beat.agent.id, transcripts.get(beat.agent.id) ?? []);
          lastActivity.set(beat.agent.id, Date.now());
          running.set(beat.agent.id, { composing: false, activity: { kind: "tool", tool: "Setup", detail: "Getting ready" } });
          pushRoster();
          break;
      }
    }
  }

  // Replies to anything typed into the composer, per agent.
  const REPLIES: Record<string, string> = {
    simeon: "On it. I'll route that to whoever fits best and tell you when it's done.",
    scout: "Good question. Give me a few minutes to dig; I'll come back with sources.",
    yodo: "Done. I've added it to your Notion tracker and I'll follow up on Friday.",
    ledger: "Noted. I'll fold that into the October close.",
    quill: "Got it. I'll work that into the draft.",
  };

  async function reply(agentId: string): Promise<void> {
    await wait(600);
    setRunning(agentId, true);
    await wait(1400);
    append(agentId, { ...says("r", 0, REPLIES[agentId] ?? REPLIES.simeon!), id: nextId(agentId, "r") });
    setRunning(agentId, false);
  }

  async function working(agentId: string, id: string, tool: string, doing: string, done: string, ms: number): Promise<void> {
    setRunning(agentId, true, { kind: "tool", tool, detail: doing });
    outline(agentId, { kind: "tool-call", id, name: tool, status: "running", summary: doing });
    await wait(ms);
    outline(agentId, { kind: "tool-call", id, name: tool, status: "completed", summary: done });
    setRunning(agentId, false);
  }

  async function onWidgetAnswer(agentId: string, value: string): Promise<void> {
    if (agentId === "simeon" && value === "yes" && !creationPlayed) {
      creationPlayed = true;
      await play(creationScript().filter((b) => b.kind !== "user"));
      return;
    }
    if (agentId === "scout") {
      await wait(500);
      if (value !== "later") await working("scout", "book", "browser_navigate", "Booking a day pass", "Booked a day pass", 2600);
      append("scout", { ...says("x", 0, value === "later" ? "No problem, I'll hold off. The report stays in this chat." : `Booked: **${value === "jokkolabs" ? "Jokkolabs" : "Impact Hub"}**, Tuesday, 9:00–18:00. The confirmation is in your inbox and on your calendar.`), id: nextId("scout", "b") });
      return;
    }
    if (agentId === "quill") {
      await wait(700);
      setRunning("quill", true);
      await wait(1600);
      setRunning("quill", false);
      append("quill", { ...says("x", 0, value === "same" ? "Perfect. Same 23 investors as September. First draft lands here on the 3rd." : "Sure. Send me the names or paste the list here and I'll use that."), id: nextId("quill", "b") });
      return;
    }
    await reply(agentId);
  }

  const main: Record<string, (args: any) => unknown> = {
    getThemeState: () => theme,
    setThemePreference: () => theme,
    getOnboardingSeen: () => true,
    setOnboardingSeen: () => undefined,
    getWindowState: () => ({ isFullScreen: false, isMaximized: false, isFocused: true }),
    getTimeZone: () => ({ timeZone: "Europe/Zurich", override: null }),
    getSidebarCollapsed: () => false,
    markDeepLinksReady: () => undefined,
    getCursorAuthStatus: () => ({ kind: "logged-in", authId: "demo|bass", email: "bass@simeonlabs.com", displayName: "Bass F", freshness: 1 }),
    getSandAccess: () => ({ state: "granted", reason: "none" }),
    getSandAccessFresh: () => ({ state: "granted", reason: "none" }),
    getEgressTunnelStatus: () => null,
    getEgressTunnelEnabled: () => false,
    getWebauthnProxyEnabled: () => false,
    getUpdateStatus: () => ({ kind: "idle" }),
    getBoxMigrationStatus: () => null,
    getExperimentsSnapshot: () => null,
    getCursorUsageSummary: () => null,
    getCursorPrReviewPreferences: () => null,
    getHostPinnedAgents: () => [],
    getHostSidebarSections: () => [],
    getAgentDefaultModel: () => null,
    getCursorAvatar: () => null,
    resolveAttachmentMedia: () => null,
    getLinkMetadata: () => null,
    openExternal: () => undefined,
  };

  const coordinator: Record<string, (args: any) => unknown> = {
    listAgents: () => roster(),
    countAgents: () => agents.size,
    searchAgents: () => [],
    searchMedia: () => [],
    getAgentTranscriptWindow: (args) => windowOf(args.id),
    getAgentTranscriptTail: (args) => windowOf(args.id),
    openAgentTail: (args) => {
      const previous = activeAgentId;
      activeAgentId = args.id;
      unread.delete(args.id);
      if (previous !== args.id) { pushAgent(previous); pushAgent(args.id); }
      return windowOf(args.id);
    },
    getAgentThread: () => ({ entries: [] }),
    getConversationOutline: (args) => outlines.get(args?.id ?? args?.agentId) ?? [],
    sendPrompt: (args) => {
      const agentId = typeof args.agentId === "string" && args.agentId.length > 0 ? args.agentId : activeAgentId;
      const entry = you(nextId(agentId, "u"), 0, String(args.prompt ?? ""));
      append(agentId, { ...entry, ...(args.clientNonce ? { clientNonce: args.clientNonce } : {}) });
      void reply(agentId);
      return { accepted: true };
    },
    promptAcceptanceStatus: () => ({ status: "accepted" }),
    respondToWidget: (args) => {
      const agentId = args.agentId ?? activeAgentId;
      const updated = update(agentId, args.entryId, (e) => ({ ...e, respondedValue: args.value }));
      if (updated == null) return { accepted: false };
      void onWidgetAnswer(agentId, String(args.value));
      return { accepted: true };
    },
    dismissWidget: (args) => {
      update(args.agentId ?? activeAgentId, args.entryId, (e) => ({ ...e, widgetDismissed: true }));
      return {};
    },
    resolveAutoReviewApproval: (args) => {
      const decision = String(args.decision ?? args.resolution ?? args.status ?? "approved");
      const approved = !/deny|reject|decline/i.test(decision);
      for (const [agentId, list] of transcripts) {
        const entry = list.find((e: any) => e.kind === "send-message" && e.message?.type === "auto-review-approval" && e.message.approval.requestId === args.requestId);
        if (entry == null) continue;
        update(agentId, entry.id, (e: any) => ({ ...e, message: { ...e.message, approval: { ...e.message.approval, status: approved ? "approved" : "denied" } } }));
        if (approved) void (async () => {
          await wait(500);
          await working(agentId, "cancel", "Computer", "Cancelling Loom and Miro", "Cancelled Loom and Miro", 3000);
          append(agentId, { ...says("x", 0, "Both cancelled. That's **$38 a month** saved; I've noted it in the October close."), id: nextId(agentId, "c") });
        })();
      }
      return undefined;
    },
    sendDraft: (args) => {
      const agentId = args.agentId ?? activeAgentId;
      const updated = update(agentId, args.entryId, (e) => ({ ...e, draftState: "sent" }));
      void (async () => {
        await wait(900);
        append(agentId, { ...says("x", 0, "Sent to Atlas Print. The other two reminders are going out now."), id: nextId(agentId, "d") });
      })();
      return updated;
    },
    discardDraft: (args) => update(args.agentId ?? activeAgentId, args.entryId, (e) => ({ ...e, draftState: "discarded" })),
    reactToMessage: (args) => {
      update(args.agentId ?? activeAgentId, args.entryId, (e: any) => {
        const reactions = [...(e.reactions ?? [])];
        const i = reactions.findIndex((r: any) => r.emoji === args.emoji && r.by === "user");
        if (i >= 0) reactions.splice(i, 1); else reactions.push({ emoji: args.emoji, by: "user" });
        return { ...e, reactions: reactions.length > 0 ? reactions : undefined };
      });
      return undefined;
    },
    setAgentUnread: () => undefined,
    getTrays: () => [],
    getTeachRecordingStatus: () => ({ state: "idle" }),
    isAgentNetworkEnabled: () => true,
    isGlobalSearchEnabled: () => false,
    isEgressTunnelAvailable: () => false,
    getSharingState: () => ({ enabled: false, rooms: [] }),
    skillsCatalog: () => [],
    getSubagents: () => [],
    getAsyncTasks: () => [],
    getAgentWorkflows: () => [],
    getAgentAutomations: () => [],
    listAllAutomations: () => [],
    getAgentMemories: () => [],
    getAgentChannels: () => ({ channels: [] }),
    getForeverBoxStatus: () => ({ state: "ready" }),
  };

  return {
    onServing(): void {
      if (ambientStarted) return;
      ambientStarted = true;
      void play(ambientScript());
    },
    sync(channel: string): unknown {
      switch (channel) {
        case "sand:theme-get-sync": return theme;
        case "sand:egress-tunnel-get-sync": return false;
        case "sand:webauthn-proxy-get-sync": return false;
        default: return null;
      }
    },
    async main(method: string, args: unknown): Promise<unknown> {
      const handler = main[method];
      if (handler) return handler(args);
      unanswered.main.add(method);
      console.warn("[demo] main unanswered", method, args);
      return undefined;
    },
    async coordinator(method: string, args: unknown): Promise<Outcome> {
      const handler = coordinator[method];
      if (handler) return ok(await handler(args));
      unanswered.coordinator.add(method);
      console.warn("[demo] coordinator unanswered", method, JSON.stringify(args)?.slice(0, 300));
      return { status: "failed", failure: { code: "unknown-method", message: `demo does not serve ${method}` } };
    },
    async ipc(channel: string, payload: any): Promise<unknown> {
      if (channel === "sand:client-persistence-read") return persisted.get(payload?.key) ?? null;
      if (channel === "sand:client-persistence-write") { persisted.set(payload?.key, payload?.value); return undefined; }
      if (channel === "sand:client-persistence-remove") { persisted.delete(payload?.key); return undefined; }
      if (channel === "sand:client-persistence-list-keys") return [...persisted.keys()].filter((k) => k.startsWith(payload?.prefix ?? ""));
      if (channel === "sand:client-persistence-migrate") return undefined;
      if (channel === "sand:mcp-list") return { servers: CONNECTED.map(connectedServer) };
      if (channel === "sand:mcp-catalog") return { entries: [] };
      unanswered.ipc.add(channel);
      console.warn("[demo] ipc unanswered", channel, payload);
      return undefined;
    },
    /** Plays the Simeon → Quill creation, including your request, without a click. */
    playCreation(): Promise<void> {
      if (creationPlayed) return Promise.resolve();
      creationPlayed = true;
      return play(creationScript());
    },
  };
}
