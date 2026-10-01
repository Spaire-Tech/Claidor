/**
 * The call banner's window (30 September 2026): a borderless, transparent,
 * always-on-top panel in the top-right corner of the display under the
 * pointer, like the banner macOS shows for a phone call. It never takes
 * focus from what the person is doing (`showInactive`, a non-activating
 * panel on macOS), follows them across Spaces and full-screen apps, and
 * grows or shrinks with the banner's moments.
 *
 * The window is ours and runs its own page (`dist/voice-call/index.html`)
 * with its own Content-Security-Policy: the main window's policy refuses the
 * https and wss connections ElevenLabs needs, and the pinned window is not
 * ours to loosen. The glass is drawn by the page (CSS), with the margins
 * below left transparent around it for its shadow: a native vibrancy view
 * is square-cornered in Electron and cannot follow the banner's 22 pt radius.
 */
import { appendFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ELECTRON_PRODUCTION_RESOURCE_LAYOUT } from "../production-ipc-contract.js";
import { buildSandMediaUrl } from "../media/media-protocol.js";
import { isVoiceCallPanelMethod, VOICE_CALL_EVENT_CHANNEL, VOICE_CALL_INVOKE_CHANNEL, type VoiceCallPanelEvent, type VoiceCallPanelMethod } from "../../shared/voice-call/panel-protocol.js";
import type { VoiceOption } from "./voice-call-api.js";
import type { VoiceCallWindowPort, VoicePreviewPort, VoiceStorePort } from "./voice-call-service.js";

export const BANNER_WIDTH = 330;
/** Transparent room around the banner for its drop shadow, in points. */
export const BANNER_MARGIN = Object.freeze({ top: 10, right: 28, bottom: 46, left: 28 });
/** Where the banner sits in the display's work area: 12 pt under the menu bar, 16 pt from the right edge. */
export const BANNER_INSET = Object.freeze({ top: 12, right: 16 });
/** The ringing banner's height (one row), before the page measures itself. */
export const BANNER_INITIAL_HEIGHT = 66;

export interface Rect { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** The window's bounds for a banner `bannerHeight` tall in `workArea`. */
export function bannerWindowBounds(workArea: Rect, bannerHeight: number): Rect {
  return {
    x: Math.round(workArea.x + workArea.width - BANNER_INSET.right - BANNER_WIDTH - BANNER_MARGIN.left),
    y: Math.round(workArea.y + BANNER_INSET.top - BANNER_MARGIN.top),
    width: BANNER_WIDTH + BANNER_MARGIN.left + BANNER_MARGIN.right,
    height: Math.round(bannerHeight) + BANNER_MARGIN.top + BANNER_MARGIN.bottom,
  };
}

/** Where the banner's page and preload are, beside the main process bundle. */
export function voiceCallResourcePaths(electronMainDir: string): { readonly preload: string; readonly page: string } {
  const appRoot = join(electronMainDir, "..", "..");
  return {
    preload: join(appRoot, ELECTRON_PRODUCTION_RESOURCE_LAYOUT.voiceCallPreload),
    page: join(appRoot, ELECTRON_PRODUCTION_RESOURCE_LAYOUT.voiceCallPage),
  };
}

/**
 * `SIMEON_VOICE_CALLS`: calls are off unless it is `1`/`on`/`true`/`yes`
 * (1 October 2026, the founder: "we probably need to hide it for now until we
 * figure it out. i'm trying to publish the app soon"). Off, the phone button,
 * the voice picker and the Agent › Call item are not shown. On, the server
 * decides the rest: it answers 503 while it has no ElevenLabs key.
 */
export function voiceCallsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env.SIMEON_VOICE_CALLS?.trim().toLowerCase();
  return value === "1" || value === "on" || value === "true" || value === "yes";
}

// --- the Electron window ---------------------------------------------------------

