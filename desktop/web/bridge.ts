/**
 * Simeon on the web: the page that stands in for Electron.
 *
 * It installs the app's own preload bridge (window.desktop,
 * window.coordinatorPort) over a fake ipcRenderer, the way the website's
 * demo does (../demo/bridge.ts), and answers from ./backend.ts: the account
 * from Simeon Labs' server, the agents and the connected apps from the
 * person's cloud computer through the API's proxy, the rest from this
 * browser. The window itself is the same pinned renderer the Mac app ships.
 *
 * The same script serves `/app/connected.html`, where a connected app's
 * sign-in lands (through the server's hosted callback): there it hands the
 * box the code and tells the person to come back.
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
  pushIpcEvent: (channel, payload) => emit(channel, {}, payload),
  goSignIn,
});
Reflect.set(window, "__simeonWeb", { api, backend });

/** `/app/connected.html`: the end of a connected app's sign-in, not the window. */
const CONNECTED_PAGE = /\/connected\.html$/.test(location.pathname);

// The window's own sign-in gate asks for the status first; when the tab
// holds no pair, trade the cookie before it asks, so a person who is signed
// in on the web app never sees the gate at all. With no cookie either, the
// window goes to the web app's own sign-in page at once (4 October 2026):
// the gate the Mac app shows, "Sign in", then a browser, is the Mac's; on
// the web the sign-in page is the gate.
const ready = (async () => {
  if (api.isSignedIn()) return;
  try { await api.signInFromCookie(); } catch (error) { trace("sign-in from cookie failed", error); }
  if (!api.isSignedIn() && !CONNECTED_PAGE) goSignIn();
})();

if (CONNECTED_PAGE) {
  void finishConnectedAppSignIn();
} else {
  installWindow();
}

/**
 * A vendor sent the person back with a code for the sign-in the box
 * started; the box trades it for the credential, and the window in the
 * other tab hears of it from the box (`sand:mcp-auth-event`).
 */
async function finishConnectedAppSignIn(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const say = (title: string, body: string) => {
    const heading = document.getElementById("title"), text = document.getElementById("body");
    if (heading != null) heading.textContent = title;
    if (text != null) text.textContent = body;
  };
  const state = params.get("state") ?? "", code = params.get("code") ?? "";
  const refused = params.get("error");
  if (refused != null) { say("That didn't work", params.get("error_description") ?? "The app refused the sign-in. Go back to Simeon and try again."); return; }
  if (state.length === 0 || code.length === 0) { say("That didn't work", "The sign-in came back incomplete. Go back to Simeon and try again."); return; }
  await ready;
  if (!backend.isSignedIn()) { say("Sign in to Simeon first", "Open Simeon on the web, sign in, and connect the app again."); return; }
  try {
    await backend.completeMcpOAuth(state, code);
    say("Connected", "You can close this tab and go back to Simeon.");
    setTimeout(() => { try { window.close(); } catch { /* a tab the page did not open stays */ } }, 1500);
  } catch (error) {
    trace("sign-in completion failed", error);
    say("That didn't work", error instanceof Error && error.message.length > 0 ? error.message : "Simeon's computer could not finish the sign-in. Go back and try again.");
  } finally {
    backend.gateway.close();
  }
}

function installWindow(): void {
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

  installComputerPanel();

  // Leaving the page closes the stream to the box cleanly.
  window.addEventListener("pagehide", () => { backend.gateway.close(); server?.handlePortClosed(); });
}

/**
 * The computer panel. The window draws the person's cloud computer in a
 * `<webview>` (Electron's) pointed at the box's noVNC page through the
 * API's proxy, created through React, which asks the document for the
 * element by name. A browser has no such element, so the document answers
 * that name with an `<iframe>`: React then sets `src`, classes and styles on
 * it as it would on the webview, the page loads from the API's origin and
 * its stream goes back through the proxy's WebSocket path.
 *
 * The webview's own events and methods the window uses are stood in for.
 * `dom-ready` and `did-finish-load` fire on the frame's load, and so does
 * the message the Mac's preload inside the webview sends once the screen
 * is up (`ipc-message` on `sand:vnc-session`, phase `rfb_connect`), which
 * is what takes the window's spinner off the picture. The methods it would
 * call to inject into the page (what the Mac uses for clipboard and
 * presence) do nothing here.
 */
const WEBVIEW_METHODS = ["send", "executeJavaScript", "insertCSS", "openDevTools", "closeDevTools", "reload", "setZoomFactor", "setZoomLevel", "setAudioMuted", "focus"] as const;
export const VNC_SESSION_CHANNEL = "sand:vnc-session";

function installComputerPanel(): void {
  const nativeCreateElement = Document.prototype.createElement;
  Document.prototype.createElement = function createElement(this: Document, tagName: string, options?: ElementCreationOptions): HTMLElement {
    if (String(tagName).toLowerCase() !== "webview") return nativeCreateElement.call(this, tagName, options) as HTMLElement;
    const frame = nativeCreateElement.call(this, "iframe") as HTMLIFrameElement;
    frame.setAttribute("data-simeon-webview", "");
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    frame.setAttribute("referrerpolicy", "no-referrer");
    for (const name of WEBVIEW_METHODS) Reflect.set(frame, name, name === "focus" ? () => HTMLElement.prototype.focus.call(frame) : () => Promise.resolve(undefined));
    Reflect.set(frame, "getWebContentsId", () => 0);
    Reflect.set(frame, "isLoading", () => false);
    frame.addEventListener("load", () => {
      frame.dispatchEvent(new Event("dom-ready"));
      frame.dispatchEvent(new Event("did-finish-load"));
      frame.dispatchEvent(Object.assign(new Event("ipc-message"), { channel: VNC_SESSION_CHANNEL, args: [JSON.stringify({ phase: "rfb_connect" })] }));
    });
    return frame;
  } as typeof Document.prototype.createElement;
}
