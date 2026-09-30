/**
 * The call banner's preload (30 September 2026): `window.simeonCall`, one
 * method per request the banner makes of Electron main, and `onEvent` for
 * what main pushes back (the agent's status while it works, its reply, a
 * hang-up from the menu). Nothing else crosses: the page has no Node.
 */
import { VOICE_CALL_EVENT_CHANNEL, VOICE_CALL_INVOKE_CHANNEL, VOICE_CALL_PANEL_METHODS, type VoiceCallPanelEvent } from "../shared/voice-call/panel-protocol.js";

export interface VoiceCallPreloadIpc {
  invoke(channel: string, payload?: unknown): Promise<unknown>;
  on(channel: string, listener: (event: unknown, payload: unknown) => void): void;
  off(channel: string, listener: (event: unknown, payload: unknown) => void): void;
}

export interface VoiceCallPreloadElectronRuntime {
  readonly ipcRenderer: VoiceCallPreloadIpc;
  readonly contextBridge: { exposeInMainWorld(name: string, value: unknown): void };
}

export function createVoiceCallBridge(ipc: VoiceCallPreloadIpc): Record<string, unknown> {
  const bridge: Record<string, unknown> = {};
  for (const method of VOICE_CALL_PANEL_METHODS) bridge[method] = (args?: unknown) => ipc.invoke(VOICE_CALL_INVOKE_CHANNEL, { method, args: args ?? {} });
  bridge.onEvent = (listener: (event: VoiceCallPanelEvent) => void): (() => void) => {
    const wrapped = (_event: unknown, payload: unknown): void => listener(payload as VoiceCallPanelEvent);
    ipc.on(VOICE_CALL_EVENT_CHANNEL, wrapped);
    return () => ipc.off(VOICE_CALL_EVENT_CHANNEL, wrapped);
  };
  return bridge;
}

export function installVoiceCallPreloadEntrypoint(electron: VoiceCallPreloadElectronRuntime): Record<string, unknown> {
  const bridge = createVoiceCallBridge(electron.ipcRenderer);
  electron.contextBridge.exposeInMainWorld("simeonCall", bridge);
  return bridge;
}

export function loadVoiceCallPreloadElectron(electronModule: unknown): VoiceCallPreloadElectronRuntime {
  const runtime = electronModule as Partial<VoiceCallPreloadElectronRuntime> | null;
  const ipc = runtime?.ipcRenderer as Partial<VoiceCallPreloadIpc> | undefined;
  const bridge = runtime?.contextBridge as { exposeInMainWorld?: unknown } | undefined;
  if (ipc == null || typeof ipc.invoke !== "function" || typeof ipc.on !== "function" || typeof ipc.off !== "function" || bridge == null || typeof bridge.exposeInMainWorld !== "function") {
    throw new Error("electron voice-call preload bindings are unavailable");
  }
  return runtime as VoiceCallPreloadElectronRuntime;
}
