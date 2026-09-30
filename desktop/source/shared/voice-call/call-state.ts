/**
 * One voice call's life, as a pure reducer, and what the banner shows for
 * each moment of it (30 September 2026). The banner page feeds it the
 * SDK's callbacks and its own buttons; nothing here touches the DOM, the
 * network or a clock, so the whole lifecycle is tested as plain data.
 *
 *   ringing ──(two rings done, and the call's token is here)──▶ connecting
 *   connecting ──onConnect──▶ live ──hang-up / onDisconnect──▶ ended
 *   ringing | connecting ──setup failed / error / dropped──▶ failed
 *   ringing | connecting ──hang-up──▶ ended (never connected: "Call ended")
 *
 * While live, `mode` follows the SDK (speaking / listening) and `work` is
 * the status line while the person's agent works on something handed to it;
 * the banner then shows the work instead of the waveform.
 */
import {
  CALL_STATUS_CALLING,
  CALL_STATUS_COULD_NOT_CONNECT,
  CALL_STATUS_ENDED,
  formatCallDuration,
} from "./voice-call-prompt.js";

export type CallPhase = "ringing" | "connecting" | "live" | "ended" | "failed";
export type CallMode = "speaking" | "listening";

export interface CallState {
  readonly phase: CallPhase;
  readonly mode: CallMode;
  readonly isMuted: boolean;
  readonly areRingsDone: boolean;
  readonly isSetupReady: boolean;
  readonly conversationId: string | null;
  readonly connectedAtMs: number | null;
  readonly endedAtMs: number | null;
  readonly work: string | null;
  readonly failure: string | null;
}

export type CallEvent =
  | { readonly type: "rings-done" }
  | { readonly type: "setup-ready" }
  | { readonly type: "setup-failed"; readonly message?: string }
  | { readonly type: "connecting" }
  | { readonly type: "connected"; readonly conversationId: string | null; readonly atMs: number }
  | { readonly type: "mode"; readonly mode: CallMode }
  | { readonly type: "mute"; readonly isMuted: boolean }
  | { readonly type: "work"; readonly label: string | null }
  | { readonly type: "hang-up"; readonly atMs: number }
  | { readonly type: "disconnected"; readonly atMs: number; readonly reason: "user" | "agent" | "error"; readonly message?: string }
  | { readonly type: "error"; readonly message?: string };

export function initialCallState(): CallState {
  return { phase: "ringing", mode: "listening", isMuted: false, areRingsDone: false, isSetupReady: false, conversationId: null, connectedAtMs: null, endedAtMs: null, work: null, failure: null };
}

const isOver = (phase: CallPhase): boolean => phase === "ended" || phase === "failed";
const isBeforeConnect = (phase: CallPhase): boolean => phase === "ringing" || phase === "connecting";

export function reduceCall(state: CallState, event: CallEvent): CallState {
  if (isOver(state.phase)) return state;
  switch (event.type) {
    case "rings-done":
      return state.phase === "ringing" ? { ...state, areRingsDone: true } : state;
    case "setup-ready":
      return state.phase === "ringing" ? { ...state, isSetupReady: true } : state;
    case "setup-failed":
      return isBeforeConnect(state.phase) ? { ...state, phase: "failed", failure: event.message ?? CALL_STATUS_COULD_NOT_CONNECT } : state;
    case "connecting":
      return state.phase === "ringing" ? { ...state, phase: "connecting" } : state;
    case "connected":
      return isBeforeConnect(state.phase) ? { ...state, phase: "live", conversationId: event.conversationId ?? state.conversationId, connectedAtMs: event.atMs } : state;
    case "mode":
      return { ...state, mode: event.mode };
    case "mute":
      return { ...state, isMuted: event.isMuted };
    case "work":
      return state.phase === "live" ? { ...state, work: event.label } : state;
    case "hang-up":
      return { ...state, phase: "ended", endedAtMs: event.atMs, work: null };
    case "disconnected":
      if (state.phase === "live") return { ...state, phase: "ended", endedAtMs: event.atMs, work: null };
      return event.reason === "user"
        ? { ...state, phase: "ended", endedAtMs: event.atMs }
        : { ...state, phase: "failed", failure: CALL_STATUS_COULD_NOT_CONNECT };
    case "error":
      return isBeforeConnect(state.phase) ? { ...state, phase: "failed", failure: event.message ?? CALL_STATUS_COULD_NOT_CONNECT } : state;
  }
}

/** Both halves of the wait are over: the rings have played and the token is here. */
export function shouldStartSession(state: CallState): boolean {
  return state.phase === "ringing" && state.areRingsDone && state.isSetupReady;
}

/** Whole seconds the call has been connected, as of `nowMs` (or its end). */
export function callSeconds(state: CallState, nowMs: number): number {
  if (state.connectedAtMs == null) return 0;
  const end = state.endedAtMs ?? nowMs;
  return Math.max(0, Math.floor((end - state.connectedAtMs) / 1000));
}

/** The banner's `data-state`, which the stylesheet reads to show and hide its parts. */
export type BannerState = "ringing" | "speaking" | "listening" | "working" | "ended" | "failed";

export interface BannerView {
  readonly state: BannerState;
  readonly status: string;
  /** The waveform row is drawn (live, and not working on a request). */
  readonly hasWave: boolean;
  /** The bottom bar: none while ringing, Mute | End live, Call Again | Chat after, Close on failure. */
  readonly bar: "none" | "call" | "after" | "close";
}

export function bannerView(state: CallState, nowMs: number): BannerView {
  switch (state.phase) {
    case "ringing":
    case "connecting":
      return { state: "ringing", status: CALL_STATUS_CALLING, hasWave: false, bar: "none" };
    case "live":
      return state.work != null
        ? { state: "working", status: state.work, hasWave: false, bar: "call" }
        : { state: state.mode, status: formatCallDuration(callSeconds(state, nowMs)), hasWave: true, bar: "call" };
    case "ended":
      return { state: "ended", status: state.connectedAtMs == null ? CALL_STATUS_ENDED : `${CALL_STATUS_ENDED} · ${formatCallDuration(callSeconds(state, nowMs))}`, hasWave: false, bar: "after" };
    case "failed":
      return { state: "failed", status: state.failure ?? CALL_STATUS_COULD_NOT_CONNECT, hasWave: false, bar: "close" };
  }
}
