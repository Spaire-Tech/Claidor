import { createDeadlinePolicy, realClock, type DeadlinePolicy } from "../../internal/scheduling.js";
import { claidorProxyRequest, type ClaidorApiAuth } from "../../shared/node/cursor-backend/claidor-api.js";

const TRANSCRIBE_TIMEOUT_MS = 60_000;
const DEFAULT_TRANSCRIBE_LANGUAGE = "en-US";
const transcribeDeadline = createDeadlinePolicy(realClock, { name: "claidor-transcribe-audio", timeoutMs: TRANSCRIBE_TIMEOUT_MS });

// Dictation, on Claidor's `/audio/transcriptions` door
// (`server/polar/desktop/capabilities.py`). Until 19 September 2026 this was
// a Connect RPC call on `aiserver.v1.AiService/TranscribeAudio`, which
// Claidor never served. The edge (`main-edge.ts`, `transcribeAudio`) and the
// renderer still call `manager.transcribe({ audio, mimeType, language })` and
// get `{ text, transcriptionTimeMs }` back; only the wire changed.

export class SandTranscribeEmptyAudioError extends Error {
  constructor() { super("Cannot transcribe empty audio."); }
}

export interface SandTranscriptionOptions extends ClaidorApiAuth {
  readonly fetch?: typeof fetch;
  readonly deadline?: DeadlinePolicy;
}

function audioFilename(mimeType: string): string {
  const subtype = (mimeType.split("/")[1] ?? "webm").split("+")[0] ?? "webm";
  return `audio.${subtype}`;
}

export class SandTranscriptionManager {
  constructor(private readonly options: SandTranscriptionOptions) {}

  async transcribe(args: { readonly audio: Uint8Array; readonly mimeType: string; readonly language?: string }): Promise<{ text: string; transcriptionTimeMs: number }> {
    if (args.audio.length === 0) throw new SandTranscribeEmptyAudioError();
    const language = args.language != null && args.language.length > 0 ? args.language : DEFAULT_TRANSCRIBE_LANGUAGE;
    const mimeType = (args.mimeType.split(";")[0] ?? args.mimeType).trim() || "audio/webm";
    return await (this.options.deadline ?? transcribeDeadline).run(async (signal) => {
      const form = new FormData();
      const bytes = new Uint8Array(args.audio.byteLength);
      bytes.set(args.audio);
      form.append("file", new Blob([bytes], { type: mimeType }), audioFilename(mimeType));
      form.append("language", language);
      const response = await claidorProxyRequest(this.options, "audio/transcriptions", {
        form,
        signal,
        ...(this.options.fetch === undefined ? {} : { fetch: this.options.fetch }),
      });
      const body = (await response.json().catch(() => null)) as { text?: unknown; seconds?: unknown } | null;
      const seconds = typeof body?.seconds === "number" && Number.isFinite(body.seconds) ? body.seconds : 0;
      return {
        text: typeof body?.text === "string" ? body.text : "",
        transcriptionTimeMs: Math.round(seconds * 1_000),
      };
    });
  }
}
