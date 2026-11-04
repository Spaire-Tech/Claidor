// The browser in the app, the frames between this PC and the agents' engine
// (docs/app-browser/protocol.md, step 2a, 4 November 2026). The engine sends
// a welcome, then requests (one browser step each) and cancels; this PC
// answers with its hello, a ping every 10 s, and one response per request.

import { type JSONObject, type JSONValue, isObject } from '../hands/wire'

export const requestsPath = '/local-browser/requests'
export const responsesPath = '/local-browser/responses'

/** The protocol both sides speak. */
export const protocolVersion = 1

/** The ops the engine may send (the `browser_*` tools, OpenPage, Auto-review's read). */
export const ops = [
  'navigate',
  'snapshot',
  'click',
  'mouse_click_xy',
  'type',
  'fill',
  'select_option',
  'upload_file',
  'press_key',
  'scroll',
  'drag',
  'get_bounding_box',
  'highlight',
  'cdp',
  'tabs',
  'screenshot',
  'review_state',
  // The cards' fills (step 3b): the in-chat form, 1Password, saved logins, a new password.
  'form',
  // The checkout card (step 3c): the checkout's text and picture, Link's card or pay token put in.
  'checkout',
  // A flight paid on Duffel's form (step 3c-2): Simeon's pay page, opened and driven step by step.
  'flight',
] as const
export type Op = (typeof ops)[number]

export interface BrowserRequest {
  requestId: string
  op: Op
  viewId: string
  args: JSONObject
  screenshot: boolean
  deadlineMs: number
}

export type EngineFrame =
  | { kind: 'welcome'; providerId: string; enabled: boolean }
  | { kind: 'request'; request: BrowserRequest }
  /** A request this PC can't take (another protocol, an unknown op): answered with a failure. */
  | { kind: 'refused'; requestId: string; error: string }
  | { kind: 'cancel'; requestId: string }

/** The longest a step may run here, whatever the engine asks. */
export const deadlineCapMs = 90_000

function text(value: JSONValue | undefined, max: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined
}

/** One frame from the engine, checked; undefined for one this PC doesn't know. */
export function readFrame(json: JSONValue): EngineFrame | undefined {
  if (!isObject(json)) return undefined
  if (json.kind === 'welcome') {
    const providerId = text(json.providerId, 256)
    return providerId ? { kind: 'welcome', providerId, enabled: json.enabled === true } : undefined
  }
  if (json.kind === 'cancel') {
    const requestId = text(json.requestId, 256)
    return requestId ? { kind: 'cancel', requestId } : undefined
  }
  if (json.kind !== 'request') return undefined
  const requestId = text(json.requestId, 256)
  if (!requestId) return undefined
  if (json.protocol !== protocolVersion)
    return { kind: 'refused', requestId, error: 'This app speaks another version of the browser protocol; update Simeon.' }
  const op = json.op
  if (typeof op !== 'string' || !(ops as readonly string[]).includes(op))
    return { kind: 'refused', requestId, error: `This app doesn't know the browser step ${JSON.stringify(String(op)).slice(0, 80)}.` }
  const viewId = text(json.viewId, 256)
  if (!viewId) return { kind: 'refused', requestId, error: 'The browser step named no tab.' }
  const args = isObject(json.args) ? json.args : {}
  const deadline = typeof json.deadlineMs === 'number' && Number.isFinite(json.deadlineMs) ? json.deadlineMs : deadlineCapMs
  return {
    kind: 'request',
    request: {
      requestId,
      op: op as Op,
      viewId,
      args,
      screenshot: json.screenshot === true,
      deadlineMs: Math.max(1_000, Math.min(deadlineCapMs, deadline)),
    },
  }
}

export interface HelloFields {
  /** Where the browser is: the Windows app's, or the Mac's helper (step 4). */
  platform?: 'windows' | 'mac'
  label: string
  deviceId: string
  browserSession: string
}

export function hello(fields: HelloFields): JSONObject {
  return {
    kind: 'hello',
    protocol: protocolVersion,
    browser: true,
    platform: fields.platform ?? 'windows',
    label: fields.label,
    deviceId: fields.deviceId,
    browserSession: fields.browserSession,
  }
}

export const ping: JSONObject = { kind: 'ping' }

/** A step's answer: a failure's sentence, or what it did and the page it left. */
export type Answer =
  | { ok: false; error: string }
  | {
      ok: true
      summary: string
      url?: string
      title?: string
      data?: string
      viewId?: string
      /** A PNG, base64. */
      screenshotB64?: string
    }

export function response(requestId: string, answer: Answer): JSONObject {
  if (!answer.ok) return { kind: 'response', requestId, ok: false, error: answer.error }
  const frame: JSONObject = { kind: 'response', requestId, ok: true, summary: answer.summary }
  if (answer.url !== undefined) frame.url = answer.url
  if (answer.title !== undefined) frame.title = answer.title
  if (answer.data !== undefined) frame.data = answer.data
  if (answer.viewId !== undefined) frame.viewId = answer.viewId
  if (answer.screenshotB64 !== undefined) {
    frame.screenshot = true
    frame.screenshotB64 = answer.screenshotB64
  }
  return frame
}

export function batch(providerId: string, frames: JSONValue[]): JSONObject {
  return { providerId, frames }
}
