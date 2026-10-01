/**
 * Voice calls on the Mac (30 September 2026): the one place that knows a
 * call is on. It opens the banner, answers the banner page's requests
 * (who the agent is, the call's token and per-call overrides, the two
 * client tools, the end of the call), writes the call into the agent's chat
 * afterwards, and serves the voice picker.
 *
 * Only one call at a time: a second start brings the banner forward.
 * Everything it touches comes in as a port, so the whole flow is tested
 * with fakes; `voice-call-window.ts` is the Electron half.
 */
import { SimeonApiError } from "../../shared/node/cursor-backend/simeon-api.js";
import { createAgentHandoff, type AgentHandoff, type HandoffLegs } from "../../shared/voice-call/handoff.js";
import type { VoiceCallConnectResult, VoiceCallPanelEvent, VoiceCallPanelMethod, VoiceCallSetup } from "../../shared/voice-call/panel-protocol.js";
import {
  buildVoiceCallOverrides,
  CALL_STATUS_COULD_NOT_CONNECT,
  CALL_STATUS_NO_CREDIT,
  CALL_STATUS_NOT_SWITCHED_ON,
  callRecordText,
  handOffFailed,
  transcriptLinesFromEntries,
  VOICE_CALL_DEFAULT_VOICE_ID,
} from "../../shared/voice-call/voice-call-prompt.js";
import { CONVERSATION_ID_PATTERN, type VoiceCallApi, type VoiceOption } from "./voice-call-api.js";

export interface VoiceCallLegs extends HandoffLegs {
  appendSendMessage(args: { readonly agentId: string; readonly message: { readonly type: "text"; readonly content: string } }): Promise<unknown>;
  updateAgent(args: { readonly id: string; readonly profile: Record<string, string> }): Promise<unknown>;
}

export interface VoiceCallWindowPort {
  open(): void;
  focus(): void;
  reload(): void;
  close(): void;
  isOpen(): boolean;
  send(event: VoiceCallPanelEvent): void;
  setContentHeight(height: number): void;
}

/** The Mac's own copy of each agent's voice, for a box whose host predates `voiceId`. */
export interface VoiceStorePort {
  get(agentId: string): string | null;
  set(agentId: string, voiceId: string | null): void;
}

export interface VoicePreviewPort {
  /** A URL the window may play (`sand-media:`), for the voice's sample. */
  urlFor(voice: VoiceOption): Promise<string | null>;
}

export interface VoiceCallServiceOptions {
  readonly legs: VoiceCallLegs;
  readonly api: () => VoiceCallApi;
  readonly window: VoiceCallWindowPort;
  readonly voiceStore: VoiceStorePort;
  readonly previews: VoicePreviewPort;
  readonly focusAgentChat: (agentId: string) => void;
  readonly isEnabled: () => boolean;
  /** The name the person gave (else Google's first name), for the voice to call them by; null when none. */
  readonly getPersonName?: () => Promise<string | null>;
  readonly log: (line: string) => void;
  readonly onMenuChanged?: () => void;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly wait?: (ms: number) => Promise<void>;
  /** Passed to the hand-off watch (tests make it synchronous). */
  readonly schedule?: (run: () => void, ms: number) => () => void;
}

export interface VoiceCallMenuItem {
  readonly label: string;
  readonly enabled: boolean;
  readonly start: () => void;
}

export interface VoicePickerOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly hasPreview: boolean;
}

export const VOICE_TRANSCRIPT_TAIL_LIMIT = 80;
export const VOICES_CACHE_MS = 10 * 60_000;
/** The summary is written by ElevenLabs a little after the call; asked again after these waits. */
export const SUMMARY_RETRY_WAITS_MS: readonly number[] = [5_000, 10_000];
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const MIN_BANNER_HEIGHT = 40;
const MAX_BANNER_HEIGHT = 400;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The sentence the banner shows when a call cannot start. */
export function connectFailureMessage(error: unknown): string {
  // By shape as well as class: the refusal is a `SimeonApiError` with the server's status.
  const status = error instanceof SimeonApiError || (error instanceof Error && error.name === "SimeonApiError") ? Reflect.get(error, "status") : null;
  if (status === 503) return CALL_STATUS_NOT_SWITCHED_ON;
  if (status === 402) return CALL_STATUS_NO_CREDIT;
  return CALL_STATUS_COULD_NOT_CONNECT;
}

