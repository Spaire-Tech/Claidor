/**
 * The demo's scripted backend: everything the app window asks Electron main
 * (window.desktop) and the coordinator (the gateway to the box) for, answered
 * from ./scenario.ts instead of a real Mac, box or server. Replies and events
 * use the host's own shapes (host-gateway-api.ts, roster-emit.ts,
 * roster-projection.ts, widget-responses.ts), so the pinned window draws them
 * the way it draws a real session.
 */
import {
  AGENTS, GROUP, GROUP_TRANSCRIPT, TRANSCRIPTS, at, onboardingScript, openingScript,
  type Beat, type DemoAgent, type Entry,
} from "./scenario.js";
import { CONNECTOR_MANIFESTS } from "../source/shared/channels.js";

export interface DemoBackendHooks {
  readonly pushCoordinatorEvent: (family: string, payload: unknown) => void;
  readonly pushMainEvent: (event: string, payload: unknown) => void;
  /** Hands the window a fresh coordinator port, as the app does once a sign-in has started the cloud computer. */
  readonly reconnectCoordinator?: () => void;
  /** Multiplies every scripted delay; tests play the story at 1/100 speed-up. */
  readonly timeScale?: number;
}

type Outcome = { status: "ok"; value: unknown } | { status: "failed"; failure: { code: string; message: string } };

const ok = (value: unknown): Outcome => ({ status: "ok", value });

export const unanswered = { main: new Set<string>(), coordinator: new Set<string>(), ipc: new Set<string>() };

/** The tools the founder in the story connects, shown as connected. */
const CONNECTED = [
  { id: "900001", name: "Gmail", identifier: "gmail", url: "https://gmailmcp.googleapis.com/mcp/v1" },
  { id: "900002", name: "Google Calendar", identifier: "google-calendar", url: "https://calendarmcp.googleapis.com/mcp/v1" },
  { id: "900003", name: "Stripe", identifier: "stripe", url: "https://mcp.stripe.com" },
  { id: "900004", name: "QuickBooks", identifier: "quickbooks", url: "https://api.simeonlabs.com/v1/desktop/apps/quickbooks/mcp" },
  { id: "900005", name: "Notion", identifier: "notion", url: "https://mcp.notion.com/mcp" },
  { id: "900006", name: "Intercom", identifier: "intercom", url: "https://mcp.intercom.com/mcp" },
  { id: "900007", name: "Slack", identifier: "slack", url: "https://mcp.slack.com/mcp" },
  { id: "900008", name: "Linear", identifier: "linear", url: "https://mcp.linear.app/mcp" },
] as const;
const connectedServer = (s: (typeof CONNECTED)[number]) => ({
  id: s.id, name: s.name, serverIdentifier: s.identifier, accountKey: "default", rowServerIdentifier: s.identifier,
  transport: "http", url: s.url, toolCount: 12, customInstructions: "", isTeamServer: false, pluginId: s.identifier, status: "connected",
});

/** A roster row: one of the agents, or the group they share with you. */
type Row = DemoAgent & { readonly isGroup?: boolean; readonly memberIds?: readonly string[] };

