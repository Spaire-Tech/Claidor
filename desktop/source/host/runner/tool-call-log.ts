import { clipForHostLog, HOST_LOG_PREFIX } from "../../shared/host-log.js";

// One line per completed tool call in the host log. The model-call line
// (`[claidor] model=… tools=SendMessage(…)`) says what the model asked for;
// this line says what the tool answered, which is what the model reads next.
// Until 23 September 2026 the only record of a tool result was inside the
// loop's own logger, and the box silences that logger, so a SendMessage that
// failed left no trace but the bill.
export interface ToolCallLogLine {
  readonly name: string;
  readonly callId: string;
  readonly outcome: string;
}

export function formatToolCallLogLine(line: ToolCallLogLine): string {
  return `${HOST_LOG_PREFIX} tool=${line.name} id=${line.callId} ${line.outcome}`;
}

type Loose = Record<string, any>;

function resultJson(toolCall: Loose): unknown {
  const value = toolCall?.tool?.value;
  const result = value?.result;
  if (result == null) return undefined;
  if (typeof result.toJson === "function") {
    try { return result.toJson(); } catch { return undefined; }
  }
  return result;
}

// "result=success" or "result=error detail=<the sentence the model reads>",
// read off the generated result proto: every tool result is a oneof with a
// `success`/`error` (or similar) case, and an error case carries its text.
export function summarizeToolCallOutcome(toolCall: Loose): string {
  const json = resultJson(toolCall);
  if (json == null || typeof json !== "object") return "result=none";
  const record = json as Loose;
  const keys = Object.keys(record);
  const errorKey = keys.find((key) => /error|fail|reject/i.test(key));
  if (errorKey != null) {
    const detail = record[errorKey];
    const text = typeof detail === "string"
      ? detail
      : detail != null && typeof detail === "object"
        ? String((detail as Loose).error ?? (detail as Loose).message ?? JSON.stringify(detail))
        : String(detail);
    return `result=${errorKey} detail=${clipForHostLog(text)}`;
  }
  const first = keys[0];
  if (first == null) return "result=empty";
  let rendered = "";
  try { rendered = JSON.stringify(record[first]); } catch { rendered = String(record[first]); }
  return `result=${first} ${clipForHostLog(rendered, 120)}`;
}
