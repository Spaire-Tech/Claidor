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
  // Twice the scripted pace: at 1x Simeon read as slow to think and answer (the founder, 28 September 2026).
  timeScale: 0.5,
  pushCoordinatorEvent: (family, payload) => server?.postEvent(family, payload),
  pushMainEvent: (event, payload) => emit(`sand-rpc:main:e:${event}`, {}, payload),
  reconnectCoordinator: () => openCoordinatorPort(),
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

// Buttons that lead somewhere the demo has nothing behind (the founder:
// "some button i dont want them to work, like clicking on bf - connect
// apps. + buttons, the computer etc."): the account menu, Connect apps, both
// New buttons, the composer's attach, and the agent's computer. Their presses
// stop here, before the window's own handlers (menus open on pointerdown).
const INERT_IN_DEMO = [
  ".sand-agents-sidebar__account button",
  ".sand-agents-sidebar__plugins",
  ".sand-agents-sidebar__new",
  ".sand-prompt-attach",
  ".sand-chat-header__computer",
].join(",");
// Nobody types in the demo ("i shouldnt be able to type or use microphone -
// the messages/answers are pre-recorded and are chosen"): the whole composer,
// its editor, attach, mic and send, takes no presses, keys, paste or focus.
const COMPOSER = ".sand-prompt-shell";
const isInert = (target: EventTarget | null) => target instanceof Element && target.closest(`${INERT_IN_DEMO},${COMPOSER}`) != null;
for (const type of ["pointerdown", "mousedown", "click", "dblclick", "keydown", "keypress", "beforeinput", "paste", "drop"] as const) {
  window.addEventListener(type, (event) => {
    if (!isInert(event.target)) return;
    const inComposer = event.target instanceof Element && event.target.closest(COMPOSER) != null;
    if (event instanceof KeyboardEvent && !inComposer && event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}
// The window also forwards keys typed anywhere into the composer ("type to
// start"), so plain typing is stopped at the page: there is nothing to type
// into in the demo. Shortcuts with ⌘ or Ctrl are left alone.
window.addEventListener("keydown", (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key.length === 1 || event.key === "Backspace" || event.key === "Delete" || event.key === "Enter") {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
window.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLElement && event.target.closest(COMPOSER) != null) event.target.blur();
}, true);
// The editor takes text below the events above, so the composer is also made
// `inert` (no focus, no input, nothing clickable) whenever the window draws one.
const quietComposers = () => {
  for (const shell of document.querySelectorAll(COMPOSER)) {
    if (!shell.hasAttribute("inert")) shell.setAttribute("inert", "");
    for (const editor of shell.querySelectorAll("[contenteditable=true]")) editor.setAttribute("contenteditable", "false");
  }
};
new MutationObserver(quietComposers).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["contenteditable"] });
const demoStyle = document.createElement("style");
// The window writes what an agent is doing ("Connecting to Linear") beside
// its typing mark but keeps it transparent; the demo shows it, so the viewer
// sees Simeon go through the tools before it answers. The computer button in
// the chat header is hidden: the demo has no computer to show (the founder,
// 28 September 2026: "remove the computer icon in the demo").
demoStyle.textContent = `${COMPOSER},${COMPOSER} *{cursor:default!important;caret-color:transparent!important}
.sand-activity-mark>span[aria-hidden],.sand-activity-mark__label{opacity:1!important}
.sand-chat-header__computer{display:none!important}`;
document.head.append(demoStyle);

installPrimaryPreloadEntrypoint(
  {
    ipcRenderer,
    webFrame: { getZoomFactor: () => 1 },
    contextBridge: { exposeInMainWorld: (name, value) => Reflect.set(window, name, value) },
  },
  {} as NodeJS.ProcessEnv,
);
