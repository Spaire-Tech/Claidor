// The one channel that is known to reach the box's host log
// (`/tmp/sand-host.log`): a line on stdout. The `[claidor]` model-call line
// has travelled it since 22 September 2026; the tool-result and
// send-message lines join it on 23 September. Nothing here goes through the
// loop's own logger, which the production runner context silences
// (`host/runner-context-production-provider.ts`).
export const HOST_LOG_PREFIX = "[claidor]";

let sink: (line: string) => void = (line) => console.info(line);

export function logHostLine(line: string): void {
  sink(line);
}

export function setHostLogSink(next: ((line: string) => void) | null): void {
  sink = next ?? ((line) => console.info(line));
}

export function clipForHostLog(value: string, max = 160): string {
  const flat = value.replace(/\s+/g, " ");
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