export function createDemoBackend(hooks: DemoBackendHooks) {
  const scale = hooks.timeScale ?? 1;
  // Follows the Mac's appearance, so dark mode can be checked from the hosted link; `?theme=light` or `?theme=dark` forces one.
  const asked = typeof location !== "undefined" ? new URLSearchParams(location.search).get("theme") : null;
  const dark = asked === "dark" || (asked !== "light" && typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches);
  let theme = dark ? { preference: "dark", resolved: "dark" } : { preference: "light", resolved: "light" };
  // `?onboarding`: a brand-new account, as the real window first meets it (the
  // founder, 3 October 2026: "build a demo here of the real onboarding").
  const params = typeof location !== "undefined" ? new URLSearchParams(location.search) : new URLSearchParams();
  const fresh = params.has("onboarding");
  let onboardingSeen = !fresh;
  let personName: string | null = fresh ? null : "Bass";
  let onboardingStage = 0;
  // A new account starts signed out: the window's sign-in screen comes first.
  const signedIn = { kind: "logged-in", authId: "demo|bass", email: "bass@simeonlabs.com", displayName: "Bass F", freshness: 1 };
  let authStatus: Record<string, unknown> = fresh ? { kind: "logged-out" } : signedIn;
  const persisted = new Map<string, unknown>();
  const epoch = "demo-" + Math.random().toString(36).slice(2);
  const sequences = new Map<string, number>();
  const stamp = (replicaKey: string) => {
    const sequence = (sequences.get(replicaKey) ?? 0) + 1;
    sequences.set(replicaKey, sequence);
    return { replicaKey, epoch, sequence };
  };

  const group: Row = { id: GROUP.id, name: GROUP.name, title: "", description: GROUP.description, color: "blue", minutesAgo: GROUP.minutesAgo, isGroup: true, memberIds: GROUP.memberIds };
  const rows = new Map<string, Row>(fresh ? [] : [...AGENTS.map((a) => [a.id, a] as const), [group.id, group]]);
  const nameOf = (id: string) => rows.get(id)?.name ?? id;
  const transcripts = new Map<string, Entry[]>(Object.entries(TRANSCRIPTS).map(([id, entries]) => [id, [...entries]]));
  transcripts.set(group.id, GROUP_TRANSCRIPT.map(({ author, entry }) => (author == null ? entry : { ...entry, author: { id: author, name: nameOf(author) } })));
  const outlines = new Map<string, Record<string, unknown>[]>();
  const running = new Map<string, { composing: boolean; activity?: Record<string, unknown> }>();
  const lastActivity = new Map<string, number>([...rows.values()].map((r) => [r.id, at(r.minutesAgo)]));
  const unread = new Set<string>([group.id]);
  let activeAgentId = "simeon";
  let snapshotSeq = 0;
  let openingStarted = false;

  const lastText = (entries: readonly Entry[]) => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i] as any;
      if (e.kind === "message" && typeof e.content === "string") return { id: e.id, text: e.content };
      if (e.kind === "send-message") {
        const m = e.message;
        const by = e.author?.name ? `${e.author.name}: ` : "";
        if (m?.type === "text") return { id: e.id, text: by + m.content };
        if (m?.type === "widget") return { id: e.id, text: m.widget.prompt };
        if (m?.type === "connector") return { id: e.id, text: m.variant === "connected" ? `${m.connector} connected` : `Connect ${m.connector}` };
        if (m?.type === "connectors") return { id: e.id, text: `Connected ${m.connectors.join(" and ")}` };
        if (m?.type === "attachment") return { id: e.id, text: decodeURIComponent(String(m.url).split("/").pop() ?? "Sent a file") };
        if (m?.type === "email-draft") return { id: e.id, text: `Draft: ${m.draft.subject}` };
      }
    }
    return null;
  };
  const plain = (text: string) => text.replace(/[*_#`]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);

  const summary = (row: Row) => {
    const entries = transcripts.get(row.id) ?? [];
    const last = lastText(entries);
    const time = lastActivity.get(row.id) ?? at(row.minutesAgo);
    const run = running.get(row.id);
    const isUnread = unread.has(row.id) && row.id !== activeAgentId;
    return {
      id: row.id, name: row.name, description: row.description, title: row.title,
      avatarDataUrl: null, avatarVersion: null, avatarShape: "cloud", avatarColor: row.color,
      createdAt: at(60 * 24 * 12), updatedAt: time, path: `/demo/${row.id}/store.db`,
      isActive: row.id === activeAgentId,
      isRunning: run != null, isRunningTurn: run != null, isComposingMessage: run?.composing ?? false, isRetrying: false,
      currentActivity: run?.activity,
      lastEntry: last == null ? null : { kind: "text", text: plain(last.text) },
      lastMessageId: last?.id ?? null, lastMessagePreview: last == null ? null : plain(last.text),
      newestEntryId: entries.at(-1)?.id ?? null,
      hasUnread: isUnread, unreadCount: isUnread ? 1 : 0, lastViewedAt: isUnread ? time - 1 : time, lastActivityAt: time,
      awaitingUserResponse: null, notificationsEnabled: true, notifyOnUpdatesEnabled: true, isHiddenFromSidebar: false,
      origin: "user", isGroup: row.isGroup === true, memberIds: [...(row.memberIds ?? [])], conversationPartnerIds: [],
      snapshotEpoch: epoch, snapshotSeq: ++snapshotSeq,
    };
  };
  const roster = () => [...rows.values()].sort((a, b) => (lastActivity.get(b.id) ?? 0) - (lastActivity.get(a.id) ?? 0)).map(summary);
  const windowOf = (id: string) => ({ entries: transcripts.get(id) ?? [], threadCounts: {} });

  const pushAgent = (id: string) => {
    const row = rows.get(id);
    if (row == null) return;
    hooks.pushCoordinatorEvent("agent-upserted", { activeAgentId, agent: summary(row), ordered: stamp("roster") });
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
    if (agentId !== activeAgentId) unread.add(agentId);
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

  async function play(beats: readonly Beat[]): Promise<void> {
    const start = performance.now();
    for (const beat of beats) {
      const delay = beat.at * scale - (performance.now() - start);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      switch (beat.kind) {
        case "user": append(beat.agent, beat.entry); break;
        case "typing": setRunning(beat.agent, beat.on); break;
        case "step":
          outline(beat.agent, { kind: "tool-call", id: beat.id, name: beat.name, status: beat.status === "running" ? "running" : "completed", summary: beat.summary });
          setRunning(beat.agent, true, beat.status === "running" ? { kind: "tool", tool: beat.name, detail: beat.detail ?? beat.summary, ...(beat.target == null ? {} : { target: beat.target }) } : undefined);
          break;
        case "append": append(beat.agent, beat.entry); break;
        case "react": update(beat.agent, beat.entryId, (e: any) => ({ ...e, reactions: [...(e.reactions ?? []), { emoji: beat.emoji, by: beat.by }] })); break;
        case "hire": {
          const hired = beat.agent;
          rows.set(hired.id, hired);
          transcripts.set(hired.id, beat.entries.map((entry, index) => ({ ...entry, timestampMs: Date.now() + index })));
          lastActivity.set(hired.id, Date.now());
          unread.add(hired.id);
          pushAgent(hired.id);
          break;
        }
      }
    }
  }



  const main: Record<string, (args: any) => unknown> = {
    getThemeState: () => theme,
    // The phone's light and dark switch (and Settings' Theme) changes it for this page, as the web window does.
    setThemePreference: (args: any) => {
      const preference = args?.preference === "dark" || args?.preference === "light" ? args.preference : dark ? "dark" : "light";
      theme = { preference, resolved: preference };
      hooks.pushMainEvent("theme-changed", theme);
      return theme;
    },
    getOnboardingSeen: () => onboardingSeen,
    setOnboardingSeen: (args: any) => { onboardingSeen = args?.seen ?? args?.value ?? true; return undefined; },
    getWindowState: () => ({ isFullScreen: false, isMaximized: false, isFocused: true }),
    getTimeZone: () => ({ timeZone: "Europe/Zurich", override: null }),
    getSidebarCollapsed: () => false,
    markDeepLinksReady: () => undefined,
    getAccountStatus: () => authStatus,
    // In the app, Sign in opens the browser on app.simeonlabs.com and the window waits; here the browser step passes by itself.
    signInAccount: () => {
      authStatus = { kind: "logging-in" };
      hooks.pushMainEvent("account-changed", authStatus);
      setTimeout(() => { authStatus = signedIn; hooks.pushMainEvent("account-changed", authStatus); }, 1800);
      // The window then shows "Setting up Simeon's computer" until the cloud computer answers.
      setTimeout(() => hooks.reconnectCoordinator?.(), 8000);
      return authStatus;
    },
    cancelAccountSignIn: () => { authStatus = { kind: "logged-out" }; hooks.pushMainEvent("account-changed", authStatus); return authStatus; },
    getSandAccess: () => ({ state: "granted", reason: "none" }),
    getSandAccessFresh: () => ({ state: "granted", reason: "none" }),
    getEgressTunnelStatus: () => null,
    getEgressTunnelEnabled: () => false,
    getWebauthnProxyEnabled: () => false,
    getUpdateStatus: () => ({ kind: "idle" }),
    getBoxMigrationStatus: () => null,
    getExperimentsSnapshot: () => null,
    getAccountUsageSummary: () => null,
    getAccountPrReviewPreferences: () => null,
    getHostPinnedAgents: () => [],
    getHostSidebarSections: () => [],
    getAgentDefaultModel: () => null,
    // Voice calls are on in the app, so the demo draws the phone button and the
    // voice picker. The call itself needs the Mac, a microphone and the
    // server's voice key, so pressing the button here starts nothing.
    getVoiceCallAvailability: () => ({ enabled: true, inCall: false }),
    noteVoiceCallAgent: () => undefined,
    startVoiceCall: () => ({ started: false }),
    listVoiceCallVoices: () => [{ id: "demo-aria", name: "Aria" }, { id: "demo-james", name: "James" }, { id: "demo-sarah", name: "Sarah" }],
    getAgentVoice: () => ({ voiceId: "demo-aria", isDefault: true }),
    setAgentVoice: (args: any) => ({ voiceId: args?.voiceId ?? null, isDefault: false }),
    getVoicePreviewUrl: () => null,
    getAccountAvatar: () => null,
    // A new account has not said what to call them yet: the window's name sheet.
    getAccountNamePrompt: () => ({ needed: personName == null, suggested: "Bass" }),
    updateAccountName: (args: any) => { personName = typeof args?.name === "string" ? args.name : "Bass"; return { ok: true }; },
    resolveAttachmentMedia: () => null,
    getLinkMetadata: () => null,
    openExternal: () => undefined,
  };

  const coordinator: Record<string, (args: any) => unknown> = {
    listAgents: () => roster(),
    countAgents: () => rows.size,
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
    // Nobody types in the demo; the composer is inert (bridge.ts). A send that slips through is refused politely.
    sendPrompt: () => ({ accepted: false }),
    promptAcceptanceStatus: () => ({ status: "accepted" }),
    respondToWidget: (args) => {
      const agentId = args.agentId ?? activeAgentId;
      const updated = update(agentId, args.entryId, (e) => ({ ...e, respondedValue: args.value }));
      if (updated == null) return { accepted: false };
      // A new account: each answer moves the first agent's getting-started on.
      if (fresh && onboardingStage < 2) void play(onboardingScript(agentId, ++onboardingStage));
      return { accepted: true };
    },
    createAgent: (args) => {
      const id = `agent-${rows.size + 1}`;
      const row: Row = { id, name: String(args?.name ?? "New Agent"), title: String(args?.title ?? ""), description: String(args?.description ?? ""), color: (args?.avatarColor ?? "blue") as DemoAgent["color"], minutesAgo: 0 };
      rows.set(id, row);
      transcripts.set(id, []);
      lastActivity.set(id, Date.now());
      const previous = activeAgentId;
      activeAgentId = id;
      pushAgent(previous);
      pushAgent(id);
      if (args?.isKickstartRequested === true) void play(onboardingScript(id, 0));
      return { agent: summary(row) };
    },
    // The phone's New Group Chat (and the Mac's new chat with several recipients): the window's `createGroup`.
    createGroup: (args) => {
      const memberIds = (Array.isArray(args?.memberAgentIds) ? args.memberAgentIds : []).filter((id: unknown) => typeof id === "string" && rows.has(id) && rows.get(id)?.isGroup !== true);
      const id = `group-${rows.size + 1}`;
      const row: Row = { id, name: String(args?.name ?? "New group"), title: "", description: String(args?.description ?? ""), color: "blue", minutesAgo: 0, isGroup: true, memberIds };
      rows.set(id, row);
      transcripts.set(id, []);
      lastActivity.set(id, Date.now());
      const previous = activeAgentId;
      activeAgentId = id;
      pushAgent(previous);
      pushAgent(id);
      return { agent: summary(row) };
    },
    kickstartAgent: () => ({ isIntroductionInFlight: false }),
    dismissWidget: (args) => {
      update(args.agentId ?? activeAgentId, args.entryId, (e) => ({ ...e, widgetDismissed: true }));
      return {};
    },
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
    getAgentChannels: () => ({ manifests: CONNECTOR_MANIFESTS, connections: [] }),
    getForeverBoxStatus: () => ({ state: "ready" }),
  };

  return {
    /** Simeon's conversation plays by itself as soon as the window is up. */
    onServing(): void {
      if (openingStarted || fresh) return;
      openingStarted = true;
      void play(openingScript());
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
      if (channel === "sand:mcp-list") return { servers: fresh ? [] : CONNECTED.map(connectedServer) };
      if (channel === "sand:mcp-catalog") return { entries: [] };
      unanswered.ipc.add(channel);
      console.warn("[demo] ipc unanswered", channel, payload);
      return undefined;
    },
  };
}
