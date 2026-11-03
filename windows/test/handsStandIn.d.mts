// The types of handsStandIn.mjs, for the tests written in TypeScript.

export const requestsPath: string
export const responsesPath: string

export interface Frame {
  kind: string
  requestId?: string
  message?: Record<string, unknown>
  error?: string
  bytesBase64?: string
  [key: string]: unknown
}

export interface HandsGateway {
  state: {
    streams: { authorized: boolean }[]
    batches: { providerId?: string; frames?: Frame[]; authorized: boolean }[]
    frames: Frame[]
  }
  readonly openStreams: number
  push(frame: Record<string, unknown>): void
  closeStreams(): void
  waitFor<T>(ready: () => T | undefined | false | null, ms?: number, what?: string): Promise<T>
  framesFor(requestId: string): Frame[]
}

export function handsGateway(options?: { providerId?: string }): HandsGateway

export function startHandsGateway(options?: { providerId?: string; token?: string }): Promise<{
  gateway: HandsGateway
  base: string
  target: { baseURL: string; headers: Record<string, string> }
  close(): Promise<void>
}>
