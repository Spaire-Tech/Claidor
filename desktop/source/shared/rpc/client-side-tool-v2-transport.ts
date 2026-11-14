/**
 * The envelope a tool call, or its result, travels in from the host to the
 * window. The host's events reach the coordinator as text, so the message
 * goes as the wire's own bytes written in base64; the coordinator checks
 * every envelope once and hands the window the bytes themselves.
 *
 * The message is the generated protobuf's own wire form, not a JSON shape of
 * ours, because the retired window (the pinned renderer, `desktop/NOTICE.md`)
 * reads it that way. Where it does, in the window's built file:
 * src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3097937
 * src/app/dist/renderer/assets/index-UbX-y3il.js#byteOffset=3102316
 */
import {
  ClientSideToolV2Call,
  ClientSideToolV2Result,
} from "../../packages/proto/generated/simeon/v1/tools_pb.js";

/** The name of the events these envelopes are sent under. */
export const CLIENT_SIDE_TOOL_V2_FAMILY = "client-side-tool-v2";
export const CLIENT_SIDE_TOOL_V2_WIRE_VERSION = 1;
/** The account slot the host's envelopes carry; the coordinator passes on no other. */
export const CLIENT_SIDE_TOOL_V2_ACCOUNT_SLOT = "host";

export type ClientSideToolV2MessageKind = "call" | "result";

/** A message as it is sent: the wire's bytes in base64, under the name of its type. */
export interface EncodedClientSideToolV2Message {
  readonly encoding: "protobuf-base64";
  readonly messageType:
    | "simeon.v1.ClientSideToolV2Call"
    | "simeon.v1.ClientSideToolV2Result";
  readonly bytes: string;
}

/** A call or a result of one agent: which run of the host sent it (`epoch`) and its place in that run's line (`sequence`). */
export interface ClientSideToolV2TransportUpdate {
  readonly version: typeof CLIENT_SIDE_TOOL_V2_WIRE_VERSION;
  readonly kind: ClientSideToolV2MessageKind;
  readonly accountSlot: string;
  readonly agentId: string;
  readonly epoch: string;
  readonly sequence: number;
  readonly message: EncodedClientSideToolV2Message;
}

/** The host forgetting the calls it had open for an agent. It carries no message. */
export interface ClientSideToolV2TransportReset {
  readonly version: typeof CLIENT_SIDE_TOOL_V2_WIRE_VERSION;
  readonly kind: "reset";
  readonly accountSlot: string;
  readonly agentId: string;
  readonly epoch: string;
  readonly sequence: number;
}

export type ClientSideToolV2TransportEvent =
  | ClientSideToolV2TransportUpdate
  | ClientSideToolV2TransportReset;

/** An update as the window gets it: the same, with the message's bytes out of their base64. */
type WindowUpdate = Omit<ClientSideToolV2TransportUpdate, "message"> & {
  readonly message: Omit<EncodedClientSideToolV2Message, "bytes" | "encoding"> & {
    readonly encoding: "protobuf";
    readonly bytes: Uint8Array;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** The name a message is sent under. Whatever is not a call is named, and read, as a result. */
function messageTypeOf(kind: unknown): EncodedClientSideToolV2Message["messageType"] {
  return kind === "call" ? "simeon.v1.ClientSideToolV2Call" : "simeon.v1.ClientSideToolV2Result";
}

/** Base64 as it is written: its letters in fours, the last four filled with one or two signs. */
const BASE64_TEXT = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * The bytes a text stands for when it is the one right base64 of them.
 * Node reads base64 leniently (a missing sign, bits left over in the last
 * letter); a text it would only read that way is refused, so that the same
 * bytes are never accepted under two spellings.
 */
function bytesOfBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !BASE64_TEXT.test(text)) return null;
  const bytes = Buffer.from(text, "base64");
  return bytes.toString("base64") === text ? bytes : null;
}

export function encodeClientSideToolV2Message(
  kind: "call",
  value: ClientSideToolV2Call,
): EncodedClientSideToolV2Message;
export function encodeClientSideToolV2Message(
  kind: "result",
  value: ClientSideToolV2Result,
): EncodedClientSideToolV2Message;
export function encodeClientSideToolV2Message(
  kind: ClientSideToolV2MessageKind,
  value: ClientSideToolV2Call | ClientSideToolV2Result,
): EncodedClientSideToolV2Message {
  return {
    encoding: "protobuf-base64",
    messageType: messageTypeOf(kind),
    bytes: Buffer.from(value.toBinary()).toString("base64"),
  };
}

/**
 * The message inside what was sent, or null when it is not one: the wrong
 * encoding or name for its kind, text that is not the one right base64,
 * bytes the wire cannot read, or a message that names no tool call.
 */
export function decodeClientSideToolV2Message(
  kind: ClientSideToolV2MessageKind,
  value: unknown,
): ClientSideToolV2Call | ClientSideToolV2Result | null {
  if (!isRecord(value)) return null;
  if (value.encoding !== "protobuf-base64" || typeof value.bytes !== "string") return null;
  if (value.messageType !== messageTypeOf(kind)) return null;
  const bytes = bytesOfBase64(value.bytes);
  if (bytes === null) return null;
  try {
    const message = (kind === "call" ? ClientSideToolV2Call : ClientSideToolV2Result).fromBinary(bytes);
    return message.toolCallId.length === 0 ? null : message;
  } catch {
    return null;
  }
}

/**
 * What every event says besides its kind: the version, who it speaks for,
 * the agent, the run of the host and the place in line (a whole number from
 * 1 up). Null when any of it is missing or wrong. The fields are handed back
 * with it, for the kind and the message still to be read.
 */
function headerOf(value: unknown) {
  if (!isRecord(value) || value.version !== CLIENT_SIDE_TOOL_V2_WIRE_VERSION) return null;
  if (!isNonEmptyString(value.accountSlot)) return null;
  if (!isNonEmptyString(value.agentId)) return null;
  if (!isNonEmptyString(value.epoch)) return null;
  if (!Number.isSafeInteger(value.sequence) || (value.sequence as number) < 1) return null;
  const header = {
    version: CLIENT_SIDE_TOOL_V2_WIRE_VERSION,
    accountSlot: value.accountSlot,
    agentId: value.agentId,
    epoch: value.epoch,
    sequence: value.sequence as number,
  } as const;
  return { header, fields: value };
}

/**
 * An event as the host sent it, or null when it is not one. What it holds
 * besides its own fields is dropped; the message of a call or a result is
 * handed on as it came, once it has been read through.
 */
export function parseClientSideToolV2TransportEvent(value: unknown): ClientSideToolV2TransportEvent | null {
  const read = headerOf(value);
  if (read === null) return null;
  const { header, fields } = read;
  if (fields.kind === "reset") return { ...header, kind: "reset" };
  if (fields.kind !== "call" && fields.kind !== "result") return null;
  if (decodeClientSideToolV2Message(fields.kind, fields.message) === null) return null;
  return {
    ...header,
    kind: fields.kind,
    message: fields.message as unknown as EncodedClientSideToolV2Message,
  };
}

/** The event as the window gets it: a reset as it is, a call or a result with its bytes out of their base64. */
export function materializeClientSideToolV2RendererEvent(value: unknown): WindowUpdate | ClientSideToolV2TransportReset | null {
  const event = parseClientSideToolV2TransportEvent(value);
  if (event === null || event.kind === "reset") return event;
  const { messageType, bytes } = event.message;
  return {
    ...event,
    message: { encoding: "protobuf", messageType, bytes: Buffer.from(bytes, "base64") },
  };
}
