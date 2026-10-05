/**
 * The three voice doors on Simeon Labs' server (`server/simeon/desktop/voice.py`),
 * through the app's authenticated proxy client, as the dictation manager
 * (`account/simeon-transcribe.ts`) reaches its own:
 *
 *   POST voice/calls                     → { token, conversation_id, agent_id }
 *   POST voice/calls/{conversation}/end  { seconds } → { seconds, summary }
 *   GET  voice/voices                    → [{ id, name, description, labels, preview_url }]
 *   POST voice/calls/{conversation}/feedback { like } → {}
 *
 * A refusal arrives as `SimeonApiError` with the server's own sentence and
 * status; 503 means the server has no ElevenLabs key.
 */
import { createDeadlinePolicy, realClock, type DeadlinePolicy } from "../../internal/scheduling.js";
import { simeonProxyRequest, type SimeonApiAuth } from "../../shared/node/simeon-backend/simeon-api.js";

export const VOICE_CALLS_PATH = "voice/calls";
export const VOICE_VOICES_PATH = "voice/voices";
const VOICE_REQUEST_TIMEOUT_MS = 30_000;

export interface VoiceCallTicket {
  readonly token: string;
  readonly conversationId: string | null;
  readonly agentId: string | null;
}

export interface VoiceCallEnding {
  readonly seconds: number;
  readonly summary: string | null;
  /** What was said on the call, for the record in the agent's voice-calls/ folder. */
  readonly transcript?: readonly { readonly speaker: "user" | "agent"; readonly text: string }[];
}

export interface VoiceOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly labels: Readonly<Record<string, string>>;
  readonly previewUrl: string | null;
}

export interface VoiceCallApi {
  startCall(): Promise<VoiceCallTicket>;
  endCall(conversationId: string, seconds: number): Promise<VoiceCallEnding>;
  listVoices(): Promise<VoiceOption[]>;
  /** The person's thumbs on a call: ElevenLabs' own rating of the conversation. */
  rateCall(conversationId: string, like: boolean | null): Promise<void>;
}

export interface VoiceCallApiOptions extends SimeonApiAuth {
  readonly fetch?: typeof fetch;
  readonly deadline?: DeadlinePolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseVoiceCallTicket(body: unknown): VoiceCallTicket {
  if (!isRecord(body) || typeof body.token !== "string" || body.token.length === 0) throw new Error("The voice service sent no call token.");
  return {
    token: body.token,
    conversationId: typeof body.conversation_id === "string" && body.conversation_id.length > 0 ? body.conversation_id : null,
    agentId: typeof body.agent_id === "string" && body.agent_id.length > 0 ? body.agent_id : null,
  };
}

export function parseVoiceCallEnding(body: unknown, fallbackSeconds: number): VoiceCallEnding {
  const record = isRecord(body) ? body : {};
  return {
    seconds: typeof record.seconds === "number" && Number.isFinite(record.seconds) ? record.seconds : fallbackSeconds,
    summary: typeof record.summary === "string" && record.summary.trim().length > 0 ? record.summary.trim() : null,
    transcript: Array.isArray(record.transcript)
      ? record.transcript.filter(isRecord).map((line) => ({ speaker: line.speaker === "agent" ? "agent" as const : "user" as const, text: typeof line.text === "string" ? line.text.trim() : "" })).filter((line) => line.text.length > 0).slice(0, 400)
      : [],
  };
}

export function parseVoiceOptions(body: unknown): VoiceOption[] {
  if (!Array.isArray(body)) return [];
  const voices: VoiceOption[] = [];
  for (const row of body) {
    if (!isRecord(row) || typeof row.id !== "string" || row.id.length === 0) continue;
    const labels: Record<string, string> = {};
    if (isRecord(row.labels)) for (const [key, value] of Object.entries(row.labels)) if (typeof value === "string") labels[key] = value;
    voices.push({
      id: row.id,
      name: typeof row.name === "string" && row.name.trim().length > 0 ? row.name.trim() : row.id,
      description: typeof row.description === "string" ? row.description.trim() : "",
      labels,
      previewUrl: typeof row.preview_url === "string" && /^https:\/\//.test(row.preview_url) ? row.preview_url : null,
    });
  }
  return voices;
}

/** The server's conversation ids are letters, digits, `_` and `-`; anything else is not sent. */
export const CONVERSATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function createVoiceCallApi(options: VoiceCallApiOptions): VoiceCallApi {
  const deadline = options.deadline ?? createDeadlinePolicy(realClock, { name: "simeon-voice-call", timeoutMs: VOICE_REQUEST_TIMEOUT_MS });
  const fetchOption = options.fetch === undefined ? {} : { fetch: options.fetch };
  return {
    startCall: () => deadline.run(async (signal) => {
      const response = await simeonProxyRequest(options, VOICE_CALLS_PATH, { json: {}, signal, ...fetchOption });
      return parseVoiceCallTicket(await response.json().catch(() => null));
    }),
    endCall: (conversationId, seconds) => deadline.run(async (signal) => {
      if (!CONVERSATION_ID_PATTERN.test(conversationId)) throw new Error("That is not a conversation id.");
      const whole = Math.max(0, Math.ceil(Number.isFinite(seconds) ? seconds : 0));
      const response = await simeonProxyRequest(options, `${VOICE_CALLS_PATH}/${conversationId}/end`, { json: { seconds: whole }, signal, ...fetchOption });
      return parseVoiceCallEnding(await response.json().catch(() => null), whole);
    }),
    rateCall: (conversationId, like) => deadline.run(async (signal) => {
      if (!CONVERSATION_ID_PATTERN.test(conversationId)) throw new Error("That is not a conversation id.");
      await simeonProxyRequest(options, `${VOICE_CALLS_PATH}/${conversationId}/feedback`, { json: { like }, signal, ...fetchOption });
    }),
    listVoices: () => deadline.run(async (signal) => {
      const response = await simeonProxyRequest(options, VOICE_VOICES_PATH, { method: "GET", signal, ...fetchOption });
      return parseVoiceOptions(await response.json().catch(() => null));
    }),
  };
}
