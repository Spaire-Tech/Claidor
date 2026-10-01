/**
 * The call, in the banner's page (30 September 2026): ring twice while main
 * fetches the call's token, start the ElevenLabs conversation, answer its
 * two client tools through main, follow its mode for the waveform, and
 * report the end. Every outside thing (the bridge to main, the SDK's
 * `startSession`, the ringer, the clock) comes in as a dependency, so the
 * same controller drives the real call and the offline renders.
 */
import { bannerView, callSeconds, initialCallState, reduceCall, shouldStartSession, type CallEvent, type CallState } from "../shared/voice-call/call-state.js";
import type { VoiceCallConnectResult, VoiceCallPanelEvent, VoiceCallSetup } from "../shared/voice-call/panel-protocol.js";
import { CALL_STATUS_COULD_NOT_CONNECT, CALL_STATUS_NO_MICROPHONE, WORK_CAME_BACK_NUDGE, workCameBackUpdate, type VoiceCallOverrides } from "../shared/voice-call/voice-call-prompt.js";
import { levelsFromFrequencies, type BannerElements, type BannerPainter } from "./banner-view.js";

export interface SimeonCallBridge {
  getSetup(): Promise<VoiceCallSetup>;
  connect(): Promise<VoiceCallConnectResult>;
  connected(args: { conversationId: string | null }): Promise<unknown>;
  sendTask(args: { task?: unknown; quote?: unknown }): Promise<string>;
  recallTextMessages(): Promise<string>;
  callEnded(args: { conversationId: string | null; seconds: number; transcript: readonly { speaker: "user" | "agent"; text: string }[] }): Promise<unknown>;
  resize(args: { height: number }): Promise<unknown>;
  callAgain(): Promise<unknown>;
  openChat(): Promise<unknown>;
  close(): Promise<unknown>;
  log(args: { line: string }): Promise<unknown>;
  onEvent(listener: (event: VoiceCallPanelEvent) => void): () => void;
}

/** The slice of the SDK's `VoiceConversation` the banner uses. */
export interface ConversationLike {
  endSession(): Promise<void>;
  setMicMuted(isMuted: boolean): void;
  getInputByteFrequencyData?(): Uint8Array;
  getOutputByteFrequencyData?(): Uint8Array;
  sendContextualUpdate(text: string): void;
  sendUserMessage(text: string): void;
}

export interface SessionStart {
  readonly conversationToken: string;
  readonly overrides: VoiceCallOverrides;
  readonly clientTools: Record<string, (parameters: any) => Promise<string>>;
  readonly onConnect: (props: { conversationId: string }) => void;
  readonly onDisconnect: (details: { reason: string; message?: string }) => void;
  readonly onError: (message: string, context?: unknown) => void;
  readonly onModeChange: (props: { mode: "speaking" | "listening" }) => void;
  /** A finished line from either side: the person's (`user`) or the voice's (`ai`). */
  readonly onMessage: (props: { message: string; source: "user" | "ai" }) => void;
}

export interface CallControllerDeps {
  readonly bridge: SimeonCallBridge;
  readonly elements: BannerElements;
  readonly painter: BannerPainter;
  readonly startSession: (options: SessionStart) => Promise<ConversationLike>;
  readonly ring: (cycles: number) => Promise<void>;
  readonly stopRinging: () => void;
  readonly now: () => number;
  readonly requestFrame: (callback: (timeMs: number) => void) => void;
  readonly setTimer: (run: () => void, ms: number) => () => void;
  readonly observeHeight: (element: HTMLElement, listener: (height: number) => void) => void;
}

/** Rings before the call connects, and the most it rings while the token is still on its way. */
export const RINGS_BEFORE_CONNECT = 2;
export const MAX_RINGS = 7;
/** A finished call's banner leaves by itself after this, unless the pointer is on it. */
export const ENDED_DISMISS_MS = 12_000;
export const FAILED_DISMISS_MS = 20_000;
/** How long a finished hand-off waits for the voice to stop talking before it is pushed in anyway. */
export const REPLY_WAIT_MS = 8_000;

export interface CallController {
  dispatch(event: CallEvent): void;
  state(): CallState;
  start(): Promise<void>;
}

const errorText = (error: unknown): string => (error instanceof Error ? `${error.name}: ${error.message}` : String(error));

