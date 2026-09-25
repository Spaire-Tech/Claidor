import WebSocketModule from "ws";

/** The slice of ws@8 a connector uses; the same client the egress tunnel runs on (`shared/node/egress-tunnel/websocket-client.ts`). */
export interface ChannelSocket {
  readonly readyState: number;
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: unknown, isBinary: boolean) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "close", listener: (code: number, reason: unknown) => void): void;
  send(data: string, callback?: (error?: Error) => void): void;
  close(code?: number, reason?: string): void;
  terminate(): void;
  removeAllListeners(): void;
}

interface ChannelSocketConstructor { new (url: string, options?: { headers?: Record<string, string> }): ChannelSocket; readonly OPEN: number }

const WebSocket = WebSocketModule as unknown as ChannelSocketConstructor;

export const SOCKET_OPEN = WebSocket.OPEN;

export type CreateChannelSocket = (url: string, headers?: Record<string, string>) => ChannelSocket;

export const createChannelSocket: CreateChannelSocket = (url, headers) => new WebSocket(url, headers == null ? undefined : { headers });

export function socketText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]).toString("utf8");
  return Buffer.isBuffer(data) ? data.toString("utf8") : String(data);
}
