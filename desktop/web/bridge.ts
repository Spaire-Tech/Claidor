/**
 * Simeon on the web: the page that stands in for Electron.
 *
 * It installs the app's own preload bridge (window.desktop,
 * window.coordinatorPort) over a fake ipcRenderer, the way the website's
 * demo does (../demo/bridge.ts), and answers from ./backend.ts: the account
 * from Simeon Labs' server, the agents from the person's cloud computer
 * through the API's proxy, the rest from this browser. The window itself is
 * the same pinned renderer the Mac app ships.
 */
import { installPrimaryPreloadEntrypoint } from "../source/electron-preload/preload.js";
import { createRendererPortServer } from "../source/node-agent-coordinator/renderer-port-server.js";
import { SimeonApi, resolveApiBase, sessionTokenStore } from "./api.js";
import { createWebBackend } from "./backend.js";

declare const __SIMEON_WEB_VERSION__: string;

type Listener = (event: any, payload?: any) => void;

const TRACE = new URLSearchParams(location.search).has("trace");
const trace = (...args: unknown[]) => { if (TRACE) console.log("[simeon web]", ...args); };

const listeners = new Map<string, Set<Listener>>();
const emit = (channel: string, event: any, payload?: any) => { for (const listener of listeners.get(channel) ?? []) listener(event, payload); };

const api = new SimeonApi({
  base: resolveApiBase(location),
  store: sessionTokenStore(),
  clientVersion: typeof __SIMEON_WEB_VERSION__ === "string" ? __SIMEON_WEB_VERSION__ : "0.1.0",
});

/** The web app's own login, told to come back here. */
function goSignIn(): void {
  const returnTo = `${location.pathname}${location.search}`;
  location.assign(`/login?return_to=${encodeURIComponent(returnTo)}`);
}

let server: ReturnType<typeof createRendererPortServer> | null = null;
const backend = createWebBackend({
  api,
  pushCoordinatorEvent: (family, payload) => server?.postEvent(family, payload),
  pushMainEvent: (event, payload) => emit(`sand-rpc:main:e:${event}`, {}, payload),
  goSignIn,
});
Reflect.set(window, "__simeonWeb", { api, backend });

let portWanted = false;
function openCoordinatorPort(): void {
  if (!backend.isSignedIn()) { portWanted = true; return; }
  portWanted = false;
  const channel = new MessageChannel();
  const serverPort = channel.port2;
  server?.handlePortClosed();
  server = createRendererPortServer(
    { post: (frame) => serverPort.postMessage(frame), close: () => serverPort.close() },
    {
      dispatchRequest: async (method, args, signal) => {
        const outcome = await backend.coordinator(method, args, signal);
        trace("coordinator", method, outcome.status);
        return outcome;
      },
      onServing: () => backend.onServing(),
    },
  );
  serverPort.addEventListener("message", (event) => server?.handleMessage(event.data));
  serverPort.start();
  backend.gateway.start();
  emit("sand:coordinator-port", { ports: [channel.port1] });
}

const ipcRenderer = {
  async invoke(channel: string, payload?: unknown): Promise<any> {
    if (channel === "sand:coordinator-port-request") { queueMicrotask(openCoordinatorPort); return undefined; }
    const main = /^sand-rpc:main:m:(.+)$/.exec(channel);
    if (main) {
      try {
        const value = await backend.main(main[1]!, payload);
        trace("main", main[1], value);
        return { ok: true, value };
      } catch (error) {
        trace("main failed", main[1], error);
        return { ok: false, failure: { code: "main/handler-failed", detail: error instanceof Error ? error.message : String(error) } };
      }
    }
    const value = await backend.ipc(channel, payload);
    trace("ipc", channel, value);
    return value;
  },
  sendSync(channel: string): any { return backend.sync(channel); },
  send(channel: string, payload?: unknown): void { trace("send", channel, payload); },
  on(channel: string, listener: Listener): void {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel)!.add(listener);
  },
  off(channel: string, listener: Listener): void { listeners.get(channel)?.delete(listener); },
};

// The window's own sign-in gate asks for the status first; when the tab
// holds no pair, trade the cookie before it asks, so a person who is signed
// in on the web app never sees the gate at all.
const ready = (async () => {
  if (api.isSignedIn()) return;
  try { await api.signInFromCookie(); } catch (error) { trace("sign-in from cookie failed", error); }
})();

// Signed in after the fact (a port requested before the pair arrived).
void ready.then(() => { if (portWanted) openCoordinatorPort(); });

installPrimaryPreloadEntrypoint(
  {
    ipcRenderer,
    webFrame: { getZoomFactor: () => 1 },
    contextBridge: { exposeInMainWorld: (name, value) => Reflect.set(window, name, value) },
  },
  {} as NodeJS.ProcessEnv,
);

// The main edge's first question is the account status; hold it until the
// cookie trade has settled, so the answer is the real one.
const desktop = Reflect.get(window, "desktop") as { cursorAccount?: { getStatus?: () => Promise<unknown> } } | undefined;
const getStatus = desktop?.cursorAccount?.getStatus;
if (desktop?.cursorAccount != null && typeof getStatus === "function") {
  desktop.cursorAccount.getStatus = async () => { await ready; return getStatus(); };
}

// The computer panel. The window draws the person's cloud computer in a
// `<webview>` (Electron's) pointed at the box's noVNC page through the
// API's proxy. A browser has no such element, so each one the window makes
// is swapped for an `<iframe>` with the same address and classes; the page
// loads from the API's origin and its stream goes back through the proxy's
// WebSocket path. What the Mac injects into that page (clipboard, presence)
// is not available here.
const WEBVIEW_ATTRIBUTES = ["src", "class", "style", "id", "title"];
function swapWebview(node: Element): void {
  const frame = document.createElement("iframe");
  for (const name of WEBVIEW_ATTRIBUTES) { const value = node.getAttribute(name); if (value != null) frame.setAttribute(name, value); }
  frame.setAttribute("allow", "clipboard-read; clipboard-write");
  frame.setAttribute("referrerpolicy", "no-referrer");
  node.replaceWith(frame);
}
new MutationObserver((records) => {
  for (const record of records) {
    for (const added of record.addedNodes) {
      if (!(added instanceof Element)) continue;
      if (added.tagName.toLowerCase() === "webview") swapWebview(added);
      for (const inner of added.querySelectorAll("webview")) swapWebview(inner);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

// Leaving the page closes the stream to the box cleanly.
window.addEventListener("pagehide", () => { backend.gateway.close(); server?.handlePortClosed(); });
