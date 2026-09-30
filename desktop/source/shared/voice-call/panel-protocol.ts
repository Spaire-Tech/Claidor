/**
 * What the call banner's page and Electron main say to each other
 * (30 September 2026). The page is a window of its own
 * (`electron-main/voice/voice-call-window.ts`); its preload exposes
 * `window.simeonCall` with one method per request below and `onEvent`.
 */
import type { VoiceCallOverrides } from "./voice-call-prompt.js";

export const VOICE_CALL_INVOKE_CHANNEL = "simeon-voice-call:invoke";
export const VOICE_CALL_EVENT_CHANNEL = "simeon-voice-call:event";

export const VOICE_CALL_PANEL_METHODS = [
  "getSetup",
  "connect",
  "connected",
  "handToAgent",
  "checkOnAgent",
  "callEnded",
  "resize",
  "callAgain",
  "openChat",
  "close",
  "log",
] as const;
export type VoiceCallPanelMethod = (typeof VOICE_CALL_PANEL_METHODS)[number];

export function isVoiceCallPanelMethod(name: unknown): name is VoiceCallPanelMethod {
  return typeof name === "string" && (VOICE_CALL_PANEL_METHODS as readonly string[]).includes(name);
}

/** The agent as the banner draws it, known before the call connects. */
export interface VoiceCallSetup {
  readonly agentId: string;
  readonly name: string;
  readonly color: string | null;
  readonly avatarDataUrl: string | null;
}

export type VoiceCallConnectResult =
  | { readonly ok: true; readonly token: string; readonly conversationId: string | null; readonly overrides: VoiceCallOverrides }
  | { readonly ok: false; readonly message: string };

export type VoiceCallPanelEvent =
  | { readonly type: "agent-status"; readonly label: string | null }
  | { readonly type: "agent-done"; readonly replies: readonly string[] }
  | { readonly type: "hang-up" };
