/**
 * The window's one store: what the app said through its doors, kept as
 * plain state React reads with useSyncExternalStore. Every change comes
 * from a door (a reply or an event), never from the screens guessing.
 */
import { useSyncExternalStore } from "react";

import { createCoordinatorClient, type CoordinatorClient, type TransportState } from "../bridge/coordinator.js";
import type { AgentSummary, AgentUpsertedEvent, AuthStatus, CoordinatorDoor, DesktopDoor, SidebarSection, ThemeState, TranscriptEntry, TranscriptEvent, TranscriptWindow } from "../bridge/types.js";

export interface WindowStateSnapshot {
  readonly booted: boolean;
  readonly fatal: string | null;
  readonly theme: ThemeState;
  readonly auth: AuthStatus;
  readonly transport: TransportState | "connecting";
  readonly agents: readonly AgentSummary[];
  readonly activeAgentId: string | null;
  readonly transcripts: Readonly<Record<string, readonly TranscriptEntry[]>>;
  readonly loadingTranscript: string | null;
  readonly pinnedAgentIds: readonly string[];
  readonly sections: readonly SidebarSection[];
  readonly sidebarCollapsed: boolean;
  readonly personName: string | null;
}

type Listener = () => void;

export class WindowStore {
  #state: WindowStateSnapshot = {
    booted: false, fatal: null, theme: { preference: "system", resolved: "light" }, auth: { kind: "logging-in" }, transport: "connecting",
    agents: [], activeAgentId: null, transcripts: {}, loadingTranscript: null, pinnedAgentIds: [], sections: [], sidebarCollapsed: false, personName: null,
  };
  readonly #listeners = new Set<Listener>();
  #coordinator: CoordinatorClient | null = null;
  readonly #desktop: DesktopDoor;
  readonly #coordinatorDoor: CoordinatorDoor;

  constructor(desktop: DesktopDoor, coordinator: CoordinatorDoor) {
    this.#desktop = desktop;
    this.#coordinatorDoor = coordinator;
  }

  get state(): WindowStateSnapshot { return this.#state; }
  get desktop(): DesktopDoor { return this.#desktop; }

  subscribe = (listener: Listener): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  #set(patch: Partial<WindowStateSnapshot>): void {
    this.#state = { ...this.#state, ...patch };
    for (const listener of this.#listeners) listener();
  }

  /** Reads what the app knows at start and opens the coordinator. */
  async boot(): Promise<void> {
    try {
      const desktop = this.#desktop;
      const [theme, auth] = await Promise.all([desktop.theme.get().catch(() => desktop.theme.initial ?? this.#state.theme), desktop.account.getStatus()]);
      this.#set({ theme, auth, personName: auth.kind === "logged-in" ? auth.displayName ?? null : null });
      desktop.theme.onChanged(next => this.#set({ theme: next }));
      desktop.account.onStatusChanged(next => {
        this.#set({ auth: next, personName: next.kind === "logged-in" ? next.displayName ?? this.#state.personName : null });
        if (next.kind === "logged-in") void this.loadRoster();
      });
      desktop.onFocusAgent(payload => {
        const id = typeof payload === "object" && payload != null ? (payload as { agentId?: unknown }).agentId : undefined;
        if (typeof id === "string") void this.openAgent(id);
      });
      this.#openCoordinator();
      if (auth.kind === "logged-in") await this.loadRoster();
      this.#set({ booted: true });
    } catch (error) {
      this.#set({ booted: true, fatal: error instanceof Error ? error.message : String(error) });
    }
  }

  #openCoordinator(): void {
    const client = createCoordinatorClient(this.#coordinatorDoor);
    if (client == null) { this.#set({ transport: "down" }); return; }
    this.#coordinator = client;
    client.subscribeTransport(state => {
      this.#set({ transport: state });
      if (state === "connected" && this.#state.auth.kind === "logged-in") void this.loadRoster();
    });
    client.subscribe("agent-upserted", payload => {
      const event = payload as AgentUpsertedEvent;
      if (event?.agent?.id == null) return;
      const agents = this.#state.agents.some(agent => agent.id === event.agent.id)
        ? this.#state.agents.map(agent => (agent.id === event.agent.id ? { ...agent, ...event.agent } : agent))
        : [...this.#state.agents, event.agent];
      this.#set({ agents: sortRoster(agents) });
    });
    client.subscribe("agents", payload => {
      if (Array.isArray(payload)) this.#set({ agents: sortRoster(payload as AgentSummary[]) });
      else if (typeof payload === "object" && payload != null && Array.isArray((payload as { agents?: unknown }).agents)) this.#set({ agents: sortRoster((payload as { agents: AgentSummary[] }).agents) });
    });
    client.subscribe("transcript", payload => this.#applyTranscriptEvent(payload as TranscriptEvent));
  }

  #applyTranscriptEvent(event: TranscriptEvent): void {
    if (typeof event?.agentId !== "string") return;
    const current = this.#state.transcripts[event.agentId];
    if (current == null) return;
    let next = current;
    if ((event.type === "appended" || event.type === "updated") && event.entry != null) {
      const index = current.findIndex(entry => entry.id === event.entry!.id);
      next = index < 0 ? [...current, event.entry] : current.map((entry, at) => (at === index ? event.entry! : entry));
    } else if (event.type === "removed" && typeof event.entryId === "string") {
      next = current.filter(entry => entry.id !== event.entryId);
    }
    if (next !== current) this.#set({ transcripts: { ...this.#state.transcripts, [event.agentId]: next } });
  }

  async loadRoster(): Promise<void> {
    const client = this.#coordinator;
    if (client == null) return;
    try {
      const [agents, pinned, sections] = await Promise.all([
        client.call<AgentSummary[]>("listAgents"),
        this.#desktop.agent.getPinnedAgents().catch(() => null),
        this.#desktop.agent.getSidebarSections().catch(() => null),
      ]);
      const sorted = sortRoster(Array.isArray(agents) ? agents : []);
      this.#set({ agents: sorted, pinnedAgentIds: pinned ?? [], sections: sections ?? [] });
      if (this.#state.activeAgentId == null && sorted[0] != null) await this.openAgent(sorted[0].id);
    } catch (error) {
      console.warn("[window] roster", error);
    }
  }

  async openAgent(agentId: string): Promise<void> {
    this.#set({ activeAgentId: agentId });
    if (this.#state.transcripts[agentId] != null) { void this.#markRead(agentId); return; }
    const client = this.#coordinator;
    if (client == null) return;
    this.#set({ loadingTranscript: agentId });
    try {
      const page = await client.call<TranscriptWindow>("getAgentTranscriptWindow", { id: agentId });
      this.#set({ transcripts: { ...this.#state.transcripts, [agentId]: page.entries ?? [] } });
      void this.#markRead(agentId);
    } catch (error) {
      console.warn("[window] transcript", error);
    } finally {
      if (this.#state.loadingTranscript === agentId) this.#set({ loadingTranscript: null });
    }
  }

  async #markRead(agentId: string): Promise<void> {
    try { await this.#coordinator?.call("setAgentUnread", { id: agentId, isUnread: false, atMs: Date.now() }); } catch {}
    this.#set({ agents: this.#state.agents.map(agent => (agent.id === agentId ? { ...agent, hasUnread: false, unreadCount: 0 } : agent)) });
  }

  async send(agentId: string, text: string): Promise<void> {
    const client = this.#coordinator;
    if (client == null || text.trim().length === 0) return;
    // The host's argument names (host-gateway-api.ts, sendPrompt): the
    // text is `prompt`; a nonce lets the coordinator retry a send that may
    // have gone through without sending it twice.
    await client.call("sendPrompt", { agentId, prompt: text, attachmentPaths: [], attachmentNames: [], clientNonce: `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` });
  }

  toggleSidebar(): void { this.#set({ sidebarCollapsed: !this.#state.sidebarCollapsed }); }

  async signIn(): Promise<void> {
    this.#set({ auth: { kind: "logging-in" } });
    try { this.#set({ auth: await this.#desktop.account.login() }); } catch (error) { this.#set({ auth: { kind: "logged-out", errorMessage: error instanceof Error ? error.message : String(error) } }); }
  }

  async cancelSignIn(): Promise<void> { this.#set({ auth: await this.#desktop.account.cancelLogin() }); }

  async signOut(): Promise<void> { this.#set({ auth: await this.#desktop.account.logout(), agents: [], activeAgentId: null, transcripts: {} }); }
}

export function sortRoster(agents: readonly AgentSummary[]): AgentSummary[] {
  return [...agents].filter(agent => agent.isHiddenFromSidebar !== true).sort((a, b) => (b.lastActivityAt ?? b.updatedAt ?? 0) - (a.lastActivityAt ?? a.updatedAt ?? 0));
}

export function useWindowState(store: WindowStore): WindowStateSnapshot {
  return useSyncExternalStore(store.subscribe, () => store.state, () => store.state);
}
