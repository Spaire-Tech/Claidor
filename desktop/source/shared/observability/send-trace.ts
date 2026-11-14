/**
 * The trace header a send travels with.
 *
 * The header is one line of four fields joined by dashes: a version, a trace
 * id of 32 hex digits that every step of one send shares, a span id of 16
 * hex digits that names the step that wrote the header, and two hex digits
 * of flags whose lowest bit says the trace is being recorded. This file
 * reads such a header, makes a new one, and makes the one a step hands on
 * to the step it calls.
 */

/** The share of sends that are traced: all of them. */
export const SEND_TRACE_SAMPLE_RATIO = 1;

export interface ParsedTraceparent {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
}

/** The one version of the header that is read and written here. */
const VERSION = "00";
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
/** The flag that says a trace is recorded. */
const SAMPLED = 1;

/** Whether `text` is exactly `digits` hex digits, with no capital letters. */
function isSmallHex(text: string, digits: number): boolean {
  return text.length === digits && /^[0-9a-f]*$/.test(text);
}

/** An id of nothing but zeros stands for "no id" and is never a real one. */
function isAllZeros(text: string): boolean {
  return /^0+$/.test(text);
}

function hasFourFields(fields: string[]): fields is [string, string, string, string] {
  return fields.length === 4;
}

/**
 * The ids and flags of a header, or nothing when it is not a header of the
 * shape above. Spaces around the whole line are let through; anything else
 * out of place is not.
 */
export function parseTraceparent(traceparent: unknown): ParsedTraceparent | undefined {
  if (typeof traceparent !== "string") {
    return undefined;
  }
  const fields = traceparent.trim().split("-");
  if (!hasFourFields(fields)) {
    return undefined;
  }
  const [version, traceId, spanId, flags] = fields;
  const wellFormed =
    version === VERSION &&
    isSmallHex(traceId, TRACE_ID_BYTES * 2) &&
    !isAllZeros(traceId) &&
    isSmallHex(spanId, SPAN_ID_BYTES * 2) &&
    !isAllZeros(spanId) &&
    isSmallHex(flags, 2);
  if (!wellFormed) {
    return undefined;
  }
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16) };
}

/** Random bytes from the machine, written as two hex digits each. Fails when the machine has none to give. */
function randomHex(byteCount: number): string {
  const bytes = new Uint8Array(byteCount);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function headerOf(traceId: string, spanId: string, sampled: boolean): string {
  return `${VERSION}-${traceId}-${spanId}-${sampled ? "01" : "00"}`;
}

/**
 * Whether this send is one of the traced ones. A ratio of 1 or more traces
 * every send and a ratio of 0 or less, or one that is no number, traces
 * none; the dice are thrown only for a ratio in between.
 */
export function shouldSampleSend(ratio = SEND_TRACE_SAMPLE_RATIO, random: () => number = Math.random): boolean {
  // Asked this way round so that a ratio that is not a number counts as "never".
  const sometimes = ratio > 0;
  if (!sometimes) {
    return false;
  }
  if (ratio >= 1) {
    return true;
  }
  return random() < ratio;
}

/**
 * A header for a new trace: a fresh trace id, then a fresh span id. Nothing
 * comes back when the machine cannot give random bytes: a send goes out
 * untraced rather than fail.
 */
export function mintTraceparent(sampled = true): { readonly traceparent: string; readonly traceId: string; readonly spanId: string } | undefined {
  try {
    const traceId = randomHex(TRACE_ID_BYTES);
    const spanId = randomHex(SPAN_ID_BYTES);
    return { traceparent: headerOf(traceId, spanId, sampled), traceId, spanId };
  } catch {
    return undefined;
  }
}

/**
 * The header a step hands to the step it calls: the parent's trace id, a
 * fresh span id, and of the parent's flags only whether it is sampled.
 * Nothing comes back for a parent that is no header, or when the machine
 * cannot give random bytes.
 */
export function deriveChildTraceparent(parent: string): { readonly traceparent: string; readonly spanId: string } | undefined {
  const parsed = parseTraceparent(parent);
  if (parsed === undefined) {
    return undefined;
  }
  try {
    const spanId = randomHex(SPAN_ID_BYTES);
    const sampled = (parsed.traceFlags & SAMPLED) === SAMPLED;
    return { traceparent: headerOf(parsed.traceId, spanId, sampled), spanId };
  } catch {
    return undefined;
  }
}