interface ActiveCall {
  readonly agentId: string;
  readonly hintName: string | null;
  handoff: AgentHandoff | null;
  conversationId: string | null;
  connectedAtMs: number | null;
  isFinished: boolean;
}

export interface VoiceCallService {
  start(agentId: unknown, hintName?: unknown): { readonly status: "started" | "focused"; readonly agentId: string };
  handlePanel(method: VoiceCallPanelMethod, args: unknown): Promise<unknown>;
  windowClosed(): void;
  hangUp(): void;
  isEnabled(): boolean;
  isCallActive(): boolean;
  listVoices(): Promise<VoicePickerOption[]>;
  getAgentVoice(agentId: unknown): Promise<{ readonly voiceId: string; readonly isDefault: boolean }>;
  setAgentVoice(agentId: unknown, voiceId: unknown): Promise<{ readonly voiceId: string; readonly isDefault: boolean }>;
  voicePreviewUrl(voiceId: unknown): Promise<string | null>;
  noteSelectedAgent(agentId: unknown, name: unknown): void;
  menuItem(): VoiceCallMenuItem | null;
  /** Settles the record of the last call; tests wait on it. */
  settled(): Promise<void>;
}

export function createVoiceCallService(options: VoiceCallServiceOptions): VoiceCallService {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let call: ActiveCall | null = null;
  let selected: { readonly agentId: string; readonly name: string } | null = null;
  let voices: { readonly atMs: number; readonly list: VoiceOption[] } | null = null;
  let finishing: Promise<void> = Promise.resolve();

  const findAgent = async (agentId: string): Promise<Record<string, unknown> | null> => {
    const agents = await options.legs.listAgents();
    const rows = Array.isArray(agents) ? agents : [];
    for (const row of rows) if (isRecord(row) && row.id === agentId) return row;
    return null;
  };

  const storedVoice = (agentId: string, row: Record<string, unknown> | null): string | null => {
    const fromHost = row != null && typeof row.voiceId === "string" && VOICE_ID_PATTERN.test(row.voiceId) ? row.voiceId : null;
    return fromHost ?? options.voiceStore.get(agentId);
  };

  const requireAgentId = (value: unknown): string => {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error("A voice call names the agent by its id.");
    return value.trim();
  };

  const newCall = (agentId: string, hintName: string | null): ActiveCall => ({ agentId, hintName, handoff: null, conversationId: null, connectedAtMs: null, isFinished: false });

  const finishCall = (active: ActiveCall, conversationId: string | null, seconds: number): void => {
    if (active.isFinished) return;
    active.isFinished = true;
    active.handoff?.dispose();
    const id = conversationId != null && CONVERSATION_ID_PATTERN.test(conversationId) ? conversationId : active.conversationId;
    if (id == null || active.connectedAtMs == null) { options.log(`call ended before it connected (agent ${active.agentId})`); return; }
    const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : (now() - active.connectedAtMs) / 1000));
    finishing = finishing.then(async () => {
      let summary: string | null = null;
      try {
        let ending = await options.api().endCall(id, whole);
        for (const delay of SUMMARY_RETRY_WAITS_MS) {
          if (ending.summary != null) break;
          await wait(delay);
          ending = await options.api().endCall(id, whole);
        }
        summary = ending.summary;
        options.log(`call ended: conversation ${id}, ${whole}s, billed ${ending.seconds}s, summary ${summary == null ? "none" : "yes"}`);
      } catch (error) {
        options.log(`call end not recorded on the server (conversation ${id}): ${errorText(error)}`);
      }
      try {
        await options.legs.appendSendMessage({ agentId: active.agentId, message: { type: "text", content: callRecordText(whole, summary) } });
      } catch (error) {
        options.log(`call record not added to the chat: ${errorText(error)}`);
      }
    });
  };

  const connect = async (active: ActiveCall): Promise<VoiceCallConnectResult> => {
    let row: Record<string, unknown> | null = null;
    try { row = await findAgent(active.agentId); } catch (error) { options.log(`connect: the roster could not be read: ${errorText(error)}`); }
    let entries: readonly unknown[] = [];
    try {
      const page = await options.legs.getAgentTranscriptTail({ id: active.agentId, limit: VOICE_TRANSCRIPT_TAIL_LIMIT });
      entries = isRecord(page) && Array.isArray(page.entries) ? page.entries : [];
    } catch (error) { options.log(`connect: the chat could not be read: ${errorText(error)}`); }
    let ticket;
    try { ticket = await options.api().startCall(); }
    catch (error) {
      options.log(`connect: the server refused the call: ${errorText(error)}`);
      return { ok: false, message: connectFailureMessage(error) };
    }
    if (call !== active || active.isFinished) return { ok: false, message: CALL_STATUS_COULD_NOT_CONNECT };
    let personName: string | null = null;
    try { personName = (await options.getPersonName?.()) ?? null; }
    catch (error) { options.log(`connect: the person's name could not be read: ${errorText(error)}`); }
    if (call !== active || active.isFinished) return { ok: false, message: CALL_STATUS_COULD_NOT_CONNECT };
    const name = text(row?.name).trim() || active.hintName || "your agent";
    const overrides = buildVoiceCallOverrides({
      agent: { name, title: text(row?.title), description: text(row?.description) },
      transcript: transcriptLinesFromEntries(entries),
      voiceId: storedVoice(active.agentId, row),
      pick: random(),
      personName,
    });
    active.conversationId = ticket.conversationId;
    active.handoff?.dispose();
    active.handoff = createAgentHandoff({
      agentId: active.agentId,
      legs: options.legs,
      onStatus: (label) => { if (call === active) options.window.send({ type: "agent-status", label }); },
      onDone: (replies) => { if (call === active) options.window.send({ type: "agent-done", replies }); },
      log: (line) => options.log(line),
      now,
      ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
    });
    options.log(`connect: token issued for agent ${active.agentId} (voice ${overrides.tts?.voiceId ?? "the agent's own"}, ${entries.length} chat entries read)`);
    return { ok: true, token: ticket.token, conversationId: ticket.conversationId, overrides };
  };

  const loadVoices = async (): Promise<VoiceOption[]> => {
    if (voices != null && now() - voices.atMs < VOICES_CACHE_MS) return voices.list;
    const list = await options.api().listVoices();
    voices = { atMs: now(), list };
    return list;
  };

  const service: VoiceCallService = {
    start(agentIdRaw, hintRaw) {
      if (!options.isEnabled()) throw new Error("Voice calls are switched off on this Mac (SIMEON_VOICE_CALLS).");
      const agentId = requireAgentId(agentIdRaw);
      if (call != null && options.window.isOpen()) {
        options.window.focus();
        return { status: "focused", agentId: call.agentId };
      }
      const hint = typeof hintRaw === "string" && hintRaw.trim().length > 0 ? hintRaw.trim() : selected?.agentId === agentId ? selected.name : null;
      call = newCall(agentId, hint);
      options.log(`call started for agent ${agentId}`);
      options.window.open();
      return { status: "started", agentId };
    },
    async handlePanel(method, rawArgs) {
      const active = call;
      const args = isRecord(rawArgs) ? rawArgs : {};
      if (active == null) {
        if (method === "close") { options.window.close(); return null; }
        if (method === "log") return null;
        throw new Error("No call is on.");
      }
      switch (method) {
        case "getSetup": {
          let row: Record<string, unknown> | null = null;
          try { row = await findAgent(active.agentId); } catch (error) { options.log(`setup: the roster could not be read: ${errorText(error)}`); }
          const avatar = text(row?.avatarDataUrl);
          const setup: VoiceCallSetup = {
            agentId: active.agentId,
            name: text(row?.name).trim() || active.hintName || "Agent",
            color: typeof row?.avatarColor === "string" && row.avatarColor.length > 0 ? row.avatarColor : null,
            avatarDataUrl: /^data:image\/(png|jpeg|webp|gif);base64,/.test(avatar) ? avatar : null,
          };
          return setup;
        }
        case "connect":
          return await connect(active);
        case "connected": {
          const id = typeof args.conversationId === "string" && CONVERSATION_ID_PATTERN.test(args.conversationId) ? args.conversationId : null;
          if (id != null) active.conversationId = id;
          active.connectedAtMs ??= now();
          options.log(`connected: conversation ${active.conversationId ?? "unknown"}`);
          return null;
        }
        case "handToAgent":
          return active.handoff == null ? handOffFailed("the call is not connected") : await active.handoff.handToAgent(args);
        case "checkOnAgent":
          return active.handoff == null ? "The agent's status could not be read just now." : await active.handoff.checkOnAgent();
        case "callEnded": {
          const seconds = typeof args.seconds === "number" ? args.seconds : Number.NaN;
          finishCall(active, typeof args.conversationId === "string" ? args.conversationId : null, seconds);
          options.onMenuChanged?.();
          return null;
        }
        case "resize": {
          const height = typeof args.height === "number" && Number.isFinite(args.height) ? Math.round(args.height) : null;
          if (height != null) options.window.setContentHeight(Math.min(MAX_BANNER_HEIGHT, Math.max(MIN_BANNER_HEIGHT, height)));
          return null;
        }
        case "callAgain":
          finishCall(active, null, Number.NaN);
          call = newCall(active.agentId, active.hintName);
          options.log(`call again for agent ${active.agentId}`);
          options.window.reload();
          return null;
        case "openChat":
          options.focusAgentChat(active.agentId);
          options.window.close();
          return null;
        case "close":
          options.window.close();
          return null;
        case "log":
          options.log(`banner: ${text(args.line).slice(0, 500)}`);
          return null;
      }
    },
    windowClosed() {
      const active = call;
      call = null;
      if (active != null && !active.isFinished) finishCall(active, null, active.connectedAtMs == null ? 0 : (now() - active.connectedAtMs) / 1000);
      options.onMenuChanged?.();
    },
    hangUp() { if (call != null) options.window.send({ type: "hang-up" }); },
    isEnabled: () => options.isEnabled(),
    isCallActive: () => call != null && options.window.isOpen(),
    async listVoices() {
      const list = await loadVoices();
      return list.map((voice) => ({ id: voice.id, name: voice.name, description: voice.description, labels: voice.labels, hasPreview: voice.previewUrl != null }));
    },
    async getAgentVoice(agentIdRaw) {
      const agentId = requireAgentId(agentIdRaw);
      let row: Record<string, unknown> | null = null;
      try { row = await findAgent(agentId); } catch (error) { options.log(`voice: the roster could not be read: ${errorText(error)}`); }
      const voiceId = storedVoice(agentId, row);
      return { voiceId: voiceId ?? VOICE_CALL_DEFAULT_VOICE_ID, isDefault: voiceId == null };
    },
    async setAgentVoice(agentIdRaw, voiceIdRaw) {
      const agentId = requireAgentId(agentIdRaw);
      const voiceId = voiceIdRaw == null || voiceIdRaw === "" ? null : typeof voiceIdRaw === "string" && VOICE_ID_PATTERN.test(voiceIdRaw) ? voiceIdRaw : undefined;
      if (voiceId === undefined) throw new Error("That is not a voice id.");
      const row = await findAgent(agentId);
      if (row == null) throw new Error("No such agent.");
      await options.legs.updateAgent({
        id: agentId,
        profile: { name: text(row.name), description: text(row.description), ...(typeof row.title === "string" ? { title: row.title } : {}), voiceId: voiceId ?? "" },
      });
      options.voiceStore.set(agentId, voiceId);
      options.log(`voice for agent ${agentId}: ${voiceId ?? "default"}`);
      return { voiceId: voiceId ?? VOICE_CALL_DEFAULT_VOICE_ID, isDefault: voiceId == null };
    },
    async voicePreviewUrl(voiceIdRaw) {
      if (typeof voiceIdRaw !== "string" || !VOICE_ID_PATTERN.test(voiceIdRaw)) return null;
      const voice = (await loadVoices()).find((one) => one.id === voiceIdRaw);
      return voice == null || voice.previewUrl == null ? null : await options.previews.urlFor(voice);
    },
    noteSelectedAgent(agentIdRaw, nameRaw) {
      const next = typeof agentIdRaw === "string" && agentIdRaw.length > 0 ? { agentId: agentIdRaw, name: typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim() : "Agent" } : null;
      if (next?.agentId === selected?.agentId && next?.name === selected?.name) return;
      selected = next;
      options.onMenuChanged?.();
    },
    menuItem() {
      if (!options.isEnabled()) return null;
      const target = selected;
      if (target == null) return { label: "Call Agent", enabled: false, start: () => {} };
      return {
        label: `Call ${target.name}`,
        enabled: true,
        start: () => { try { service.start(target.agentId, target.name); } catch (error) { options.log(`menu: ${errorText(error)}`); } },
      };
    },
    settled: () => finishing,
  };
  return service;
}
