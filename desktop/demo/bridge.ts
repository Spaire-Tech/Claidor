/**
 * The demo's stand-in for Electron: it installs the app's own preload bridge
 * (window.desktop, window.coordinatorPort) over a fake ipcRenderer, and runs
 * the app's own coordinator port server over a MessageChannel, answering from
 * the scripted backend in ./backend.ts. Nothing here talks to a network.
 */
import { installPrimaryPreloadEntrypoint } from "../source/electron-preload/preload.js";
import { createRendererPortServer } from "../source/node-agent-coordinator/renderer-port-server.js";
import { createDemoBackend } from "./backend.js";

type Listener = (event: any, payload?: any) => void;

const TRACE = new URLSearchParams(location.search).has("trace");
const trace = (...args: unknown[]) => {
  if (TRACE) console.log("[demo]", ...args);
};

const listeners = new Map<string, Set<Listener>>();
const emit = (channel: string, event: any, payload?: any) => {
  for (const listener of listeners.get(channel) ?? []) listener(event, payload);
};

const backend = createDemoBackend({
  pushCoordinatorEvent: (family, payload) => server?.postEvent(family, payload),
  pushMainEvent: (event, payload) => emit(`sand-rpc:main:e:${event}`, {}, payload),
});

let server: ReturnType<typeof createRendererPortServer> | null = null;
Reflect.set(window, "__simeonDemo", backend);

function openCoordinatorPort(): void {
  const channel = new MessageChannel();
  const serverPort = channel.port2;
  server = createRendererPortServer(
    { post: (frame) => serverPort.postMessage(frame), close: () => serverPort.close() },
    {
      dispatchRequest: async (method, args) => {
        const outcome = await backend.coordinator(method, args);
        trace("coordinator", method, args, outcome);
        return outcome;
      },
      onServing: () => backend.onServing(),
    },
  );
  serverPort.addEventListener("message", (event) => server?.handleMessage(event.data));
  serverPort.start();
  emit("sand:coordinator-port", { ports: [channel.port1] });
}

const ipcRenderer = {
  async invoke(channel: string, payload?: unknown): Promise<any> {
    if (channel === "sand:coordinator-port-request") {
      queueMicrotask(openCoordinatorPort);
      return undefined;
    }
    const main = /^sand-rpc:main:m:(.+)$/.exec(channel);
    if (main) {
      const value = await backend.main(main[1]!, payload);
      trace("main", main[1], payload, value);
      return { ok: true, value };
    }
    const value = await backend.ipc(channel, payload);
    trace("ipc", channel, payload, value);
    return value;
  },
  sendSync(channel: string): any {
    return backend.sync(channel);
  },
  send(channel: string, payload?: unknown): void {
    trace("send", channel, payload);
  },
  on(channel: string, listener: Listener): void {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
  },
  off(channel: string, listener: Listener): void {
    listeners.get(channel)?.delete(listener);
  },
};

installPrimaryPreloadEntrypoint(
  {
    ipcRenderer,
    webFrame: { getZoomFactor: () => 1 },
    contextBridge: { exposeInMainWorld: (name, value) => Reflect.set(window, name, value) },
  },
  {} as NodeJS.ProcessEnv,
);
