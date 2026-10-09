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
import { SimeonApiError } from "../../shared/node/simeon-backend/simeon-api.js";
import { AGENT_MARK_PALETTES } from "../../shared/voice-call/agent-mark.js";
import { createCallChannel, type CallChannel, type CallChannelLegs } from "../../shared/voice-call/handoff.js";
import { RELAY_SOFT_FAIL } from "../../shared/voice-call/main-loop-voice.js";
import type { VoiceCallConnectResult, VoiceCallPanelEvent, VoiceCallPanelMethod, VoiceCallSetup } from "../../shared/voice-call/panel-protocol.js";
import {
  buildVoiceCallOverrides,
  CALL_STATUS_COULD_NOT_CONNECT,
  CALL_STATUS_NO_CREDIT,
  CALL_STATUS_NOT_SWITCHED_ON,
  callRecordText,
  type CallRecordLine,
  transcriptLinesFromEntries,
  VOICE_CALL_DEFAULT_VOICE_ID,
} from "../../shared/voice-call/voice-call-prompt.js";
import { CONVERSATION_ID_PATTERN, type VoiceCallApi, type VoiceOption } from "./voice-call-api.js";
import { pickAgentVoice } from "../../shared/voice-call/agent-voices.js";
import { isChiefOfStaffTitle } from "../../shared/agents/chief-of-staff.js";

export interface VoiceCallLegs extends CallChannelLegs {
  appendSendMessage(args: { readonly agentId: string; readonly message: { readonly type: "text"; readonly content: string } }): Promise<unknown>;
  updateAgent(args: { readonly id: string; readonly profile: Record<string, string> }): Promise<unknown>;
  /** The agent's picture (`{ dataUrl }`), which the roster rows do not carry. */
  getAgentAvatar?(args: { readonly id: string }): Promise<unknown>;
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
  /** Passed to the call channel's outbox reads (tests make it synchronous). */
  readonly schedule?: (run: () => void, ms: number) => () => void;
  /** A new call's id, its channel address being `voice:<id>`. */
  readonly newCallId?: () => string;
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
/** How often a window naming an agent has every agent given its voice (`assignMissingVoices`). */
export const ASSIGN_VOICES_EVERY_MS = 60_000;
/** The summary is written by ElevenLabs a little after the call; asked again after these waits. */
export const SUMMARY_RETRY_WAITS_MS: readonly number[] = [5_000, 10_000];
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
const MIN_BANNER_HEIGHT = 40;
/** Room for the live transcript under the banner. */
const MAX_BANNER_HEIGHT = 480;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown): string => (typeof value === "string" ? value : "");
const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The banner's live transcript, as it sends it when the call ends: at most 400 lines of what was said. */
export function heardLines(value: unknown): CallRecordLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((line) => ({ speaker: line.speaker === "agent" ? "agent" as const : "user" as const, text: text(line.text).trim().slice(0, 4_000) }))
    .filter((line) => line.text.length > 0)
    .slice(0, 400);
}

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
  /**
   * The colour the window draws the agent in, from the phone button. The
   * roster carries a colour only when one was chosen; for the rest the
   * window hashes one from the id, and the banner drew those agents in
   * Ocean, a different butterfly from the chat's (6 October 2026, the
   * founder: "another avatar appears in the calling banner").
   */
  readonly hintColor: string | null;
  readonly callId: string;
  channel: CallChannel | null;
  conversationId: string | null;
  connectedAtMs: number | null;
  isFinished: boolean;
  /** What the banner heard said, live, in case ElevenLabs' own transcript is not ready when the call ends. */
  heard: readonly CallRecordLine[];
  /** The name the person goes by, read when the call connects. */
  personName: string | null;
}

