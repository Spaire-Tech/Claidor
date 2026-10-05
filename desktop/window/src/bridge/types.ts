/**
 * What the window receives through its two doors, typed as the app sends it:
 * `window.desktop` (source/electron-preload/preload.ts, the main process)
 * and the coordinator port (source/shared/rpc/coordinator.ts, the agents).
 * Only what the window reads is typed; the rest stays unknown until a
 * screen needs it.
 */

export type ThemePreference = "system" | "light" | "dark";
export interface ThemeState { readonly preference: ThemePreference; readonly resolved: "light" | "dark" }

export type AuthStatus =
  | { readonly kind: "logged-out"; readonly errorMessage?: string }
  | { readonly kind: "logging-in" }
  | { readonly kind: "logged-in"; readonly authId?: string; readonly email?: string; readonly displayName?: string; readonly profilePictureUrl?: string };

export interface SidebarSection { readonly id: string; readonly name: string; readonly agentIds: readonly string[]; readonly isCollapsed: boolean }

export interface WindowState { readonly isFullscreen: boolean; readonly isMaximized: boolean }

/** One row of the roster, as the host projects it (roster-projection.ts). */
export interface AgentSummary {
  readonly id: string;
  readonly name: string;
  readonly title?: string | null;
  readonly description?: string | null;
  readonly avatarDataUrl?: string | null;
  readonly avatarShape?: string | null;
  readonly avatarColor?: string | null;
  readonly isActive?: boolean;
  readonly isRunning?: boolean;
  readonly isRunningTurn?: boolean;
  readonly isComposingMessage?: boolean;
  readonly currentActivity?: { readonly label?: string } | null;
  readonly lastMessagePreview?: string | null;
  readonly lastActivityAt?: number | null;
  readonly updatedAt?: number | null;
  readonly hasUnread?: boolean;
  readonly unreadCount?: number;
  readonly isHiddenFromSidebar?: boolean;
  readonly isGroup?: boolean;
  readonly memberIds?: readonly string[];
  readonly origin?: string;
  readonly [key: string]: unknown;
}

/** One line of a conversation (host/extensions/transcript). */
export interface TranscriptEntry {
  readonly id: string;
  readonly kind: string;
  readonly timestampMs?: number;
  readonly role?: "user" | "assistant";
  readonly content?: string;
  readonly isStreaming?: boolean;
  readonly message?: { readonly type?: string; readonly content?: string; readonly url?: string; readonly [key: string]: unknown };
  readonly author?: { readonly id: string; readonly name: string };
  readonly toAgent?: { readonly id: string; readonly name: string };
  readonly fromAgent?: { readonly id: string; readonly name: string };
  readonly event?: { readonly type?: string; readonly [key: string]: unknown };
  readonly [key: string]: unknown;
}

export interface TranscriptWindow {
  readonly entries: readonly TranscriptEntry[];
  readonly nextBeforeSeq?: number;
  readonly threadCounts: Readonly<Record<string, number>>;
}

export interface TranscriptEvent {
  readonly agentId: string;
  readonly type: "appended" | "updated" | "removed" | string;
  readonly entry?: TranscriptEntry;
  readonly entryId?: string;
}

export interface AgentUpsertedEvent { readonly activeAgentId?: string | null; readonly agent: AgentSummary }

export type Unsubscribe = () => void;

/** The part of window.desktop these screens use. */
export interface DesktopDoor {
  readonly platform: string;
  readonly theme: { readonly initial?: ThemeState; get(): Promise<ThemeState>; set(preference: ThemePreference): Promise<ThemeState>; onChanged(listener: (state: ThemeState) => void): Unsubscribe };
  readonly account: { getStatus(): Promise<AuthStatus>; login(): Promise<AuthStatus>; cancelLogin(): Promise<AuthStatus>; logout(): Promise<AuthStatus>; updateName(name: string): Promise<AuthStatus>; onStatusChanged(listener: (status: AuthStatus) => void): Unsubscribe };
  readonly onboarding: { getSeen(): Promise<boolean>; setSeen(seen: boolean): Promise<void> };
  readonly agent: { getPinnedAgents(): Promise<readonly string[] | null>; setPinnedAgents(ids: readonly string[]): Promise<readonly string[] | null>; getSidebarSections(): Promise<readonly SidebarSection[] | null>; setSidebarSections(sections: readonly SidebarSection[]): Promise<readonly SidebarSection[] | null> };
  readonly windowControls: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void>; setTitleBarOverlayTone(isOverlayTone: boolean): Promise<void> };
  getWindowState(): Promise<WindowState>;
  onWindowStateEvent(listener: (state: WindowState) => void): Unsubscribe;
  onFocusAgent(listener: (payload: unknown) => void): Unsubscribe;
  openExternal(url: string): Promise<void>;
}

export interface TransferredPort {
  postMessage(message: unknown): void;
  close(): void;
  start(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: () => void): void;
}

export interface CoordinatorDoor {
  claim(consumer: { onPort(port: TransferredPort): void }): { request(): void; release(): void } | null;
}
