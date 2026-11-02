// What the person's computer and this PC say to each other for the agent's
// hands (SimeonMacCore's LocalExecWire.swift; the engine's
// host/local-exec/local-exec-provider.ts and
// host/extensions/local-exec/local-exec-bridge.ts on the computer's side):
// the computer's requests come as one JSON per server-sent event on
// `GET {gateway}/local-exec/requests`; this PC's answers go in batches to
// `POST {gateway}/local-exec/responses`. A command's own messages are the
// agent protocol's, in protobuf's JSON (lowerCamelCase names, defaults left
// out, enums by name).

import { LocalExec } from './rules'

export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue }
export type JSONObject = { [key: string]: JSONValue }

export function isObject(value: unknown): value is JSONObject {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export const requestsPath = '/local-exec/requests'
export const responsesPath = '/local-exec/responses'

/** One request from the computer (`LocalExecWire.Request`): `welcome`, `exec`, `upload`, `download`, `cancel`, `retire-approval`. */
export interface WireRequest {
  kind: string
  requestId: string
  raw: JSONObject
}

export function readRequest(json: JSONValue): WireRequest | undefined {
  if (!isObject(json)) return undefined
  const kind = str(json.kind)
  if (kind == null) return undefined
  return { kind, requestId: str(json.requestId) ?? '', raw: json }
}

export const request = {
  providerId: (r: WireRequest) => str(r.raw.providerId),
  serverMessage: (r: WireRequest) => r.raw.serverMessage,
  approvalId: (r: WireRequest) => str(r.raw.approvalId),
  path: (r: WireRequest) => str(r.raw.path),
  bytesBase64: (r: WireRequest) => str(r.raw.bytesBase64),
}

/** The kind of command a server message carries (its one field besides the bookkeeping ones) and what it says. */
export function command(serverMessage: JSONValue): {
  kind: string
  value: JSONValue
} {
  const skipped = new Set(['id', 'execId', 'spanContext', 'acceptHookAdditionalContexts'])
  if (isObject(serverMessage))
    for (const [key, value] of Object.entries(serverMessage))
      if (!skipped.has(key)) return { kind: key, value }
  return { kind: 'undefined', value: {} }
}

// MARK: Answers

export function hello(fields: {
  localRoot: string
  terminalsFolder: string
  computerId: string
  label: string
  supervised: boolean
  variant: string
}): JSONObject {
  return { kind: 'hello', ...fields }
}

export function ping(supervised: boolean): JSONObject {
  return { kind: 'ping', supervised }
}

export function client(requestId: string, message: JSONValue): JSONObject {
  return { kind: 'client', requestId, message }
}

export function control(requestId: string, message: JSONValue): JSONObject {
  return { kind: 'control', requestId, message }
}

export function file(requestId: string, bytesBase64?: string): JSONObject {
  const fields: JSONObject = { kind: 'file', requestId }
  if (bytesBase64 != null) fields.bytesBase64 = bytesBase64
  return fields
}

export function fileError(requestId: string, error: string): JSONObject {
  return { kind: 'file-error', requestId, error }
}

/** The batch posted to the computer: `providerId` once it has welcomed this PC. */
export function batch(providerId: string | undefined, frames: JSONValue[]): JSONObject {
  const fields: JSONObject = { frames }
  if (providerId != null) fields.providerId = providerId
  return fields
}

// MARK: The agent protocol's messages, as protobuf writes them

/** `ExecClientMessage{id, <kind>: value, localExecutionTimeMs}`. */
export function clientMessage(
  id: number,
  kind: string,
  value: JSONValue,
  localMs?: number,
): JSONObject {
  const fields: JSONObject = { [kind]: value }
  if (id !== 0) fields.id = id
  if (localMs != null) fields.localExecutionTimeMs = localMs
  return fields
}

export function heartbeat(id: number): JSONObject {
  return { heartbeat: id === 0 ? {} : { id } }
}

export function streamClose(id: number): JSONObject {
  return { streamClose: id === 0 ? {} : { id } }
}

/** A failure (`ExecClientThrow`); a refusal goes with id 0, so without one. */
export function thrown(id: number, error: string, stackTrace?: string): JSONObject {
  const fields: JSONObject = { error }
  if (id !== 0) fields.id = id
  if (stackTrace != null) fields.stackTrace = stackTrace
  return { throw: fields }
}

/** `ShellStream.start`: no sandbox on this PC, as on the Mac. */
export const shellStart: JSONObject = { start: { sandboxPolicy: { type: 'TYPE_INSECURE_NONE' } } }

export function shellOutput(stream: 'stdout' | 'stderr', data: string): JSONObject {
  return { [stream]: data === '' ? {} : { data } }
}

/** `ShellStream.exit`: the code as an unsigned 32-bit number, the folder the shell is in after. */
export function shellExit(fields: {
  code: number
  cwd: string
  aborted: boolean
  abortReason?: string
  localMs?: number
}): JSONObject {
  const out: JSONObject = {}
  const unsigned = fields.code >>> 0
  if (unsigned !== 0) out.code = unsigned
  if (fields.cwd !== '') out.cwd = fields.cwd
  if (fields.aborted) out.aborted = true
  if (fields.abortReason != null) out.abortReason = fields.abortReason
  if (fields.localMs != null) out.localExecutionTimeMs = fields.localMs
  return { exit: out }
}

/** `ShellStream.backgrounded`: the command went on in the background after the time it may hold the stream. */
export function shellBackgrounded(fields: {
  shellId: number
  command: string
  workingDirectory: string
  pid?: number
  msToWait: number
}): JSONObject {
  const out: JSONObject = { msToWait: fields.msToWait, reason: 'SHELL_BACKGROUND_REASON_TIMEOUT' }
  if (fields.shellId !== 0) out.shellId = fields.shellId
  if (fields.command !== '') out.command = fields.command
  if (fields.workingDirectory !== '') out.workingDirectory = fields.workingDirectory
  if (fields.pid != null) out.pid = fields.pid
  return { backgrounded: out }
}

/** `BackgroundShellSpawnResult`. */
export function spawnSuccess(fields: {
  shellId: number
  command: string
  workingDirectory: string
  pid?: number
}): JSONObject {
  const out: JSONObject = {}
  if (fields.shellId !== 0) out.shellId = fields.shellId
  if (fields.command !== '') out.command = fields.command
  if (fields.workingDirectory !== '') out.workingDirectory = fields.workingDirectory
  if (fields.pid != null) out.pid = fields.pid
  return { success: out }
}

export function spawnError(command: string, workingDirectory: string, error: string): JSONObject {
  return { error: { command, workingDirectory, error } }
}

/** `ReadResult.success` with text. */
export function readText(fields: {
  path: string
  content: string
  totalLines: number
  fileSize: number
  truncated: boolean
  rangeApplied: boolean
}): JSONObject {
  const out: JSONObject = { path: fields.path }
  if (fields.content !== '') out.content = fields.content
  if (fields.totalLines !== 0) out.totalLines = fields.totalLines
  if (fields.fileSize !== 0) out.fileSize = String(fields.fileSize)
  if (fields.truncated) out.truncated = true
  if (fields.rangeApplied) out.rangeApplied = true
  return { success: out }
}

/** `ReadResult.success` with the bytes (an image, a PDF, a video). */
export function readData(path: string, data: Uint8Array, fileSize: number): JSONObject {
  const out: JSONObject = { path, data: Buffer.from(data).toString('base64') }
  if (fileSize !== 0) out.fileSize = String(fileSize)
  return { success: out }
}

export function readFailure(
  kind: string,
  path: string,
  detail?: { key: string; value: string },
): JSONObject {
  const out: JSONObject = { path }
  if (detail) out[detail.key] = detail.value
  return { [kind]: out }
}

// MARK: The stream

export type StreamEvent =
  | { kind: 'frame'; json: JSONValue }
  /** A block that is not JSON: logged and dropped. */
  | { kind: 'unreadable' }
  /** A block over the cap: its request id, when the first 4,096 characters name one. */
  | { kind: 'tooLarge'; requestId?: string }

const newline = 0x0a

/**
 * The computer's server-sent events, as the provider reads them
 * (`LocalExecEventParser`): blocks end at a blank line; a block's `data:`
 * lines, each trimmed, joined by newlines, are one JSON. A block longer
 * than the upload cap is skipped, its request answered "too large" when its
 * id can be found near the start. The pieces are kept as they came and
 * joined once a block ends, so a long upload is not copied over and over.
 */
export class EventParser {
  private pieces: Buffer[] = []
  private length = 0
  /** The last byte kept was a newline: a blank line may start across two pieces. */
  private endsInNewline = false
  private discarding = false

  constructor(readonly cap: number = LocalExec.uploadFrameCap) {}

  feed(chunk: Uint8Array): StreamEvent[] {
    const events: StreamEvent[] = []
    let piece = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)
    for (;;) {
      const end = this.blankLine(piece)
      if (end == null) {
        if (this.discarding) {
          // Keep only whether it ended in a newline: the blank line may straddle two reads.
          this.endsInNewline = piece.length > 0 ? piece[piece.length - 1] === newline : this.endsInNewline
          return events
        }
        this.keep(piece)
        if (this.length > this.cap) {
          events.push({ kind: 'tooLarge', requestId: requestIdIn(this.head()) })
          this.discarding = true
          this.endsInNewline = this.pieces.at(-1)?.at(-1) === newline
          this.pieces = []
          this.length = 0
        }
        return events
      }
      // `end` is where the blank line starts in `piece` (-1: its first newline was the last byte kept).
      const before = end < 0 ? Buffer.alloc(0) : piece.subarray(0, end)
      const rest = piece.subarray(end + 2)
      if (this.discarding) {
        this.discarding = false
        this.reset()
      } else {
        this.keep(before)
        const block = Buffer.concat(this.pieces, this.length)
        this.reset()
        // The blank line's first newline was already kept: it is not the block's.
        const body = end < 0 ? block.subarray(0, block.length - 1) : block
        if (body.length > this.cap) {
          events.push({ kind: 'tooLarge', requestId: requestIdIn(body) })
        } else {
          const event = parseBlock(body)
          if (event) events.push(event)
        }
      }
      piece = rest
      if (piece.length === 0) return events
    }
  }

  private reset(): void {
    this.pieces = []
    this.length = 0
    this.endsInNewline = false
  }

  private keep(piece: Buffer): void {
    if (piece.length === 0) return
    this.pieces.push(piece)
    this.length += piece.length
    this.endsInNewline = piece[piece.length - 1] === newline
  }

  /** Where the next "\n\n" starts in `piece`; -1 when its first newline ended what was kept before. */
  private blankLine(piece: Buffer): number | undefined {
    if (this.endsInNewline && piece.length > 0 && piece[0] === newline) return -1
    let from = 0
    for (;;) {
      const at = piece.indexOf(newline, from)
      if (at < 0 || at + 1 >= piece.length) return undefined
      if (piece[at + 1] === newline) return at
      from = at + 1
    }
  }

  private head(): Buffer {
    const out: Buffer[] = []
    let length = 0
    for (const piece of this.pieces) {
      out.push(piece)
      length += piece.length
      if (length >= 4096) break
    }
    return Buffer.concat(out).subarray(0, 4096)
  }
}

export function parseBlock(block: Uint8Array): StreamEvent | undefined {
  const text = Buffer.from(block).toString('utf8')
  const data = text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
  if (data.length === 0) return undefined
  try {
    return { kind: 'frame', json: JSON.parse(data.join('\n')) as JSONValue }
  } catch {
    return { kind: 'unreadable' }
  }
}

/** A request's id near the start of a block too large to read. */
export function requestIdIn(bytes: Uint8Array): string | undefined {
  const head = Buffer.from(bytes.subarray(0, 4096)).toString('utf8')
  const match = /"requestId"\s*:\s*"([^"]+)"/.exec(head)
  return match?.[1]?.trim()
}
