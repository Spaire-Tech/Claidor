/** Types for `execProtocol.mjs`, which is plain JavaScript so the bridge can run unbuilt. */
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

export declare const EXIT_BRIDGE_MISCONFIGURED: number;
export declare const EXIT_BRIDGE_TRANSPORT: number;
export declare const EXIT_BRIDGE_UNSUPPORTED: number;

export type BoxServerFrame =
  | { t: 'stdout'; data: Buffer }
  | { t: 'stderr'; data: Buffer }
  | { t: 'exit'; code: number | null }
  | { t: 'error'; message: string };

export declare function buildExecRequestUrl(brokerBaseUrl: string, boxId: string): string;
export declare function encodeExecRequest(params: {
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  usePty?: boolean;
  stdin?: Buffer | string;
}): string;
export declare function decodeServerFrame(raw: string | Uint8Array): BoxServerFrame;
export declare function splitFrames(
  pending: string,
  chunk: string | Uint8Array,
): { lines: string[]; pending: string };
