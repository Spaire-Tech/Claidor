/** Types for `execProtocol.mjs`, which is plain JavaScript so the bridge can run unbuilt. */
export declare const CLIENT_FRAME_KINDS: readonly string[];
export declare const SERVER_FRAME_KINDS: readonly string[];

export declare const BRIDGE_ENV: Readonly<{
  broker: string;
  token: string;
  boxId: string;
  command: string;
  workdir: string;
  env: string;
  pty: string;
}>;

export type BoxServerFrame =
  | { t: 'stdout'; data: Buffer }
  | { t: 'stderr'; data: Buffer }
  | { t: 'exit'; code: number | null }
  | { t: 'error'; message: string };

export declare function encodeStdin(chunk: Buffer | string): string;
export declare function encodeStdinClose(): string;
export declare function encodeSignal(signal: string): string;
export declare function decodeServerFrame(raw: string | Uint8Array): BoxServerFrame;
export declare function encodeExecRequest(params: {
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  usePty?: boolean;
}): string;
export declare function buildExecSocketUrl(brokerBaseUrl: string, boxId: string): string;