export interface VoiceCallService {
  start(agentId: unknown, hintName?: unknown, hintColor?: unknown): { readonly status: "started" | "focused"; readonly agentId: string };
  handlePanel(method: VoiceCallPanelMethod, args: unknown): Promise<unknown>;
  windowClosed(): void;
  hangUp(): void;
  isEnabled(): boolean;
  isCallActive(): boolean;
  listVoices(): Promise<VoicePickerOption[]>;
  getAgentVoice(agentId: unknown): Promise<{ readonly voiceId: string; readonly isDefault: boolean }>;
  setAgentVoice(agentId: unknown, voiceId: unknown): Promise<{ readonly voiceId: string; readonly isDefault: boolean }>;
  voicePreviewUrl(voiceId: unknown): Promise<string | null>;
  /** The person's thumbs on a finished call, from its card in the chat: true, false, or null to take it back. */
  rateCall(conversationId: unknown, like: unknown): Promise<{ readonly ok: boolean }>;
  noteSelectedAgent(agentId: unknown, name: unknown, color?: unknown): void;
  menuItem(): VoiceCallMenuItem | null;
  /** Settles the record of the last call; tests wait on it. */
  settled(): Promise<void>;
}

export function createVoiceCallService(options: VoiceCallServiceOptions): VoiceCallService {
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let call: ActiveCall | null = null;
  let selected: { readonly agentId: string; readonly name: string; readonly color: string | null } | null = null;
  let voices: { readonly atMs: number; readonly list: VoiceOption[] } | null = null;
  let finishing: Promise<void> = Promise.resolve();

  let roster: readonly Record<string, unknown>[] = [];
  const readRoster = async (): Promise<readonly Record<string, unknown>[]> => {
    const agents = await options.legs.listAgents();
    roster = (Array.isArray(agents) ? agents : []).filter(isRecord);
    return roster;
  };
  const findAgent = async (agentId: string): Promise<Record<string, unknown> | null> => (await readRoster()).find((row) => row.id === agentId) ?? null;
  /** The agent's teammates by name: the rest of the roster, groups and shared rooms left out. */
  const teammatesOf = (agentId: string): { name: string; title?: string }[] =>
    roster
      .filter((row) => row.id !== agentId && row.isGroup !== true && row.remoteRoom == null && row.isHiddenFromSidebar !== true && text(row.name).trim().length > 0)
      .map((row) => ({ name: text(row.name).trim(), ...(text(row.title).trim().length > 0 ? { title: text(row.title).trim() } : {}) }));

  const storedVoice = (agentId: string, row: Record<string, unknown> | null): string | null => {
    const fromHost = row != null && typeof row.voiceId === "string" && VOICE_ID_PATTERN.test(row.voiceId) ? row.voiceId : null;
    return fromHost ?? options.voiceStore.get(agentId);
  };

  /** A palette id the banner can draw, or null. */
  const paletteColor = (value: unknown): string | null => (typeof value === "string" && AGENT_MARK_PALETTES.some((palette) => palette.id === value) ? value : null);

  const requireAgentId = (value: unknown): string => {
    if (typeof value !== "string" || value.trim().length === 0) throw new Error("A voice call names the agent by its id.");
    return value.trim();
  };

  const newCallId = options.newCallId ?? (() => globalThis.crypto.randomUUID());
  const newCall = (agentId: string, hintName: string | null, hintColor: string | null): ActiveCall => ({ agentId, hintName, hintColor, callId: newCallId(), channel: null, conversationId: null, connectedAtMs: null, isFinished: false, heard: [], personName: null });

  const finishCall = (active: ActiveCall, conversationId: string | null, seconds: number): void => {
    if (active.isFinished) return;
    active.isFinished = true;
    const channel = active.channel;
    const id = conversationId != null && CONVERSATION_ID_PATTERN.test(conversationId) ? conversationId : active.conversationId;
    if (id == null || active.connectedAtMs == null) {
      options.log(`call ended before it connected (agent ${active.agentId})`);
      if (channel != null) finishing = finishing.then(async () => { await channel.end({ seconds: 0, recap: null, transcript: [], personName: null }); channel.dispose(); });
      return;
    }
    const whole = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : (now() - active.connectedAtMs) / 1000));
    finishing = finishing.then(async () => {
      let summary: string | null = null;
      let transcript: CallRecordLine[] = [];
      try {
        let ending = await options.api().endCall(id, whole);
        for (const delay of SUMMARY_RETRY_WAITS_MS) {
          if (ending.summary != null && (ending.transcript?.length ?? 0) > 0) break;
          await wait(delay);
          ending = await options.api().endCall(id, whole);
        }
        summary = ending.summary;
        transcript = [...(ending.transcript ?? [])];
        if (transcript.length === 0 && active.heard.length > 0) {
          transcript = [...active.heard];
          options.log(`call record: ElevenLabs had no transcript yet; the banner's ${active.heard.length} line(s) are used`);
        }
        options.log(`call ended: conversation ${id}, ${whole}s, billed ${ending.seconds}s, summary ${summary == null ? "none" : "yes"}`);
      } catch (error) {
        options.log(`call end not recorded on the server (conversation ${id}): ${errorText(error)}`);
        transcript = [...active.heard];
      }
      // The call's address closes, its record goes to the agent's voice-calls/ folder, and
      // the host fills in the call's line in the agent's chat (written when the call opened)
      // with its duration and what was said.
      let written = 0;
      if (channel != null) { written = await channel.end({ seconds: whole, recap: summary, transcript, personName: active.personName }); channel.dispose(); }
      if (written > 0) return;
      // A host from before 2 October 2026 writes no line of its own: the call's line and recap instead.
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
    active.personName = personName;
    const voiceId = await assignedVoice(active.agentId, row);
    if (call !== active || active.isFinished) return { ok: false, message: CALL_STATUS_COULD_NOT_CONNECT };
    const name = text(row?.name).trim() || active.hintName || "your agent";
    const overrides = buildVoiceCallOverrides({
      agent: { name, title: text(row?.title), description: text(row?.description) },
      transcript: transcriptLinesFromEntries(entries),
      teammates: teammatesOf(active.agentId),
      voiceId,
      pick: random(),
      personName,
    });
    active.conversationId = ticket.conversationId;
    active.channel?.dispose();
    active.channel = createCallChannel({
      agentId: active.agentId,
      callId: active.callId,
      legs: options.legs,
      onStatus: (label) => { if (call === active) options.window.send({ type: "agent-status", label }); },
      onSaid: (texts) => { if (call === active) options.window.send({ type: "work-came-back", texts }); },
      log: (line) => options.log(line),
      ...(options.schedule === undefined ? {} : { schedule: options.schedule }),
    });
    if (!(await active.channel.open())) options.log(`connect: the call is up without its channel to agent ${active.agentId}`);
    options.log(`connect: token issued for agent ${active.agentId} (voice ${overrides.tts?.voiceId ?? "the agent's own"}, ${entries.length} chat entries read)`);
    return { ok: true, token: ticket.token, conversationId: ticket.conversationId, overrides };
  };

  const loadVoices = async (): Promise<VoiceOption[]> => {
    if (voices != null && now() - voices.atMs < VOICES_CACHE_MS) return voices.list;
    const list = await options.api().listVoices();
    voices = { atMs: now(), list };
    return list;
  };

  const saveVoice = async (agentId: string, row: Record<string, unknown>, voiceId: string | null): Promise<void> => {
    await options.legs.updateAgent({
      id: agentId,
      profile: { name: text(row.name), description: text(row.description), ...(typeof row.title === "string" ? { title: row.title } : {}), voiceId: voiceId ?? "" },
    });
    options.voiceStore.set(agentId, voiceId);
  };

  /** A stored voice still on the account's list; one taken off it (Jessica, 6 October 2026) is none. An empty list judges nothing. */
  const keptVoice = (agentId: string, row: Record<string, unknown> | null, list: readonly VoiceOption[]): string | null => {
    const stored = storedVoice(agentId, row);
    return stored == null || list.length === 0 || list.some((voice) => voice.id === stored) ? stored : null;
  };

  let assigning: Promise<ReadonlyMap<string, string>> | null = null;
  let lastAssignedAtMs = 0;
  /**
   * Every agent's voice, given now to each agent without one on the list (9
   * October 2026, the founder: "theres no smart attribution of voices …
   * every voice says "michael" by default, even tho its a different voice").
   * Until then an agent got its voice only when a call or its picker asked,
   * and an agent holding a voice taken off the list (Jessica) kept speaking
   * in it while its picker showed the list's first, Michael. Agents in id
   * order, so the phone, doing the same (ios/SimeonCore AgentVoices.swift),
   * gives the same voices. One pass at a time; the voices it ends with, by
   * agent.
   */
  const assignMissingVoices = (): Promise<ReadonlyMap<string, string>> => {
    const run = async (): Promise<ReadonlyMap<string, string>> => {
      const given = new Map<string, string>();
      let list: VoiceOption[];
      try { list = await loadVoices(); }
      catch (error) { options.log(`voice: none given, the voices could not be listed: ${errorText(error)}`); return given; }
      let rows: readonly Record<string, unknown>[];
      try { rows = await readRoster(); }
      catch (error) { options.log(`voice: none given, the roster could not be read: ${errorText(error)}`); return given; }
      const people = rows
        .filter((row) => typeof row.id === "string" && row.id.length > 0 && row.isGroup !== true && row.remoteRoom == null)
        .sort((a, b) => (text(a.id) < text(b.id) ? -1 : text(a.id) > text(b.id) ? 1 : 0));
      for (const row of people) { const kept = keptVoice(text(row.id), row, list); if (kept != null) given.set(text(row.id), kept); }
      if (list.length === 0) return given;
      for (const row of people) {
        const agentId = text(row.id);
        if (given.has(agentId)) continue;
        const was = storedVoice(agentId, row);
        const taken = [...given.values()];
        const picked = pickAgentVoice({ agentId, name: text(row.name), isChiefOfStaff: isChiefOfStaffTitle(text(row.title)), voices: list, takenVoiceIds: taken });
        if (picked == null) continue;
        given.set(agentId, picked);
        try { await saveVoice(agentId, row, picked); }
        catch (error) { options.log(`voice: ${picked} given to agent ${agentId} for now, not saved: ${errorText(error)}`); continue; }
        options.log(`voice for agent ${agentId}: ${picked} (given by name${was == null ? "" : `, ${was} is no longer listed`}, ${taken.length} other agents with voices)`);
      }
      return given;
    };
    assigning ??= run().finally(() => { assigning = null; });
    return assigning;
  };

  /**
   * The agent's voice, given one now if it has none on the list (8 October
   * 2026): its name's gender, the voice fewest agents have, Simeon's own for
   * the Chief of Staff (`shared/voice-call/agent-voices.ts`), saved so it
   * stays. Null (the agent's own voice, Michael) when the voices cannot be
   * listed or none is left to give.
   */
  const assignedVoice = async (agentId: string, row: Record<string, unknown> | null): Promise<string | null> => {
    if (row == null) return storedVoice(agentId, row);
    let list: VoiceOption[];
    try { list = await loadVoices(); }
    catch (error) {
      options.log(`voice: none given to agent ${agentId}, the voices could not be listed: ${errorText(error)}`);
      return storedVoice(agentId, row);
    }
    const kept = keptVoice(agentId, row, list);
    if (kept != null || list.length === 0) return kept;
    // A pass already under way may have started before this agent was hired: then one more.
    let given = await assignMissingVoices();
    if (!given.has(agentId)) given = await assignMissingVoices();
    return given.get(agentId) ?? null;
  };

  const service: VoiceCallService = {
    start(agentIdRaw, hintRaw, colorRaw) {
      if (!options.isEnabled()) throw new Error("Voice calls are switched off on this Mac (SIMEON_VOICE_CALLS).");
      const agentId = requireAgentId(agentIdRaw);
      if (call != null && options.window.isOpen()) {
        options.window.focus();
        return { status: "focused", agentId: call.agentId };
      }
      const hint = typeof hintRaw === "string" && hintRaw.trim().length > 0 ? hintRaw.trim() : selected?.agentId === agentId ? selected.name : null;
      const color = paletteColor(colorRaw) ?? (selected?.agentId === agentId ? selected.color : null);
      call = newCall(agentId, hint, color);
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
          let avatar = text(row?.avatarDataUrl);
          if (avatar.length === 0 && options.legs.getAgentAvatar != null) {
            try {
              const answer = await options.legs.getAgentAvatar({ id: active.agentId });
              avatar = isRecord(answer) ? text(answer.dataUrl) : "";
            } catch (error) { options.log(`setup: the agent's picture could not be read: ${errorText(error)}`); }
          }
          const setup: VoiceCallSetup = {
            agentId: active.agentId,
            name: text(row?.name).trim() || active.hintName || "Agent",
            color: paletteColor(row?.avatarColor) ?? active.hintColor,
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
        case "sendTask":
          return active.channel == null ? RELAY_SOFT_FAIL : await active.channel.sendTask(args);
        case "recallTextMessages":
          return active.channel == null ? "The text messages could not be read just now." : await active.channel.recallTextMessages();
        case "callEnded": {
          const seconds = typeof args.seconds === "number" ? args.seconds : Number.NaN;
          active.heard = heardLines(args.transcript);
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
          call = newCall(active.agentId, active.hintName, active.hintColor);
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
      const voiceId = await assignedVoice(agentId, row);
      return { voiceId: voiceId ?? VOICE_CALL_DEFAULT_VOICE_ID, isDefault: voiceId == null };
    },
    async setAgentVoice(agentIdRaw, voiceIdRaw) {
      const agentId = requireAgentId(agentIdRaw);
      const voiceId = voiceIdRaw == null || voiceIdRaw === "" ? null : typeof voiceIdRaw === "string" && VOICE_ID_PATTERN.test(voiceIdRaw) ? voiceIdRaw : undefined;
      if (voiceId === undefined) throw new Error("That is not a voice id.");
      const row = await findAgent(agentId);
      if (row == null) throw new Error("No such agent.");
      await saveVoice(agentId, row, voiceId);
      options.log(`voice for agent ${agentId}: ${voiceId ?? "default"}`);
      return { voiceId: voiceId ?? VOICE_CALL_DEFAULT_VOICE_ID, isDefault: voiceId == null };
    },
    async rateCall(conversationIdRaw, likeRaw) {
      if (typeof conversationIdRaw !== "string" || !CONVERSATION_ID_PATTERN.test(conversationIdRaw)) return { ok: false };
      const like = likeRaw === true ? true : likeRaw === false ? false : null;
      try {
        await options.api().rateCall(conversationIdRaw, like);
        options.log(`call ${conversationIdRaw} rated ${like == null ? "(cleared)" : like ? "good" : "bad"}`);
        return { ok: true };
      } catch (error) {
        options.log(`call rating not sent (conversation ${conversationIdRaw}): ${errorText(error)}`);
        return { ok: false };
      }
    },
    async voicePreviewUrl(voiceIdRaw) {
      if (typeof voiceIdRaw !== "string" || !VOICE_ID_PATTERN.test(voiceIdRaw)) return null;
      const voice = (await loadVoices()).find((one) => one.id === voiceIdRaw);
      return voice == null || voice.previewUrl == null ? null : await options.previews.urlFor(voice);
    },
    noteSelectedAgent(agentIdRaw, nameRaw, colorRaw) {
      const next = typeof agentIdRaw === "string" && agentIdRaw.length > 0 ? { agentId: agentIdRaw, name: typeof nameRaw === "string" && nameRaw.trim().length > 0 ? nameRaw.trim() : "Agent", color: paletteColor(colorRaw) } : null;
      // The window names an agent as soon as it shows one: every agent gets its voice then, not at its first call.
      if (next != null && options.isEnabled() && now() - lastAssignedAtMs >= ASSIGN_VOICES_EVERY_MS) {
        lastAssignedAtMs = now();
        void assignMissingVoices().catch(() => {});
      }
      if (next?.agentId === selected?.agentId && next?.name === selected?.name && next?.color === selected?.color) return;
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
        start: () => { try { service.start(target.agentId, target.name, target.color); } catch (error) { options.log(`menu: ${errorText(error)}`); } },
      };
    },
    settled: () => finishing,
  };
  return service;
}