interface BrowserWindowLike {
  readonly webContents: {
    send(channel: string, payload: unknown): void;
    reload(): void;
    setWindowOpenHandler(handler: () => { action: "deny" }): void;
    on(event: "will-navigate", listener: (event: { preventDefault(): void }, url: string) => void): void;
    on(event: "render-process-gone", listener: (event: unknown, details: { reason: string }) => void): void;
    on(event: "console-message", listener: (...args: unknown[]) => void): void;
    isDestroyed(): boolean;
  };
  getBounds(): Rect;
  setBounds(bounds: Rect, animate?: boolean): void;
  setAlwaysOnTop(flag: boolean, level?: string): void;
  setVisibleOnAllWorkspaces(flag: boolean, options?: { visibleOnFullScreen?: boolean; skipTransformProcessType?: boolean }): void;
  showInactive(): void;
  moveTop(): void;
  close(): void;
  isDestroyed(): boolean;
  once(event: "ready-to-show", listener: () => void): void;
  on(event: "closed", listener: () => void): void;
  loadFile(path: string): Promise<unknown>;
}

interface ElectronVoiceModule {
  readonly BrowserWindow: new (options: Record<string, unknown>) => BrowserWindowLike;
  readonly screen: { getCursorScreenPoint(): { x: number; y: number }; getDisplayNearestPoint(point: { x: number; y: number }): { workArea: Rect } };
  readonly ipcMain: {
    handle(channel: string, listener: (event: { sender: unknown }, payload: unknown) => unknown): void;
    removeHandler(channel: string): void;
  };
}

export interface ElectronVoiceCallWindowOptions {
  readonly preloadPath: string;
  readonly pagePath: string;
  readonly handle: (method: VoiceCallPanelMethod, args: unknown) => Promise<unknown>;
  readonly onClosed: () => void;
  readonly log: (line: string) => void;
  readonly allowDevTools: boolean;
  readonly platform?: NodeJS.Platform;
  readonly electron?: ElectronVoiceModule;
}

export function createElectronVoiceCallWindow(options: ElectronVoiceCallWindowOptions): VoiceCallWindowPort & { dispose(): void } {
  const electron = options.electron ?? (require("electron") as ElectronVoiceModule);
  const isMac = (options.platform ?? process.platform) === "darwin";
  let window: BrowserWindowLike | null = null;
  let bannerHeight = BANNER_INITIAL_HEIGHT;
  const live = (): BrowserWindowLike | null => (window != null && !window.isDestroyed() ? window : null);

  electron.ipcMain.handle(VOICE_CALL_INVOKE_CHANNEL, async (event, payload) => {
    const current = live();
    if (current == null || event.sender !== current.webContents) throw new Error("Only the call banner may ask this.");
    const request = typeof payload === "object" && payload !== null ? payload as { method?: unknown; args?: unknown } : {};
    if (!isVoiceCallPanelMethod(request.method)) throw new Error("Unknown call banner request.");
    return await options.handle(request.method, request.args);
  });

  const open = (): void => {
    if (live() != null) return;
    const display = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint());
    bannerHeight = BANNER_INITIAL_HEIGHT;
    const bounds = bannerWindowBounds(display.workArea, bannerHeight);
    const created = new electron.BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      hasShadow: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      closable: true,
      skipTaskbar: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      title: "Simeon call",
      ...(isMac ? { type: "panel" } : {}),
      webPreferences: {
        preload: options.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: false,
        spellcheck: false,
        backgroundThrottling: false,
        // The two rings play before anyone has clicked in this window.
        autoplayPolicy: "no-user-gesture-required",
        devTools: options.allowDevTools,
      },
    });
    window = created;
    created.setAlwaysOnTop(true, "floating");
    // No `visibleOnFullScreen`: on macOS Electron makes that work by turning the
    // whole app into a background-only app for a moment, which hands focus to
    // whatever app was in front before (Terminal, Chrome) and scrambles the
    // main window. `skipTransformProcessType` keeps Simeon a normal app.
    created.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true });
    created.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    created.webContents.on("will-navigate", (event) => event.preventDefault());
    created.webContents.on("render-process-gone", (_event, details) => options.log(`banner page gone: ${details.reason}`));
    created.once("ready-to-show", () => { if (live() === created) created.showInactive(); });
    created.on("closed", () => { if (window === created) window = null; options.onClosed(); });
    void created.loadFile(options.pagePath).catch((error: unknown) => options.log(`banner page did not load: ${error instanceof Error ? error.message : String(error)}`));
  };

  return {
    open,
    focus() { const current = live(); if (current == null) { open(); return; } current.showInactive(); current.moveTop(); },
    reload() { const current = live(); if (current == null) open(); else current.webContents.reload(); },
    close() { live()?.close(); },
    isOpen: () => live() != null,
    send(event: VoiceCallPanelEvent) { const current = live(); if (current != null && !current.webContents.isDestroyed()) current.webContents.send(VOICE_CALL_EVENT_CHANNEL, event); },
    setContentHeight(height) {
      const current = live();
      if (current == null || height === bannerHeight) return;
      bannerHeight = height;
      const bounds = current.getBounds();
      current.setBounds({ ...bounds, height: height + BANNER_MARGIN.top + BANNER_MARGIN.bottom }, isMac);
    },
    dispose() { electron.ipcMain.removeHandler(VOICE_CALL_INVOKE_CHANNEL); live()?.close(); },
  };
}

