import type { ConnectOutcome } from '../../main/libs/connections/connectService';

/** IPC channel names for connections. Both sides import these, never a literal. */
export const ConnectionsIpcChannel = {
  Connect: 'connections:connect',
  Disconnect: 'connections:disconnect',
} as const;
export type ConnectionsIpcChannel =
  typeof ConnectionsIpcChannel[keyof typeof ConnectionsIpcChannel];

/** What a connect attempt tells the renderer. */
export interface ConnectResultIPC {
  outcome: ConnectOutcome;
  /** A sentence for the person; absent when it worked. */
  message?: string;
}