export function microphoneRefused(error: unknown): boolean {
  const text = errorText(error);
  return /NotAllowedError|Permission denied|permission/i.test(text);
}

export function createCallController(deps: CallControllerDeps): CallController {
  let state = initialCallState();
  let conversation: ConversationLike | null = null;
  let isStarting = false;
  let hasReportedEnd = false;
  let pendingReply: { replies: readonly string[]; cancel: () => void } | null = null;
  let levels: number[] | null = null;
  let cancelDismiss: (() => void) | null = null;
  let isHovered = false;
  let isTranscriptOpen = false;
  /** What was said, as the SDK reported it, for the call's record when ElevenLabs' own is not ready. */
  const heard: { speaker: "user" | "agent"; text: string }[] = [];

  const render = (): void => deps.painter.paint(bannerView(state, deps.now()), state.isMuted);
  const log = (line: string): void => { void deps.bridge.log({ line }).catch(() => {}); };

  const flushReply = (): void => {
    const pending = pendingReply;
    if (pending == null || conversation == null || state.phase !== "live") return;
    pendingReply = null;
    pending.cancel();
    try {
      conversation.sendContextualUpdate(workCameBackUpdate(pending.replies));
      conversation.sendUserMessage(WORK_CAME_BACK_NUDGE);
    } catch (error) { log(`pushing the agent's reply failed: ${errorText(error)}`); }
  };

  const scheduleDismiss = (): void => {
    cancelDismiss?.();
    cancelDismiss = null;
    if (isHovered || (state.phase !== "ended" && state.phase !== "failed")) return;
    cancelDismiss = deps.setTimer(() => { void deps.bridge.close(); }, state.phase === "failed" ? FAILED_DISMISS_MS : ENDED_DISMISS_MS);
  };

  const reportEnd = (): void => {
    if (hasReportedEnd || state.phase !== "ended") return;
    hasReportedEnd = true;
    void deps.bridge.callEnded({ conversationId: state.conversationId, seconds: callSeconds(state, deps.now()), transcript: heard }).catch(() => {});
  };

  const dispatch = (event: CallEvent): void => {
    const before = state;
    state = reduceCall(state, event);
    if (state === before) return;
    if (state.phase !== before.phase) {
      if (state.phase !== "ringing") deps.stopRinging();
      if (state.phase === "ended") reportEnd();
      if (state.phase === "ended" || state.phase === "failed") { pendingReply?.cancel(); pendingReply = null; scheduleDismiss(); }
    }
    if (state.mode === "listening" && before.mode !== "listening") flushReply();
    render();
    if (shouldStartSession(state) && !isStarting) void startConversation();
  };

  let connectResult: VoiceCallConnectResult | null = null;

  const startConversation = async (): Promise<void> => {
    const ticket = connectResult;
    if (ticket == null || !ticket.ok) return;
    isStarting = true;
    dispatch({ type: "connecting" });
    try {
      const started = await deps.startSession({
        conversationToken: ticket.token,
        overrides: ticket.overrides,
        clientTools: {
          // the upstream app's two client tools: the request relayed to the agent over the
          // call's channel, and the latest texts between the person and the agent.
          send_task: async (parameters) => await deps.bridge.sendTask({ task: parameters?.task, quote: parameters?.quote }),
          recall_text_messages: async () => await deps.bridge.recallTextMessages(),
        },
        onConnect: ({ conversationId }) => {
          const id = typeof conversationId === "string" && conversationId.length > 0 ? conversationId : ticket.conversationId;
          dispatch({ type: "connected", conversationId: id, atMs: deps.now() });
          void deps.bridge.connected({ conversationId: id }).catch(() => {});
        },
        onDisconnect: (details) => {
          const reason = details.reason === "user" || details.reason === "agent" ? details.reason : "error";
          if (reason === "error") log(`disconnected: ${details.message ?? "no reason given"}`);
          dispatch({ type: "disconnected", reason, atMs: deps.now(), ...(details.message == null ? {} : { message: details.message }) });
          conversation = null;
        },
        onError: (message) => { log(`sdk error: ${message}`); dispatch({ type: "error" }); },
        onModeChange: ({ mode }) => dispatch({ type: "mode", mode }),
        onMessage: ({ message, source }) => {
          const text = typeof message === "string" ? message.trim() : "";
          // The nudge the app sends to make the voice speak is nobody's words.
          if (text.length === 0 || text === WORK_CAME_BACK_NUDGE) return;
          const speaker = source === "user" ? "user" : "agent";
          heard.push({ speaker, text });
          deps.painter.addLine(speaker, text);
        },
      });
      if (state.phase === "ended" || state.phase === "failed") { await started.endSession().catch(() => {}); return; }
      conversation = started;
      if (state.isMuted) conversation.setMicMuted(true);
    } catch (error) {
      log(`starting the conversation failed: ${errorText(error)}`);
      dispatch({ type: "setup-failed", message: microphoneRefused(error) ? CALL_STATUS_NO_MICROPHONE : CALL_STATUS_COULD_NOT_CONNECT });
    } finally {
      isStarting = false;
    }
  };

  const hangUp = (): void => {
    const active = conversation;
    dispatch({ type: "hang-up", atMs: deps.now() });
    if (active != null) void active.endSession().catch((error: unknown) => log(`ending the session failed: ${errorText(error)}`));
  };

  const tick = (timeMs: number): void => {
    const view = bannerView(state, deps.now());
    if (view.hasWave && conversation != null) {
      const data = state.mode === "speaking" ? conversation.getOutputByteFrequencyData?.() : conversation.getInputByteFrequencyData?.();
      levels = levelsFromFrequencies(state.mode === "listening" && state.isMuted ? null : data, levels);
      deps.painter.setLevels(levels, state.mode);
    } else if (levels != null) {
      levels = null;
      deps.painter.setLevels(null, state.mode);
    }
    deps.painter.paint(view, state.isMuted);
    deps.painter.animate(timeMs, view.state);
    deps.requestFrame(tick);
  };

  const wire = (): void => {
    const { elements } = deps;
    elements.quick.addEventListener("click", hangUp);
    elements.end.addEventListener("click", hangUp);
    elements.mute.addEventListener("click", () => {
      const isMuted = !state.isMuted;
      conversation?.setMicMuted(isMuted);
      dispatch({ type: "mute", isMuted });
    });
    elements.talk.addEventListener("click", () => {
      isTranscriptOpen = !isTranscriptOpen;
      deps.painter.setTranscriptOpen(isTranscriptOpen);
    });
    elements.again.addEventListener("click", () => { void deps.bridge.callAgain(); });
    elements.chat.addEventListener("click", () => { void deps.bridge.openChat(); });
    elements.close.addEventListener("click", () => { void deps.bridge.close(); });
    elements.banner.addEventListener("mouseenter", () => { isHovered = true; cancelDismiss?.(); cancelDismiss = null; });
    elements.banner.addEventListener("mouseleave", () => { isHovered = false; scheduleDismiss(); });
    deps.observeHeight(elements.banner, (height) => { void deps.bridge.resize({ height }).catch(() => {}); });
    deps.bridge.onEvent((event) => {
      if (event.type === "agent-status") dispatch({ type: "work", label: event.label });
      else if (event.type === "hang-up") hangUp();
      else if (event.type === "work-came-back") {
        // Several messages before the voice is free to speak are said together.
        const earlier = pendingReply?.replies ?? [];
        pendingReply?.cancel();
        const cancel = deps.setTimer(() => flushReply(), REPLY_WAIT_MS);
        pendingReply = { replies: [...earlier, ...event.texts], cancel };
        if (state.mode === "listening") flushReply();
      }
    });
  };

  return {
    dispatch,
    state: () => state,
    async start() {
      wire();
      render();
      deps.requestFrame(tick);
      try { deps.painter.paintAgent(await deps.bridge.getSetup()); }
      catch (error) { log(`setup failed: ${errorText(error)}`); }
      const connecting = deps.bridge.connect().then(
        (result) => { connectResult = result; dispatch(result.ok ? { type: "setup-ready" } : { type: "setup-failed", message: result.message }); },
        (error: unknown) => { log(`connect failed: ${errorText(error)}`); dispatch({ type: "setup-failed" }); },
      );
      await deps.ring(RINGS_BEFORE_CONNECT);
      let rings = RINGS_BEFORE_CONNECT;
      while (state.phase === "ringing" && connectResult == null && rings < MAX_RINGS) { await deps.ring(1); rings += 1; }
      if (state.phase === "ringing" && connectResult == null) dispatch({ type: "setup-failed" });
      dispatch({ type: "rings-done" });
      await connecting;
    },
  };
}