// --- what the Mac keeps --------------------------------------------------------------

export const VOICE_CALL_STORE_FILE = "voice-calls.json";
export const VOICE_CALL_LOG_FILE = "voice-call.log";
export const VOICE_PREVIEW_DIR = "voice-previews";
const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

/** Each agent's chosen voice, kept on the Mac too, for a box whose host does not store `voiceId` yet. */
export function createFileVoiceStore(filePath: string): VoiceStorePort {
  const read = (): Record<string, string> => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
      const voices = typeof parsed === "object" && parsed !== null ? (parsed as { voices?: unknown }).voices : null;
      if (typeof voices !== "object" || voices === null) return {};
      return Object.fromEntries(Object.entries(voices).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
    } catch { return {}; }
  };
  return {
    get: (agentId) => read()[agentId] ?? null,
    set(agentId, voiceId) {
      const voices = read();
      if (voiceId == null) delete voices[agentId]; else voices[agentId] = voiceId;
      mkdirSync(dirname(filePath), { recursive: true });
      const temporary = `${filePath}.${process.pid}.tmp`;
      writeFileSync(temporary, `${JSON.stringify({ voices }, null, 2)}\n`);
      renameSync(temporary, filePath);
    },
  };
}

/** Voice samples, downloaded once into the app's folder and played through `sand-media:`, which the main window's policy allows. */
export function createVoicePreviewCache(directory: string, fetchImpl: typeof fetch = fetch): VoicePreviewPort {
  const pending = new Map<string, Promise<string | null>>();
  return {
    urlFor(voice: VoiceOption) {
      const url = voice.previewUrl;
      if (url == null || !/^[A-Za-z0-9]{1,64}$/.test(voice.id)) return Promise.resolve(null);
      const target = join(directory, `${voice.id}.mp3`);
      const existing = pending.get(voice.id);
      if (existing != null) return existing;
      const job = (async () => {
        try { readFileSync(target); return buildSandMediaUrl(target); } catch {}
        const response = await fetchImpl(url);
        if (!response.ok) throw new Error(`The voice sample answered ${response.status}.`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_PREVIEW_BYTES) throw new Error("The voice sample is empty or too large.");
        await mkdir(directory, { recursive: true });
        await writeFile(target, bytes);
        return buildSandMediaUrl(target);
      })();
      pending.set(voice.id, job);
      void job.catch(() => pending.delete(voice.id));
      return job;
    },
  };
}

/** One line per call event in `voice-call.log` (the app's folder), echoed to stderr as `[simeon] voice-call`. */
export function createVoiceCallLog(filePath: string, echo: (line: string) => void = (line) => process.stderr.write(`${line}\n`)): (line: string) => void {
  return (line) => {
    const stamped = `${new Date().toISOString()} ${line.replace(/\s+/g, " ").trim()}`;
    echo(`[simeon] voice-call ${line}`);
    try { mkdirSync(dirname(filePath), { recursive: true }); appendFileSync(filePath, `${stamped}\n`); } catch {}
  };
}
