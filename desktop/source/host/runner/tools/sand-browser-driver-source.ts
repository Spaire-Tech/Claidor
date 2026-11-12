import { createHash } from "node:crypto";

/**
 * The browser helper on the computer (one file, three ways to run it):
 *
 *   node driver.mjs <request>            one step, in this process: start
 *                                        Chrome if needed, connect, act,
 *                                        disconnect (the way every step ran
 *                                        until 12 November 2026);
 *   node driver.mjs --client <request>   the host's way since then: hand the
 *                                        step to the display's helper that
 *                                        stays running (started here when
 *                                        none is), else run it as above;
 *   node driver.mjs --serve <display>    that helper: it keeps its
 *                                        connection to the display's Chrome,
 *                                        serves steps one at a time over
 *                                        /tmp/.sand-browser/daemon-*.sock,
 *                                        closes Chrome after it has gone
 *                                        unused (nobody watching, no
 *                                        hand-off) and then ends.
 *
 * `<request>` is the step as base64 JSON; the answer is one line after
 * SAND_BROWSER_RESULT_MARKER. The file is named by its content, so a new
 * engine never runs an older copy, nor talks to an older one's helper.
 */
export const SAND_BROWSER_DRIVER_VERSION = 3;
export const SAND_BROWSER_DRIVER_BOX_DIR = "/tmp/.sand-browser";
export const SAND_BROWSER_RESULT_MARKER = "__SAND_BROWSER_RESULT__";
export const SAND_BROWSER_DRIVER_SOURCE = `
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import net from "node:net";
import { fileURLToPath } from "node:url";

const RESULT_MARKER = "__SAND_BROWSER_RESULT__";
const STATE_DIR = "/tmp/.sand-browser";
const ACTION_TIMEOUT_MS = 10000;
const NAVIGATE_TIMEOUT_MS = 25000;
// How long a browser helper that stays running waits for a step before it
// ends itself, and how long Chrome may go unused before it is closed, when
// the host says nothing (SIMEON_BROWSER_IDLE_CLOSE_MINUTES on the host).
const DEFAULT_IDLE_CLOSE_MS = 10 * 60 * 1000;
// A step the helper has not finished by then is answered with an error and
// its connection to Chrome dropped, as the one-step process used to end.
const STEP_LIMIT_MS = 90000;
// The first try of a click: long enough for an element that is still
// settling; a popup over it is looked for only once a try says something
// intercepts the click.
const FIRST_CLICK_TRY_MS = 1500;
// Frames read after the page: how many, how many elements each, how long
// all of them together may take, and the least size of a frame worth reading.
const MAX_FRAMES = 5;
const FRAME_MAX_NODES = 120;
const FRAMES_BUDGET_MS = 1500;
const MIN_FRAME_SIDE = 20;
// Tabs reopened after an idle close.
const MAX_RESTORED_TABS = 8;
// A hand-off mark older than this is one its host forgot to take back (it
// started again during the hand-off): it no longer keeps Chrome open.
const HOLD_MAX_MS = 12 * 60 * 60 * 1000;
// A checkout card's mark keeps Chrome open at most this long: a card nobody
// answers, or a mark its host couldn't take back, no longer holds it after that.
const PURCHASE_HOLD_MAX_MS = 2 * 60 * 60 * 1000;
// Claude refuses a picture over 2000 pixels on a side once a request holds
// more than twenty (provider-session.ts, CLAUDE_MANY_IMAGES_MAX_SIDE), and
// a full-page screenshot of a long form is several thousand pixels tall
// (18 October 2026: Sage's job application). A full-page shot keeps at most
// this much, from where the page is scrolled.
const FULL_PAGE_MAX_SIDE = 2000;
// Files a page may be given come from the workspace only, where the
// person's attachments land (/workspace/uploads): never the computer's own
// settings and sign-ins.
const UPLOAD_ROOT = "/workspace";
const FILE_CHOOSER_TIMEOUT_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// What the idle close reads on the computer, per display:
// - used-N: touched by every browser step (either way of running it);
// - /tmp/sand-monitor-busy-N: touched by every Computer action (the host,
//   box-windows.ts touchSandMonitorBusyLease);
// - hold-N: there while the computer is handed to the person (request_box_help
//   or Take control; box-windows.ts setSandBrowserHold);
// - purchase-hold-<agent>-<entry>.N: there while a checkout card waits for
//   the person, so its checkout tab is still open when they answer
//   (RequestPurchase; taken back when the purchase ends, purchase-cards.ts);
// - closed-N.json: the tabs and session cookies of a Chrome closed for being
//   unused, read back when it opens again.
function usedPath(display) {
  return STATE_DIR + "/used-" + String(display);
}
function holdPath(display) {
  return STATE_DIR + "/hold-" + String(display);
}
function closedPath(display) {
  return STATE_DIR + "/closed-" + String(display) + ".json";
}
function leasePath(display) {
  return "/tmp/sand-monitor-busy-" + String(display);
}

/**
 * What keeps the display's Chrome open for the person, if anything: a
 * hand-off ("handoff") or a checkout card waiting for them ("purchase"). A
 * purchase mark past its two hours is removed.
 */
function heldBy(display, nowMs) {
  const at = mtimeMs(holdPath(display));
  if (at > 0 && nowMs - at < HOLD_MAX_MS) return "handoff";
  let names = [];
  try {
    names = readdirSync(STATE_DIR);
  } catch {}
  const suffix = "." + String(display);
  let purchase = false;
  for (const name of names) {
    if (!name.startsWith("purchase-hold-") || !name.endsWith(suffix)) continue;
    const marked = mtimeMs(STATE_DIR + "/" + name);
    if (marked > 0 && nowMs - marked < PURCHASE_HOLD_MAX_MS) {
      purchase = true;
    } else {
      try {
        unlinkSync(STATE_DIR + "/" + name);
      } catch {}
    }
  }
  return purchase ? "purchase" : undefined;
}

function noteUsed(display) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const now = new Date();
    try {
      utimesSync(usedPath(display), now, now);
    } catch {
      writeFileSync(usedPath(display), "");
    }
  } catch {}
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return 0;
  }
}

// The display's screen is being watched (or driven, Take control) when its
// VNC server has a viewer: x11vnc on 5900 for :1 and 5900+N for a fork
// window (simeon-desktop, start-window), with an established connection.
// Unreadable socket tables count as watched: never close what can't be seen.
function screenWatched(display) {
  const port = display <= 1 ? 5900 : 5900 + display;
  const suffix = ":" + port.toString(16).toUpperCase().padStart(4, "0");
  let read = false;
  for (const file of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    read = true;
    for (const line of text.split("\\n").slice(1)) {
      const cols = line.trim().split(/\\s+/);
      if (cols.length > 3 && cols[3] === "01" && cols[1].endsWith(suffix)) return true;
    }
  }
  return !read;
}

/**
 * Whether an idle Chrome is closed now. "close" only when closing is on,
 * no step runs, the computer is not handed to the person, nobody watches
 * the screen and nothing has used the browser or the screen for idleMs.
 */
function idleCloseVerdict(input) {
  if (!(input.idleMs > 0)) return "never";
  if (input.busy === true) return "busy";
  if (input.nowMs - input.lastUsedMs < input.idleMs) return "recent";
  if (input.held === true) return "held";
  if (input.watched === true) return "watched";
  return "close";
}

function statePath(display) {
  return STATE_DIR + "/views-" + String(display) + ".json";
}

function loadState(display) {
  try {
    const parsed = JSON.parse(readFileSync(statePath(display), "utf8"));
    if (parsed && typeof parsed === "object") {
      return {
        views: parsed.views && typeof parsed.views === "object" ? parsed.views : {},
        urls: parsed.urls && typeof parsed.urls === "object" ? parsed.urls : {},
        lastViewId: typeof parsed.lastViewId === "string" ? parsed.lastViewId : undefined,
      };
    }
  } catch {}
  return { views: {}, urls: {}, lastViewId: undefined };
}

function saveState(display, state) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const current = loadState(display);
    const views = { ...current.views, ...state.views };
    const urls = { ...current.urls, ...state.urls };
    for (const removed of state.deletedViews ?? []) {
      delete views[removed];
      delete urls[removed];
    }
    let lastViewId = state.lastViewId ?? current.lastViewId;
    if (lastViewId !== undefined && (state.deletedViews ?? []).includes(lastViewId)) {
      lastViewId = undefined;
    }
    const merged = { views, urls, lastViewId };
    const tmp = statePath(display) + "." + String(process.pid) + ".tmp";
    writeFileSync(tmp, JSON.stringify(merged));
    renameSync(tmp, statePath(display));
  } catch {}
}

// Serializes cross-process claims on a live tab: two concurrent driver calls
// (same-step parallel browser tools) re-adopting by URL could otherwise pick
// the SAME tab for different views before either saves. The winner writes its
// claim to the state file INSIDE the lock, so the loser's fresh read inside
// its own turn sees the tab as taken. A lock older than 5s is treated as
// leaked by a crashed driver and broken. Failure to lock degrades to the
// unlocked behavior instead of failing the op.
async function withViewClaimLock(display, fn) {
  const lockPath = statePath(display) + ".lock";
  const deadline = Date.now() + 3000;
  let locked = false;
  while (!locked && Date.now() < deadline) {
    try {
      mkdirSync(STATE_DIR, { recursive: true });
      writeFileSync(lockPath, String(process.pid), { flag: "wx" });
      locked = true;
    } catch {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > 5000) unlinkSync(lockPath);
      } catch {}
      await sleep(50);
    }
  }
  try {
    return await fn();
  } finally {
    if (locked) {
      try {
        unlinkSync(lockPath);
      } catch {}
    }
  }
}

async function cdpAlive(port) {
  try {
    const res = await fetch("http://127.0.0.1:" + String(port) + "/json/version", {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureChrome(port, display) {
  if (await cdpAlive(port)) return;
  await new Promise((resolve) => {
    const child = spawn("box-chrome", ["--new-window"], {
      env: { ...process.env, DISPLAY: ":" + String(display) },
      stdio: "ignore",
    });
    child.on("error", () => resolve(undefined));
    child.on("exit", () => resolve(undefined));
    setTimeout(() => resolve(undefined), 45000);
  });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await cdpAlive(port)) return;
    await sleep(500);
  }
  throw new Error(
    "The browser on this computer did not start (port " + String(port) + ")."
  );
}

// playwright-core from wherever the box image put it. The driver runs from
// /tmp/.sand-browser, where a bare import only finds a node_modules above
// /tmp, and an ES import ignores NODE_PATH, which the cloud computer sets to
// /home/box/deps; the require fallbacks read it, and the usual global
// folders (Simeon, 2 October 2026).
let PLAYWRIGHT_ROOT = "";

// \`npm root -g\` starts npm, a quarter to half a second, and every browser
// step used to run it before trying anything, though the folders above
// usually answer (15 October 2026). It now runs only when they don't, once
// per step; the order of the places tried is unchanged.
let NPM_GLOBAL_ROOT;
async function npmGlobalRoot() {
  if (NPM_GLOBAL_ROOT === undefined) {
    NPM_GLOBAL_ROOT = "";
    try {
      const { execSync } = await import("node:child_process");
      NPM_GLOBAL_ROOT = execSync("npm root -g", { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {}
  }
  return NPM_GLOBAL_ROOT;
}

async function requirePlaywright(specifier) {
  if (specifier === "playwright-core") {
    try {
      return await import("playwright-core");
    } catch {}
  }
  const { createRequire } = await import("node:module");
  const roots = [import.meta.url];
  for (const folder of [
    process.env.SAND_PLAYWRIGHT_NODE_MODULES,
    ...String(process.env.NODE_PATH ?? "").split(":"),
    "/workspace/node_modules",
    "/home/box/node_modules",
    "/usr/local/lib/node_modules",
    "/usr/lib/node_modules",
    "/opt/node_modules",
  ]) {
    if (folder) roots.push(folder.replace(/[/]+$/, "") + "/noop.js");
  }
  for (const root of roots) {
    try {
      return createRequire(root)(specifier);
    } catch {}
  }
  const globalRoot = await npmGlobalRoot();
  if (globalRoot) {
    try {
      return createRequire(globalRoot + "/noop.js")(specifier);
    } catch {}
  }
  // Simeon's own copy, written beside this helper by the host, after the
  // image's: the host passes its folder in the request.
  if (PLAYWRIGHT_ROOT) {
    try {
      const bundled = createRequire(PLAYWRIGHT_ROOT + "/lib/noop.js")("./playwright-core.cjs");
      return specifier === "playwright-core" ? bundled.core : bundled.utilsBundle;
    } catch {}
  }
  const unready = new Error("The browser on this computer isn't ready yet: it could not be started. Try again in a minute; if it keeps happening, report that the browser could not start.");
  // The host writes its own copy and asks again (sand-browser-tools.ts).
  unready.code = "SAND_NO_PLAYWRIGHT";
  throw unready;
}

// A minimal raw CDP socket for the pre-connect probe below. Uses the box
// image's playwright-core bundled ws client (the driver already depends on
// playwright-core, and the box's plain node has no global WebSocket). Every
// send resolves with the response message, or undefined on timeout/failure \u2014
// never rejects and never hangs.
async function openCdpSocket(wsUrl) {
  let WS;
  try {
    WS = (await requirePlaywright("playwright-core/lib/utilsBundle")).ws;
  } catch {
    return undefined;
  }
  let ws;
  try {
    ws = new WS(wsUrl);
  } catch {
    return undefined;
  }
  const opened = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 3000);
    ws.on("open", () => {
      clearTimeout(timer);
      resolve(true);
    });
    ws.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
  if (!opened) {
    try {
      ws.close();
    } catch {}
    return undefined;
  }
  let nextId = 1;
  const pending = new Map();
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params, sessionId, timeoutMs) =>
    new Promise((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve(undefined);
      }, timeoutMs);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      const payload = { id, method, params: params !== undefined ? params : {} };
      if (sessionId !== undefined) payload.sessionId = sessionId;
      try {
        ws.send(JSON.stringify(payload));
      } catch {
        clearTimeout(timer);
        pending.delete(id);
        resolve(undefined);
      }
    });
  return {
    send,
    close: () => {
      try {
        ws.close();
      } catch {}
    },
  };
}

// A discarded tab (Memory Saver, or any lifecycle discard) keeps a page target
// in the target list but has no renderer, so attaching to it never completes.
// playwright's connectOverCDP auto-attaches to EVERY page, so one discarded
// tab hangs the whole connect and every driver call fails until something
// revives that tab. Before connecting, probe each page target over a raw CDP
// socket and activate the unresponsive ones \u2014 Chrome reloads a discarded tab
// when it becomes active \u2014 then hand focus back to the tab that was visible.
// A live-but-busy page that misses the probe deadline is also activated; that
// is harmless (activation does not reload a live tab, and focus is restored).
// Best-effort throughout: on any failure the plain connect proceeds and
// reports its own error.
async function reviveDiscardedTabs(port) {
  let socket;
  try {
    const base = "http://127.0.0.1:" + String(port);
    const listRes = await fetch(base + "/json/list", { signal: AbortSignal.timeout(1500) });
    if (!listRes.ok) return;
    const targets = (await listRes.json()).filter((t) => t.type === "page");
    if (targets.length === 0) return;
    const versionRes = await fetch(base + "/json/version", { signal: AbortSignal.timeout(1500) });
    if (!versionRes.ok) return;
    const wsUrl = (await versionRes.json()).webSocketDebuggerUrl;
    if (typeof wsUrl !== "string" || wsUrl.length === 0) return;
    socket = await openCdpSocket(wsUrl);
    if (socket === undefined) return;
    // Resolves to the page's visibilityState, or undefined when the page never
    // answers (a discarded tab's renderer is gone, so evaluate never returns).
    const probe = async (targetId) => {
      const attached = await socket.send(
        "Target.attachToTarget",
        { targetId, flatten: true },
        undefined,
        2000
      );
      const sessionId =
        attached !== undefined && attached.result !== undefined
          ? attached.result.sessionId
          : undefined;
      if (sessionId === undefined) return undefined;
      const evaluated = await socket.send(
        "Runtime.evaluate",
        { expression: "document.visibilityState", returnByValue: true },
        sessionId,
        1500
      );
      socket.send("Target.detachFromTarget", { sessionId }, undefined, 1000);
      if (evaluated === undefined || evaluated.result === undefined) return undefined;
      return evaluated.result.result !== undefined ? evaluated.result.result.value : undefined;
    };
    const states = await Promise.all(targets.map((t) => probe(t.id)));
    const hung = targets.filter((t, i) => states[i] === undefined);
    if (hung.length === 0) return;
    const visible = targets.find((t, i) => states[i] === "visible");
    // Revive every hung tab under ONE overall deadline, never a per-tab
    // budget: a long-lived box can hold many discarded tabs at once, and
    // sequential per-tab waits would eat the driver's 90s watchdog before the
    // connect even starts. The activation ack is milliseconds and a discarded
    // tab keeps reloading after focus moves on, so each round activates all
    // stragglers in parallel, then probes them in parallel, until every tab
    // answers or the deadline passes.
    const deadline = Date.now() + 20000;
    let remaining = hung.map((t) => t.id);
    while (remaining.length > 0 && Date.now() < deadline) {
      await Promise.all(
        remaining.map((id) =>
          socket.send("Target.activateTarget", { targetId: id }, undefined, 2000)
        )
      );
      const results = await Promise.all(remaining.map((id) => probe(id)));
      remaining = remaining.filter((_, i) => results[i] === undefined);
      if (remaining.length > 0) await sleep(300);
    }
    if (visible !== undefined) {
      await socket.send("Target.activateTarget", { targetId: visible.id }, undefined, 2000);
    }
  } catch {
  } finally {
    if (socket !== undefined) socket.close();
  }
}

// A tab's DevTools id never changes, so it is asked once per tab: the
// helper that stays running asks only of tabs it has not seen.
const TARGET_IDS = new WeakMap();

async function targetIdOf(context, page) {
  const known = TARGET_IDS.get(page);
  if (known !== undefined) return known;
  const session = await context.newCDPSession(page);
  try {
    const info = await session.send("Target.getTargetInfo");
    TARGET_IDS.set(page, info.targetInfo.targetId);
    return info.targetInfo.targetId;
  } finally {
    await session.detach().catch(() => {});
  }
}

// Set by the helper that stays running: its connection outlives a tab Chrome
// put to sleep, so a step whose tab is gone wakes the sleeping tabs first.
let REVIVE_ON_MISS = false;

async function pagesByTargetId(context) {
  const byTarget = new Map();
  for (const p of context.pages().filter((page) => !page.isClosed())) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        byTarget.set(await targetIdOf(context, p), p);
        break;
      } catch {
        await sleep(150);
      }
    }
  }
  return byTarget;
}

async function resolvePage(request, context, state) {
  const explicit = typeof request.viewId === "string" && request.viewId.length > 0;
  const viewId = explicit ? request.viewId : state.lastViewId ?? "default";
  const mappedTarget = state.views[viewId];
  let byTarget = await pagesByTargetId(context);
  let page = mappedTarget !== undefined ? byTarget.get(mappedTarget) : undefined;
  if (page === undefined && mappedTarget !== undefined && REVIVE_ON_MISS) {
    await reviveDiscardedTabs(request.cdpPort);
    byTarget = await pagesByTargetId(context);
    page = byTarget.get(mappedTarget);
  }
  if (page === undefined && mappedTarget !== undefined) {
    const deadline = Date.now() + 5000;
    while (page === undefined && Date.now() < deadline) {
      await sleep(400);
      byTarget = await pagesByTargetId(context);
      page = byTarget.get(mappedTarget);
    }
  }
  // Discarding a tab destroys its target and revives it under a NEW targetId
  // with the same URL, so a mapped target that never comes back usually means
  // the view's tab was discarded (Memory Saver), not closed. Re-adopt the tab
  // by its last recorded URL instead of falling through to a blank new tab \u2014
  // only a tab no other view claims, so two same-URL views cannot collapse.
  if (page === undefined && mappedTarget !== undefined) {
    const lastUrl = state.urls !== undefined ? state.urls[viewId] : undefined;
    if (typeof lastUrl === "string" && lastUrl.length > 0 && lastUrl !== "about:blank") {
      await withViewClaimLock(request.display, async () => {
        // Re-read the persisted views inside the lock: a concurrent driver
        // process may have claimed a candidate after this one loaded state.
        const persisted = loadState(request.display);
        const claimed = new Set([
          ...Object.values(state.views),
          ...Object.values(persisted.views),
        ]);
        for (const [candidateId, candidate] of byTarget) {
          if (candidate.url() === lastUrl && !claimed.has(candidateId)) {
            page = candidate;
            state.views[viewId] = candidateId;
            saveState(request.display, { views: { [viewId]: candidateId } });
            break;
          }
        }
      });
    }
  }
  if (page === undefined && !explicit && byTarget.size > 0) {
    const pages = [...byTarget.values()];
    page = pages[pages.length - 1];
  }
  if (page === undefined) {
    page = await context.newPage();
  }
  state.views[viewId] = await targetIdOf(context, page);
  state.lastViewId = viewId;
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  return { page, viewId };
}

async function refHandle(page, ref) {
  const stale = () => new Error(
    "Unknown or stale ref " + JSON.stringify(ref) + ". Take a fresh browser_snapshot and use a ref from it."
  );
  // A frame's ref (f2e3) lives in that frame's own document, written by the
  // same snapshot as the page's (its generation).
  if (typeof ref === "string" && /^f\\d+e\\d+$/.test(ref)) {
    const generation = await page.evaluate(() => globalThis.__sandRefsGeneration).catch(() => undefined);
    if (generation === undefined) throw stale();
    for (const frame of page.frames()) {
      if (frame === page.mainFrame() || frame.isDetached()) continue;
      const handle = await withinFrameTime(frame.evaluateHandle(([r, g]) => {
        const map = globalThis.__sandRefs;
        return globalThis.__sandRefsGeneration === g && map instanceof Map ? map.get(r) : undefined;
      }, [ref, generation]).catch(() => undefined));
      const element = handle === undefined ? null : handle.asElement();
      if (element !== null) return element;
    }
    throw stale();
  }
  // A page's ref names one element for as long as the page is open
  // (SNAPSHOT_FN); one whose element has left the page is stale.
  const handle = await page.evaluateHandle((r) => {
    const map = globalThis.__sandRefs;
    const found = map instanceof Map ? map.get(r) : undefined;
    return found !== undefined && found.isConnected ? found : undefined;
  }, ref);
  const element = handle.asElement();
  if (element === null) throw stale();
  return element;
}

// A frame still loading can keep a question waiting; none holds a step up for long.
function withinFrameTime(promise, ms = 2000) {
  return Promise.race([promise, sleep(ms).then(() => undefined)]);
}

// Frames the page reader leaves out (18 October 2026). A bot check is the
// person's to answer, never the helper's; card fields are typed by the
// checkout card, never by a helper.
const SKIPPED_FRAME_HOSTS = /(^|\\.)(challenges\\.cloudflare\\.com|hcaptcha\\.com|recaptcha\\.net|arkoselabs\\.com|funcaptcha\\.com|js\\.stripe\\.com|stripe\\.network|checkout\\.pci\\.shopifyinc\\.com|shopifycs\\.com|braintreegateway\\.com|adyen\\.com|paypal\\.com)$/;

function readableFrameHost(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    if (SKIPPED_FRAME_HOSTS.test(parsed.hostname) || parsed.pathname.startsWith("/recaptcha/")) return undefined;
    return parsed.hostname;
  } catch {
    return undefined;
  }
}

const SNAPSHOT_FN = (opts) => {
  const doc = globalThis.document;
  const win = globalThis.window;
  const root = opts.selector ? doc.querySelector(opts.selector) : doc.body;
  if (!root) return { lines: ["(no matching element for selector)"], refCount: 0 };
  // An element keeps its number for as long as its page is open, so a ref
  // from an earlier snapshot (or from the one a click returned) still names
  // the same element, and a new element takes the next number (12 November
  // 2026: the snapshot a click returns would otherwise renumber the page
  // under refs the agent still holds). The page's refs stay valid while
  // their element is on it (opts.keepRefs); a frame's are those of its
  // latest reading.
  const numbers = globalThis.__sandRefNumbers instanceof WeakMap ? globalThis.__sandRefNumbers : new WeakMap();
  globalThis.__sandRefNumbers = numbers;
  let lastNumber = typeof globalThis.__sandRefLastNumber === "number" ? globalThis.__sandRefLastNumber : 0;
  const refs = opts.keepRefs === true && globalThis.__sandRefs instanceof Map ? globalThis.__sandRefs : new Map();
  globalThis.__sandRefs = refs;
  globalThis.__sandRefsGeneration = opts.generation;
  const prefix = typeof opts.prefix === "string" ? opts.prefix : "e";
  let refCounter = 0;
  const lines = [];
  const maxNodes = typeof opts.maxNodes === "number" ? opts.maxNodes : 400;
  let nodeCount = 0;
  const interactiveMatcher =
    "a[href], button, input, select, textarea, summary, " +
    '[role="button"], [role="link"], [role="checkbox"], [role="radio"], ' +
    '[role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="combobox"], ' +
    '[role="option"], [role="switch"], [role="searchbox"], [role="textbox"], ' +
    '[role="slider"], [contenteditable="true"], [onclick]';
  const isVisible = (el) => {
    if (el.getAttribute("aria-hidden") === "true") return false;
    const style = win.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const trim = (text, max) => {
    const t = (text ?? "").replace(/\\s+/g, " ").trim();
    return t.length > max ? t.slice(0, max) + "\u2026" : t;
  };
  const nameOf = (el) => {
    const aria = el.getAttribute("aria-label");
    if (aria) return trim(aria, 80);
    if (el.labels && el.labels.length > 0) return trim(el.labels[0].innerText, 80);
    const placeholder = el.getAttribute("placeholder");
    if (placeholder) return trim(placeholder, 80);
    const alt = el.getAttribute("alt");
    if (alt) return trim(alt, 80);
    const title = el.getAttribute("title");
    if (title) return trim(title, 80);
    return trim(el.innerText ?? el.value ?? "", 80);
  };
  const roleOf = (el) => {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "select") return "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "button" || type === "submit" || type === "reset") return "button";
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      return "textbox";
    }
    if (/^h[1-6]$/.test(tag)) return "heading";
    return tag;
  };
  const describe = (el, depth) => {
    const role = roleOf(el);
    const name = nameOf(el);
    let line = "  ".repeat(Math.min(depth, 6)) + "- " + role;
    if (name) line += " " + JSON.stringify(name);
    if (el.matches(interactiveMatcher) && !el.disabled) {
      let number = numbers.get(el);
      if (number === undefined) {
        lastNumber += 1;
        number = lastNumber;
        numbers.set(el, number);
      }
      refCounter += 1;
      const ref = prefix + String(number);
      refs.set(ref, el);
      line += " [ref=" + ref + "]";
    }
    if (el.disabled) line += " disabled";
    if (el.checked === true) line += " checked";
    const tag = el.tagName.toLowerCase();
    if ((tag === "input" || tag === "textarea") && typeof el.value === "string" && el.value.length > 0) {
      const inputType = (el.getAttribute("type") ?? "").toLowerCase();
      const isSecret = inputType === "password" || el.getAttribute("autocomplete") === "current-password" || el.getAttribute("autocomplete") === "new-password";
      line += " value=" + (isSecret ? '"<redacted>"' : JSON.stringify(trim(el.value, 40)));
    }
    if (tag === "a") {
      const href = el.getAttribute("href");
      if (href && !href.startsWith("javascript:")) line += " href=" + JSON.stringify(trim(href, 80));
    }
    return line;
  };
  const walk = (el, depth) => {
    if (nodeCount >= maxNodes || depth > (opts.maxDepth ?? 20)) return;
    if (!(el instanceof win.HTMLElement)) return;
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return;
    // An element with display: contents draws no box of its own and its
    // children are laid out in its place, so it has no size and read as
    // hidden. Shopify's checkout wraps its whole form in one: on 18 October
    // 2026 the reader saw 6 of an Altex checkout's 30 fields and the agent
    // could not fill it.
    // What a custom element draws sits in its shadow root, which the walk
    // reads like children (open roots only; a closed one can't be read).
    // Shopify's store sign-in puts "Continue with Shop" in <shop-login>'s
    // (18 October 2026): the helper never saw it, nor the way past it.
    const shadow = el.shadowRoot;
    const walkInside = (at) => {
      if (shadow) for (const child of shadow.children) walk(child, at);
      for (const child of el.children) walk(child, at);
    };
    if (el.getAttribute("aria-hidden") !== "true" && win.getComputedStyle(el).display === "contents") {
      walkInside(depth);
      return;
    }
    if (shadow && el.getAttribute("aria-hidden") !== "true" && !isVisible(el)) {
      // A host's own box can be empty while what it draws is not.
      const style = win.getComputedStyle(el);
      if (style.display !== "none" && style.visibility !== "hidden") walkInside(depth);
      return;
    }
    if (!isVisible(el)) return;
    const isInteractive = el.matches(interactiveMatcher);
    const isHeading = /^h[1-6]$/.test(tag);
    const isTextual = !opts.interactive && (tag === "p" || tag === "li" || tag === "label" || tag === "td" || tag === "th");
    let childDepth = depth;
    if (isInteractive || isHeading || (isTextual && trim(el.innerText, 10).length > 0 && el.querySelector(interactiveMatcher) === null)) {
      nodeCount += 1;
      lines.push(describe(el, depth));
      childDepth = depth + 1;
      if (isInteractive || isTextual) return;
    }
    walkInside(childDepth);
  };
  walk(root, 0);
  globalThis.__sandRefLastNumber = lastNumber;
  if (nodeCount >= maxNodes) lines.push("(snapshot truncated at " + String(maxNodes) + " elements)");
  return { lines, refCount: refCounter };
};

function clickOptionsFor(args) {
  const options = { timeout: ACTION_TIMEOUT_MS };
  if (args.button === "right" || args.button === "middle") options.button = args.button;
  if (Array.isArray(args.modifiers) && args.modifiers.length > 0) options.modifiers = args.modifiers;
  if (typeof args.holdDurationMs === "number" && args.holdDurationMs > 0) options.delay = Math.min(args.holdDurationMs, 5000);
  if (args.doubleClick === true) options.clickCount = 2;
  return options;
}

// A page's "Upload" button opens Chrome's own file window, which no browser
// tool can work: on 18 October 2026 one stayed open on the person's screen
// after Sage's helper clicked a résumé field. While a step runs, every tab's
// file windows are caught before they open (Playwright's filechooser
// interception); upload_file fills one, any other is closed unopened and
// the step says so.
function catchFileChoosers(context) {
  const caught = { count: 0, release: () => {} };
  const onChooser = () => { caught.count += 1; };
  const listening = [];
  for (const page of context.pages()) {
    if (!page.isClosed()) {
      page.on("filechooser", onChooser);
      listening.push(page);
    }
  }
  // Between steps a page's file window is the person's own again (the
  // helper that stays running keeps its connection).
  caught.release = () => {
    for (const page of listening) page.off("filechooser", onChooser);
  };
  return caught;
}

// A store's popup (an email sign-up, a "10% off" offer) can open over the
// element a step aims at. On 18 October 2026 Deskery's covered "Add to cart"
// as Rhea's helper clicked it: the click waited ten seconds and failed with
// Playwright's call log, and the helper went no further. Before a click the
// element's centre is now hit-tested; when something else is on top, the
// layer it belongs to is searched for its own way out ("No, thanks", a
// close ×) and that is clicked, else Escape is pressed. Only a dismissal is
// ever clicked: nothing that accepts, subscribes or pays.
const COVER_FN = (el) => {
  const doc = el.ownerDocument;
  const win = doc.defaultView;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  if (x < 0 || y < 0 || x > win.innerWidth || y > win.innerHeight) return null;
  const top = doc.elementFromPoint(x, y);
  if (top === null || top === el || el.contains(top) || top.contains(el)) return null;
  const words = (node) => (node.getAttribute("aria-label") || node.getAttribute("title") || node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
  const shown = (node) => {
    const box = node.getBoundingClientRect();
    const style = win.getComputedStyle(node);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  // The layer on top: the outermost dialog or fixed box around what was hit,
  // and around the middle of the window, where a centred popup sits.
  const layerOf = (hit) => {
    let layer = null;
    for (let at = hit; at !== null && at !== doc.body && at !== doc.documentElement; at = at.parentElement) {
      if (at.getAttribute("role") === "dialog" || at.getAttribute("aria-modal") === "true" || win.getComputedStyle(at).position === "fixed") layer = at;
    }
    return layer;
  };
  const layers = [layerOf(top), layerOf(doc.elementFromPoint(win.innerWidth / 2, win.innerHeight / 2))].filter((one, index, all) => one !== null && !one.contains(el) && all.indexOf(one) === index);
  const SAYS_NO = /^(no,? ?thanks?|no thank you|no,? i('|’)?m good|not now|maybe later|close|dismiss|skip|x|×|✕|✖)[.!]?$/i;
  const SAYS_CLOSE = /^(close|dismiss)|close (dialog|modal|popup|form)/i;
  let way = null;
  for (const layer of layers) {
    const candidates = [...layer.querySelectorAll("button, a, [role='button'], [aria-label], [title]")].filter(shown);
    way = candidates.find((one) => SAYS_NO.test(words(one))) ?? candidates.find((one) => SAYS_CLOSE.test(one.getAttribute("aria-label") || one.getAttribute("title") || "")) ?? null;
    if (way !== null) break;
  }
  const stamp = String(Date.now()) + String(Math.random()).slice(2, 6);
  if (way !== null) way.setAttribute("data-simeon-dismiss", stamp);
  return {
    covered: (top.tagName.toLowerCase() + " " + JSON.stringify(words(top).slice(0, 80))).trim(),
    ...(way === null ? {} : { stamp, way: words(way).slice(0, 40) || "close" }),
  };
};

/**
 * Clears a popup over the element, if one is there, and says what it did;
 * undefined when nothing covered it or nothing could be done about it.
 */
async function closeCoveringPopup(page, element) {
  await element.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const cover = await element.evaluate(COVER_FN).catch(() => null);
  if (cover === null) return undefined;
  if (cover.stamp !== undefined) {
    const frame = (await element.ownerFrame().catch(() => null)) ?? page.mainFrame();
    const way = frame.locator('[data-simeon-dismiss="' + cover.stamp + '"]');
    const closed = await way.click({ timeout: 3000 }).then(() => true, () => false);
    if (closed) {
      await sleep(400);
      return "Closed a popup over it first (" + JSON.stringify(cover.way) + ").";
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await sleep(300);
  const still = await element.evaluate(COVER_FN).catch(() => null);
  return still === null ? "Pressed Escape to close a popup over it first." : undefined;
}

function blockedClick(label, cover) {
  return new Error(
    "Clicking " + label + " didn't work: something on the page is over it" + (cover === null ? "" : " (" + cover.covered + ")") +
    ", most likely a popup or banner. Close it first: take a browser_snapshot and click its close or \\"No thanks\\" button, or press Escape; then click again."
  );
}

/**
 * One try of a click: "done", "covered" (something intercepts it: the
 * click reached nothing, Playwright holds such events back), "waiting"
 * (the element never became clickable in that time: nothing was clicked).
 * A try that ran out of time after the click was sent (a slow page loading
 * from it) is done: it is never sent twice.
 */
async function tryClick(element, options, timeout) {
  try {
    await element.click({ ...options, timeout });
    return { kind: "done" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("intercepts pointer events")) return { kind: "covered", error };
    if (!/Timeout \\d+ms exceeded/.test(message)) throw error;
    if (message.includes("performing click action")) return { kind: "done" };
    return { kind: "waiting", error };
  }
}

/**
 * The click, through a popup over it; what was closed on the way, if
 * anything. Until 12 November 2026 every click first scrolled to and
 * hit-tested its element for a popup; now a popup is looked for only when
 * a short first try says something is over the element, and a cover that
 * can't be cleared fails at once instead of after ten seconds.
 */
async function clickThroughPopups(page, element, options, label) {
  const total = typeof options.timeout === "number" ? options.timeout : ACTION_TIMEOUT_MS;
  const started = Date.now();
  const held = (typeof options.delay === "number" ? options.delay : 0) * (typeof options.clickCount === "number" ? options.clickCount : 1);
  let attempt = await tryClick(element, options, Math.min(total, FIRST_CLICK_TRY_MS + held));
  if (attempt.kind === "waiting") attempt = await tryClick(element, options, Math.max(1000, total - (Date.now() - started)));
  if (attempt.kind === "done") return undefined;
  if (attempt.kind === "waiting") throw attempt.error;
  const cleared = await closeCoveringPopup(page, element);
  if (cleared === undefined) {
    const cover = await element.evaluate(COVER_FN).catch(() => null);
    // A cover nothing could clear is said now; one already gone (a
    // banner sliding away) is clicked through as before.
    if (cover !== null) throw blockedClick(label, cover);
  }
  try {
    await element.click(options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("intercepts pointer events")) throw error;
    throw blockedClick(label, await element.evaluate(COVER_FN).catch(() => null));
  }
  return cleared;
}

/**
 * A key press or a click at a point is not followed by Playwright to the
 * page it opens. This waits, briefly, for the navigation it started (the
 * request leaves within a moment of a form's Enter) to reach its new page,
 * so the snapshot the step returns is of that page.
 */
function followNavigation(page) {
  let requested = false;
  let settle;
  const settled = new Promise((resolve) => { settle = resolve; });
  const isMain = (request) => {
    try {
      return request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
  const onRequest = (request) => { if (isMain(request)) requested = true; };
  // A request that ends without a page (a download, a 204) ends the wait
  // too; a page's own commits a moment after its request may finish.
  const onEnded = (request) => { if (isMain(request)) setTimeout(settle, 250); };
  const onNavigated = (frame) => { if (frame === page.mainFrame()) settle(); };
  page.on("request", onRequest);
  page.on("requestfailed", onEnded);
  page.on("requestfinished", onEnded);
  page.on("framenavigated", onNavigated);
  return async () => {
    await sleep(100);
    if (requested) await Promise.race([settled, sleep(5000)]);
    page.off("request", onRequest);
    page.off("requestfailed", onEnded);
    page.off("requestfinished", onEnded);
    page.off("framenavigated", onNavigated);
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
  };
}

const FILE_CHOOSER_CAUGHT ="That opened a file picker, which was closed with nothing chosen. To attach a file there, call browser_upload_file with the upload button's (or file field's) ref and the file's path on your computer.";

function filesToUpload(value) {
  const asked = (Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .filter((one) => typeof one === "string" && one.trim().length > 0)
    .map((one) => one.trim());
  if (asked.length === 0) {
    throw new Error("browser_upload_file needs paths: the file or files to attach, as paths on your computer (for example /workspace/uploads/resume.pdf).");
  }
  let root = UPLOAD_ROOT;
  try { root = realpathSync(UPLOAD_ROOT); } catch {}
  return asked.map((one) => {
    const wanted = one.startsWith("/") ? one : UPLOAD_ROOT + "/" + one;
    let real;
    try {
      real = realpathSync(wanted);
    } catch {
      throw new Error("No file at " + wanted + " on your computer. The person's attachments are in /workspace/uploads; list them with Shell (ls /workspace/uploads) and pass the full path.");
    }
    if (real !== root && !real.startsWith(root + "/")) {
      throw new Error("Only files in /workspace can be attached to a page; " + wanted + " is outside it. Copy it into /workspace first if it is the person's file.");
    }
    if (!statSync(real).isFile()) throw new Error(wanted + " is a folder, not a file.");
    return real;
  });
}

/**
 * Each shown frame, read in its own document after the page, its refs
 * written fN eM: a store's sign-in or a widget often sits in one. Until 12
 * November 2026 up to 8 frames were read one after another, each question
 * allowed 2 seconds; now frames of 20 pixels or more on a side are read,
 * at most 5, all at once, within 1.5 seconds in all.
 */
async function readFrames(page, base) {
  const frames = page.frames().filter((frame) => frame !== page.mainFrame() && !frame.isDetached());
  if (frames.length === 0) return { lines: [], refCount: 0 };
  const budget = Date.now() + FRAMES_BUDGET_MS;
  const left = () => Math.max(1, budget - Date.now());
  const found = await Promise.all(frames.map(async (frame) => {
    // A frame from another site that loaded before this step connected
    // has no address here until it navigates again; it knows its own.
    const url = frame.url() || ((await withinFrameTime(frame.evaluate(() => globalThis.location.href).catch(() => ""), left())) ?? "");
    const host = readableFrameHost(url);
    if (host === undefined) return undefined;
    const owner = (await withinFrameTime(frame.frameElement().catch(() => null), left())) ?? null;
    const box = owner === null ? null : ((await withinFrameTime(owner.boundingBox().catch(() => null), left())) ?? null);
    if (box === null || box.width < MIN_FRAME_SIDE || box.height < MIN_FRAME_SIDE) return undefined;
    return { frame, host };
  }));
  const shown = found.filter((one) => one !== undefined).slice(0, MAX_FRAMES);
  const inner = await Promise.all(shown.map((one, index) =>
    withinFrameTime(one.frame.evaluate(SNAPSHOT_FN, { ...base, prefix: "f" + String(index + 1) + "e", maxNodes: FRAME_MAX_NODES }).catch(() => undefined), left())
  ));
  const lines = [];
  let refCount = 0;
  shown.forEach((one, index) => {
    const read = inner[index];
    if (read === undefined || read.refCount === 0) return;
    lines.push("- frame " + JSON.stringify(one.host));
    for (const line of read.lines) lines.push("  " + line);
    refCount += read.refCount;
  });
  return { lines, refCount };
}

/** The page's snapshot, as browser_snapshot returns it: its lines and how many refs they hold. */
async function readPageSnapshot(page, request) {
  const selector = typeof request.selector === "string" && request.selector.length > 0 ? request.selector : undefined;
  const base = {
    interactive: request.interactive === true,
    maxDepth: typeof request.maxDepth === "number" ? request.maxDepth : 20,
    generation: String(Date.now()) + "-" + String(Math.random()).slice(2, 8),
  };
  const result = await page.evaluate(SNAPSHOT_FN, { ...base, selector, prefix: "e", keepRefs: true });
  const lines = [...result.lines];
  let refCount = result.refCount;
  if (selector === undefined) {
    const frames = await readFrames(page, base);
    lines.push(...frames.lines);
    refCount += frames.refCount;
  }
  return { data: lines.join("\\n"), refCount };
}

/**
 * The snapshot a click, a typing, a key press or a choice returns, so the
 * agent has the page and its refs without a browser_snapshot of its own
 * (12 November 2026: almost every click was followed by one). A page still
 * changing documents is asked again once it has loaded.
 */
async function snapshotAfterAction(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await readPageSnapshot(page, {});
    } catch {
      await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    }
  }
  return undefined;
}

const OPS = {
  navigate: async ({ request, context, state }) => {
    if (request.newTab === true) {
      const page = await context.newPage();
      const viewId = typeof request.viewId === "string" && request.viewId.length > 0 ? request.viewId : "tab-" + String(Date.now());
      state.views[viewId] = await targetIdOf(context, page);
      state.lastViewId = viewId;
      page.setDefaultTimeout(ACTION_TIMEOUT_MS);
      await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS });
      await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
      if (request.front === true) await page.bringToFront().catch(() => {});
      return { page, viewId, summary: "Opened " + request.url + " in a new tab" };
    }
    const { page, viewId } = await resolvePage(request, context, state);
    await page.goto(request.url, { waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS });
    await page.waitForLoadState("load", { timeout: 5000 }).catch(() => {});
    // OpenPage (the agent's own step) puts the page in front, where the
    // person looks when the computer is handed over.
    if (request.front === true) await page.bringToFront().catch(() => {});
    return { page, viewId, summary: "Navigated to " + request.url };
  },
  snapshot: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const { data, refCount } = await readPageSnapshot(page, request);
    return {
      page,
      viewId,
      summary: "Captured page snapshot (" + String(refCount) + " interactive refs)",
      data,
    };
  },
  click: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const element = await refHandle(page, request.ref);
    const options = clickOptionsFor(request);
    if (typeof request.offsetX === "number" || typeof request.offsetY === "number") {
      const box = await element.boundingBox();
      if (box !== null) {
        options.position = {
          x: box.width / 2 + (request.offsetX ?? 0),
          y: box.height / 2 + (request.offsetY ?? 0),
        };
      }
    }
    const label = request.element ?? request.ref;
    const cleared = await clickThroughPopups(page, element, options, label);
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    return { page, viewId, summary: (cleared === undefined ? "" : cleared + " ") + "Clicked " + label, snapshotAfter: true };
  },
  mouse_click_xy: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const followed = followNavigation(page);
    await page.mouse.click(request.x, request.y, {
      button: request.button === "right" || request.button === "middle" ? request.button : "left",
    });
    await followed();
    return { page, viewId, summary: "Clicked at (" + String(request.x) + ", " + String(request.y) + ")", snapshotAfter: true };
  },
  type: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const element = await refHandle(page, request.ref);
    const cleared = await clickThroughPopups(page, element, { timeout: ACTION_TIMEOUT_MS }, request.element ?? request.ref);
    if (request.clear === true) {
      await element.fill("").catch(() => {});
    }
    await page.keyboard.type(request.text, { delay: request.slowly === true ? 40 : 0 });
    if (request.submit === true) {
      const followed = followNavigation(page);
      await page.keyboard.press("Enter");
      await followed();
    }
    return { page, viewId, summary: (cleared === undefined ? "" : cleared + " ") + "Typed into " + (request.element ?? request.ref), snapshotAfter: true };
  },
  fill: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const element = await refHandle(page, request.ref);
    await element.fill(request.value);
    return { page, viewId, summary: "Filled " + (request.element ?? request.ref) };
  },
  select_option: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const element = await refHandle(page, request.ref);
    const values = Array.isArray(request.values) ? request.values : [];
    let selected;
    try {
      selected = await element.selectOption(values);
    } catch {
      selected = await element.selectOption(values.map((v) => ({ label: v })));
    }
    return {
      page,
      viewId,
      summary: "Selected " + JSON.stringify(selected) + " in " + (request.element ?? request.ref),
      snapshotAfter: true,
    };
  },
  upload_file: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const paths = filesToUpload(request.paths);
    const element = await refHandle(page, request.ref);
    const label = request.element ?? request.ref;
    const isFileField = await element.evaluate((el) => el.tagName === "INPUT" && el.type === "file").catch(() => false);
    if (isFileField) {
      await element.setInputFiles(paths, { timeout: ACTION_TIMEOUT_MS });
    } else {
      // A styled button or drop zone opens the file window from its own
      // click: it is caught before it opens and given the files.
      const chooser = page.waitForEvent("filechooser", { timeout: FILE_CHOOSER_TIMEOUT_MS }).catch(() => undefined);
      await clickThroughPopups(page, element, clickOptionsFor(request), label);
      const opened = await chooser;
      if (opened === undefined) {
        throw new Error("Clicking " + label + " opened no file picker. Take a snapshot and pass the ref of the page's upload button or file field.");
      }
      await opened.setFiles(paths, { timeout: ACTION_TIMEOUT_MS });
    }
    await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => {});
    const names = paths.map((one) => one.slice(one.lastIndexOf("/") + 1)).join(", ");
    return { page, viewId, summary: "Attached " + names + " to " + label, fileChooserFilled: true };
  },
  press_key: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const followed = followNavigation(page);
    await page.keyboard.press(request.key);
    await followed();
    return { page, viewId, summary: "Pressed " + request.key, snapshotAfter: true };
  },
  scroll: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    if (typeof request.ref === "string" && request.ref.length > 0) {
      const element = await refHandle(page, request.ref);
      await element.scrollIntoViewIfNeeded();
      return { page, viewId, summary: "Scrolled " + (request.element ?? request.ref) + " into view" };
    }
    const amount = typeof request.amount === "number" && request.amount > 0 ? request.amount : 300;
    let deltaX = typeof request.deltaX === "number" ? request.deltaX : 0;
    let deltaY = typeof request.deltaY === "number" ? request.deltaY : 0;
    if (deltaX === 0 && deltaY === 0) {
      const direction = request.direction ?? "down";
      if (direction === "up") deltaY = -amount;
      else if (direction === "down") deltaY = amount;
      else if (direction === "left") deltaX = -amount;
      else deltaX = amount;
    }
    await page.mouse.wheel(deltaX, deltaY);
    await sleep(200);
    return { page, viewId, summary: "Scrolled by (" + String(deltaX) + ", " + String(deltaY) + ")" };
  },
  tabs: async ({ request, context, state }) => {
    const pages = context.pages().filter((p) => !p.isClosed());
    if (request.action === "list") {
      const entries = [];
      for (let i = 0; i < pages.length; i++) {
        entries.push({
          index: i,
          url: pages[i].url(),
          title: await pages[i].title().catch(() => ""),
        });
      }
      return { summary: "Listed " + String(pages.length) + " tab(s)", data: JSON.stringify(entries, null, 1) };
    }
    if (request.action === "new") {
      const page = await context.newPage();
      const viewId = "tab-" + String(Date.now());
      state.views[viewId] = await targetIdOf(context, page);
      state.lastViewId = viewId;
      return { page, viewId, summary: "Opened a new tab" };
    }
    let page;
    if (typeof request.index === "number") {
      page = pages[request.index];
      if (page === undefined) {
        throw new Error("No tab at index " + String(request.index) + " (" + String(pages.length) + " open)");
      }
    } else if (request.action === "close") {
      const currentTarget = state.lastViewId !== undefined ? state.views[state.lastViewId] : undefined;
      if (currentTarget !== undefined) {
        for (const p of pages) {
          try {
            if ((await targetIdOf(context, p)) === currentTarget) {
              page = p;
              break;
            }
          } catch {}
        }
      }
      if (page === undefined) {
        throw new Error("No current tab to close; pass an index from browser_tabs list.");
      }
    } else {
      throw new Error('Tab index is required for "' + String(request.action) + '".');
    }
    if (request.action === "select") {
      await page.bringToFront().catch(() => {});
      const targetId = await targetIdOf(context, page);
      let viewId = Object.keys(state.views).find((k) => state.views[k] === targetId);
      if (viewId === undefined) {
        viewId = "tab-" + String(Date.now());
        state.views[viewId] = targetId;
      }
      state.lastViewId = viewId;
      return { page, viewId, summary: "Selected tab " + String(request.index) };
    }
    if (request.action === "close") {
      const targetId = await targetIdOf(context, page).catch(() => undefined);
      const closedUrl = page.url();
      await page.close();
      if (targetId !== undefined) {
        state.deletedViews = state.deletedViews ?? [];
        for (const key of Object.keys(state.views)) {
          if (state.views[key] === targetId) {
            delete state.views[key];
            state.deletedViews.push(key);
            if (state.lastViewId === key) state.lastViewId = undefined;
          }
        }
      }
      return { summary: "Closed tab (" + closedUrl + ")" };
    }
    throw new Error("Unknown tabs action: " + String(request.action));
  },
  screenshot: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    return { page, viewId, summary: "Took a screenshot", fullPage: request.fullPage === true };
  },
  drag: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const source = await refHandle(page, request.sourceRef);
    await source.scrollIntoViewIfNeeded();
    const sourceBox = await source.boundingBox();
    if (sourceBox === null) throw new Error("The drag source has no visible bounding box.");
    let targetX;
    let targetY;
    if (typeof request.targetRef === "string" && request.targetRef.length > 0) {
      const target = await refHandle(page, request.targetRef);
      const targetBox = await target.boundingBox();
      if (targetBox === null) throw new Error("The drag target has no visible bounding box.");
      targetX = targetBox.x + targetBox.width / 2;
      targetY = targetBox.y + targetBox.height / 2;
    } else if (typeof request.targetX === "number" && typeof request.targetY === "number") {
      targetX = request.targetX;
      targetY = request.targetY;
    } else {
      throw new Error("drag needs targetRef or targetX/targetY.");
    }
    const startX = sourceBox.x + sourceBox.width / 2;
    const startY = sourceBox.y + sourceBox.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    const steps = 12;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(
        startX + ((targetX - startX) * i) / steps,
        startY + ((targetY - startY) * i) / steps
      );
    }
    await page.mouse.up();
    return {
      page,
      viewId,
      summary:
        "Dragged " + request.sourceRef + " to (" + String(Math.round(targetX)) + ", " + String(Math.round(targetY)) + ")",
    };
  },
  get_bounding_box: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    const element = await refHandle(page, request.ref);
    const box = await element.boundingBox();
    if (box === null) throw new Error("The element has no visible bounding box.");
    return {
      page,
      viewId,
      summary: "Bounding box for " + (request.element ?? request.ref),
      data: JSON.stringify({
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      }),
    };
  },
  highlight: async ({ request, context, state }) => {
    const { page, viewId } = await resolvePage(request, context, state);
    await page.bringToFront().catch(() => {});
    const element = await refHandle(page, request.ref);
    await element.scrollIntoViewIfNeeded();
    const durationMs = Math.min(
      typeof request.durationMs === "number" && request.durationMs > 0 ? request.durationMs : 2000,
      5000
    );
    await element.evaluate((el, ms) => {
      const doc = el.ownerDocument;
      const rect = el.getBoundingClientRect();
      const overlay = doc.createElement("div");
      overlay.style.cssText =
        "position:fixed;z-index:2147483647;pointer-events:none;border:3px solid #ff4d4f;" +
        "border-radius:4px;background:rgba(255,77,79,0.15);" +
        "left:" + String(rect.left - 3) + "px;top:" + String(rect.top - 3) + "px;" +
        "width:" + String(rect.width) + "px;height:" + String(rect.height) + "px;";
      doc.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), ms);
    }, durationMs);
    await sleep(300);
    return { page, viewId, summary: "Highlighted " + (request.element ?? request.ref) + " for " + String(durationMs) + "ms" };
  },
  cdp: async ({ request, context, state }) => {
    const method = typeof request.method === "string" ? request.method : "";
    const deniedPrefixes = [
      "Browser.",
      "Target.",
      "Storage.",
      "SystemInfo.",
      "Security.",
      "Input.",
      "Tethering.",
      "Cast.",
    ];
    const deniedMethods = [
      "Network.setCookie",
      "Network.setCookies",
      "Network.getCookies",
      "Network.getAllCookies",
      "Network.deleteCookies",
      "Network.clearBrowserCookies",
      "Network.clearBrowserCache",
    ];
    if (
      method.length === 0 ||
      deniedPrefixes.some((p) => method.startsWith(p)) ||
      deniedMethods.includes(method)
    ) {
      throw new Error(
        "CDP method " + JSON.stringify(method) + " is denied. Browser-wide, storage, cookie, cache, permission, target-management, and input commands are not allowed; use the dedicated browser tools instead."
      );
    }
    const { page, viewId } = await resolvePage(request, context, state);
    const session = await context.newCDPSession(page);
    try {
      const result = await session.send(method, request.params && typeof request.params === "object" ? request.params : {});
      let serialized = JSON.stringify(result);
      const max = 20000;
      if (serialized.length > max) {
        serialized = serialized.slice(0, max) + " \u2026(truncated " + String(serialized.length - max) + " chars)";
      }
      return { page, viewId, summary: "Ran CDP " + method, data: serialized };
    } finally {
      await session.detach().catch(() => {});
    }
  },
};

/**
 * One step on a connected Chrome, whichever way it runs: the op, the view
 * state written back, the page's snapshot after an action that hands one
 * back, its title and address, and the screenshot with its fingerprint (the
 * host leaves out a picture that is the same as the last one it showed).
 */
async function performStep(request, context) {
  noteUsed(request.display);
  const state = loadState(request.display);
  const loadedViews = { ...state.views };
  const loadedUrls = { ...state.urls };
  const loadedLastViewId = state.lastViewId;
  const op = OPS[request.op];
  if (op === undefined) throw new Error("Unknown op: " + String(request.op));
  const fileChoosers = catchFileChoosers(context);
  try {
    const result = await op({ request, context, state });
    // Record the view's URL so a discard-churned target can be re-adopted by
    // URL on a later call (see resolvePage).
    if (result.viewId !== undefined && result.page !== undefined) {
      state.urls[result.viewId] = result.page.url();
    }
    // Persist only the entries THIS process changed. state holds a snapshot of
    // the whole file from loadState, and writing it back wholesale would let
    // a concurrent driver call's save clobber fresher mappings with stale
    // ones (e.g. undo the other call's post-discard re-adoption).
    const dirtyViews = {};
    for (const key of Object.keys(state.views)) {
      if (state.views[key] !== loadedViews[key]) dirtyViews[key] = state.views[key];
    }
    const dirtyUrls = {};
    for (const key of Object.keys(state.urls)) {
      if (state.urls[key] !== loadedUrls[key]) dirtyUrls[key] = state.urls[key];
    }
    saveState(request.display, {
      views: dirtyViews,
      urls: dirtyUrls,
      deletedViews: state.deletedViews,
      // Only when THIS op changed it: an op that never resolves a view (e.g.
      // tabs list) must not write the loaded value back over a concurrent
      // call's fresher one.
      lastViewId: state.lastViewId !== loadedLastViewId ? state.lastViewId : undefined,
    });
    const out = { ok: true, summary: result.summary };
    if (result.data !== undefined) out.data = result.data;
    if (result.viewId !== undefined) out.viewId = result.viewId;
    if (result.page !== undefined) {
      if (result.snapshotAfter === true && !result.page.isClosed()) {
        const read = await snapshotAfterAction(result.page);
        if (read !== undefined) out.data = "Page snapshot after it (" + String(read.refCount) + " interactive refs):\\n" + read.data;
      }
      out.url = result.page.url();
      out.title = await result.page.title().catch(() => "");
      if (typeof request.screenshotPath === "string" && request.screenshotPath.length > 0) {
        mkdirSync(STATE_DIR, { recursive: true });
        const shot = { path: request.screenshotPath, timeout: 8000, scale: "css" };
        if (result.fullPage === true) {
          shot.fullPage = true;
          const size = await result.page
            .evaluate(() => ({
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
              top: Math.round(window.scrollY),
            }))
            .catch(() => undefined);
          if (size !== undefined && (size.width > FULL_PAGE_MAX_SIDE || size.height > FULL_PAGE_MAX_SIDE)) {
            const height = Math.min(size.height, FULL_PAGE_MAX_SIDE);
            const top = Math.max(0, Math.min(size.top, size.height - height));
            shot.clip = { x: 0, y: top, width: Math.min(size.width, FULL_PAGE_MAX_SIDE), height };
            out.summary += " The page is " + String(size.width) + "×" + String(size.height) +
              " pixels; the picture shows " + String(FULL_PAGE_MAX_SIDE) + " of them, from " + String(top) +
              " to " + String(top + height) + ". Scroll and take another to see the rest.";
          }
        }
        await result.page
          .screenshot(shot)
          .then((bytes) => {
            out.screenshot = true;
            out.shot = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
          })
          .catch(() => {});
      }
    }
    if (fileChoosers.count > 0 && result.fileChooserFilled !== true) out.summary += " " + FILE_CHOOSER_CAUGHT;
    return out;
  } finally {
    fileChoosers.release();
    noteUsed(request.display);
  }
}

function isBlankTab(url) {
  return url === "" || url === "about:blank" || url.startsWith("chrome://newtab") || url.startsWith("chrome://new-tab-page");
}

/**
 * Reopens what a Chrome closed for being unused had open (closed-N.json):
 * its session cookies first (signed-in sites whose cookies end with the
 * browser), then its tabs, each view on its own tab again and the agent's
 * last one in front. Signed-in sites with lasting cookies need nothing: the
 * profile keeps them. The record is read once.
 */
async function restoreClosedTabs(context, display) {
  let record;
  try {
    record = JSON.parse(readFileSync(closedPath(display), "utf8"));
  } catch {
    return;
  }
  try {
    unlinkSync(closedPath(display));
  } catch {}
  const cookies = Array.isArray(record?.sessionCookies) ? record.sessionCookies : [];
  if (cookies.length > 0) await context.addCookies(cookies).catch(() => {});
  const tabs = (Array.isArray(record?.tabs) ? record.tabs : [])
    .filter((tab) => tab !== null && typeof tab === "object" && typeof tab.url === "string" && /^(https?|file):/i.test(tab.url))
    .slice(0, MAX_RESTORED_TABS);
  if (tabs.length === 0) return;
  const before = context.pages().filter((page) => !page.isClosed());
  const views = {};
  const urls = {};
  let front;
  await Promise.all(tabs.map(async (tab) => {
    const page = await context.newPage();
    page.setDefaultTimeout(ACTION_TIMEOUT_MS);
    await page.goto(tab.url, { waitUntil: "domcontentloaded", timeout: NAVIGATE_TIMEOUT_MS }).catch(() => {});
    const targetId = await targetIdOf(context, page).catch(() => undefined);
    if (targetId === undefined) return;
    for (const viewId of Array.isArray(tab.viewIds) ? tab.viewIds : []) {
      if (typeof viewId !== "string") continue;
      views[viewId] = targetId;
      urls[viewId] = tab.url;
    }
    if (tab.front === true) front = page;
  }));
  // The empty tab the new window opened with goes; the reopened ones stay.
  for (const page of before) {
    if (isBlankTab(page.url())) await page.close().catch(() => {});
  }
  saveState(display, { views, urls, ...(typeof record.lastViewId === "string" ? { lastViewId: record.lastViewId } : {}) });
  if (front !== undefined) await front.bringToFront().catch(() => {});
}

/** Closes an unused Chrome, writing first what restoreClosedTabs reopens. */
async function closeIdleChrome(browser, context, display, port) {
  const state = loadState(display);
  const viewsOf = new Map();
  for (const [viewId, targetId] of Object.entries(state.views)) {
    if (!viewsOf.has(targetId)) viewsOf.set(targetId, []);
    viewsOf.get(targetId).push(viewId);
  }
  const frontTarget = state.lastViewId !== undefined ? state.views[state.lastViewId] : undefined;
  const tabs = [];
  for (const page of context.pages()) {
    if (page.isClosed()) continue;
    const url = page.url();
    if (!/^(https?|file):/i.test(url)) continue;
    const targetId = await targetIdOf(context, page).catch(() => undefined);
    tabs.push({
      url,
      viewIds: targetId === undefined ? [] : viewsOf.get(targetId) ?? [],
      ...(targetId !== undefined && targetId === frontTarget ? { front: true } : {}),
    });
  }
  const sessionCookies = (await context.cookies().catch(() => [])).filter((cookie) => cookie.expires === -1);
  mkdirSync(STATE_DIR, { recursive: true });
  const tmp = closedPath(display) + "." + String(process.pid) + ".tmp";
  writeFileSync(tmp, JSON.stringify({ closedAtMs: Date.now(), tabs, sessionCookies, ...(state.lastViewId === undefined ? {} : { lastViewId: state.lastViewId }) }), { mode: 0o600 });
  renameSync(tmp, closedPath(display));
  const session = await browser.newBrowserCDPSession();
  await session.send("Browser.close").catch(() => {});
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline && (await cdpAlive(port))) await sleep(200);
  return tabs.length;
}

function errorResult(error) {
  const out = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (error !== null && typeof error === "object" && error.code === "SAND_NO_PLAYWRIGHT") out.missing = "playwright";
  return out;
}

function printResult(result) {
  process.stdout.write("\\n" + RESULT_MARKER + JSON.stringify(result) + "\\n");
}

/** One step the one-step way: connect, act, disconnect. */
async function runOnce(request) {
  await ensureChrome(request.cdpPort, request.display);
  await reviveDiscardedTabs(request.cdpPort);
  const { chromium } = await requirePlaywright("playwright-core");
  const browser = await chromium.connectOverCDP(
    "http://127.0.0.1:" + String(request.cdpPort),
    { timeout: 10000 }
  );
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    await restoreClosedTabs(context, request.display);
    return await performStep(request, context);
  } finally {
    await browser.close().catch(() => {});
  }
}

// The helper that stays running: one per display and per copy of this file
// (named by its content), so a new engine's steps never reach an older one.
let SELF_PATH = "";
let SELF_ID = "copy";
try {
  SELF_PATH = fileURLToPath(import.meta.url);
  SELF_ID = createHash("sha256").update(readFileSync(SELF_PATH)).digest("hex").slice(0, 12);
} catch {}

function socketPath(display) {
  return STATE_DIR + "/daemon-" + SELF_ID + "-" + String(display) + ".sock";
}

function socketAnswers(path) {
  return new Promise((resolve) => {
    const socket = net.connect(path);
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    setTimeout(() => done(false), 1000).unref();
  });
}

/** Listens on the display's socket unless another helper already does; one starts at a time. */
async function listenAlone(path) {
  const lock = path + ".lock";
  const deadline = Date.now() + 3000;
  let locked = false;
  while (!locked && Date.now() < deadline) {
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" });
      locked = true;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > 5000) unlinkSync(lock);
      } catch {}
      await sleep(50);
    }
  }
  try {
    if (await socketAnswers(path)) return undefined;
    try {
      unlinkSync(path);
    } catch {}
    const server = net.createServer();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(path, () => {
        server.off("error", reject);
        resolve(undefined);
      });
    });
    try {
      chmodSync(path, 0o600);
    } catch {}
    return server;
  } catch {
    return undefined;
  } finally {
    if (locked) {
      try {
        unlinkSync(lock);
      } catch {}
    }
  }
}

function minutesText(ms) {
  const minutes = ms / 60000;
  return (Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(2)) + " min";
}

/**
 * The display's browser helper that stays running (12 November 2026). It
 * keeps one connection to the display's Chrome, so a step costs the step
 * and not a new process, a Playwright load and a connection that maps
 * every tab. Steps arrive over the socket one at a time and run in order;
 * a connection Chrome dropped (Chrome restarted) is made again on the next
 * step. Between steps a page's dialog and file window are left to the
 * person, and downloads go where Chrome puts them. When the browser and
 * the screen have gone unused for the idle time (the host's
 * SIMEON_BROWSER_IDLE_CLOSE_MINUTES, 10 by default) with nobody watching
 * the screen and the computer not handed to the person, it closes Chrome
 * (closeIdleChrome) and ends; it also ends after that long with no Chrome
 * open. Log: /tmp/.sand-browser/daemon-N.log.
 */
async function serve(display) {
  if (!Number.isInteger(display) || display < 0) process.exit(64);
  mkdirSync(STATE_DIR, { recursive: true });
  const path = socketPath(display);
  const logFile = STATE_DIR + "/daemon-" + String(display) + ".log";
  try {
    if (statSync(logFile).size > 1000000) writeFileSync(logFile, "");
  } catch {}
  const log = (line) => {
    try {
      appendFileSync(logFile, new Date().toISOString() + " [" + SELF_ID + " pid " + String(process.pid) + "] " + line + "\\n");
    } catch {}
  };
  process.on("unhandledRejection", (error) => log("unhandled: " + (error instanceof Error ? error.message : String(error))));
  const server = await listenAlone(path);
  if (server === undefined) process.exit(0);
  let ownInode = 0;
  try {
    ownInode = statSync(path).ino;
  } catch {}
  REVIVE_ON_MISS = true;
  log("started for display :" + String(display));
  const live = { browser: undefined, context: undefined, port: undefined, idleMs: DEFAULT_IDLE_CLOSE_MS, lastUsedMs: Date.now(), busy: false, waiting: 0, ending: false, kept: "" };
  const pendingDialogs = new Set();
  const watchedPages = new WeakSet();
  // With a listener of its own Playwright no longer dismisses a page's
  // dialogs: one that opens during a step is dismissed, as before; one that
  // opens between steps is the person's, and is dismissed only when the
  // next step starts.
  const watchDialogs = (page) => {
    if (watchedPages.has(page)) return;
    watchedPages.add(page);
    page.on("dialog", (dialog) => {
      if (live.busy) dialog.dismiss().catch(() => {});
      else pendingDialogs.add(dialog);
    });
  };
  const drop = (reason) => {
    const browser = live.browser;
    live.browser = undefined;
    live.context = undefined;
    if (browser !== undefined) {
      log("let go of Chrome: " + reason);
      browser.close().catch(() => {});
    }
  };
  const connect = async (request) => {
    if (live.browser !== undefined && live.browser.isConnected() && live.context !== undefined) return live.context;
    drop("its connection had ended");
    await ensureChrome(request.cdpPort, request.display);
    await reviveDiscardedTabs(request.cdpPort);
    const { chromium } = await requirePlaywright("playwright-core");
    const browser = await chromium.connectOverCDP(
      "http://127.0.0.1:" + String(request.cdpPort),
      { timeout: 10000 }
    );
    const context = browser.contexts()[0] ?? (await browser.newContext());
    browser.on("disconnected", () => {
      if (live.browser !== browser) return;
      live.browser = undefined;
      live.context = undefined;
      log("Chrome closed its connection");
    });
    // Playwright sends downloads to a folder of its own, emptied when it
    // disconnects; a connection that stays would keep the person's there.
    try {
      const session = await browser.newBrowserCDPSession();
      await session.send("Browser.setDownloadBehavior", { behavior: "default" });
      await session.detach().catch(() => {});
    } catch {}
    for (const page of context.pages()) watchDialogs(page);
    context.on("page", watchDialogs);
    live.browser = browser;
    live.context = context;
    live.port = request.cdpPort;
    log("connected to Chrome on port " + String(request.cdpPort));
    if (existsSync(closedPath(display))) {
      await restoreClosedTabs(context, display);
      log("reopened the tabs of the Chrome closed for being unused");
    }
    return context;
  };
  const step = async (request) => {
    if (request.display !== display) return { ok: false, error: "The browser on this computer could not take that step; try it again." };
    if (typeof request.playwrightRoot === "string" && request.playwrightRoot.length > 0) PLAYWRIGHT_ROOT = request.playwrightRoot;
    if (typeof request.idleCloseMs === "number" && request.idleCloseMs >= 0 && request.idleCloseMs !== live.idleMs) {
      live.idleMs = request.idleCloseMs;
      schedule();
    }
    live.port = request.cdpPort;
    for (const dialog of pendingDialogs) dialog.dismiss().catch(() => {});
    pendingDialogs.clear();
    const context = await connect(request);
    const out = await performStep(request, context);
    out.served = "daemon";
    return out;
  };
  let queue = Promise.resolve();
  const enqueue = (job) => {
    live.waiting += 1;
    const run = queue.then(async () => {
      live.busy = true;
      try {
        return await job();
      } finally {
        live.busy = false;
        live.waiting -= 1;
        live.lastUsedMs = Date.now();
      }
    });
    queue = run.catch(() => undefined);
    return run;
  };
  const TIMED_OUT = Symbol("timed out");
  const answer = async (request) => {
    let timer;
    const result = await enqueue(() => Promise.race([
      step(request),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), STEP_LIMIT_MS);
      }),
    ])).catch((error) => errorResult(error)).finally(() => clearTimeout(timer));
    if (result !== TIMED_OUT) return result;
    // As the one-step process ended: the connection goes, and with it
    // whatever the step was still waiting on.
    drop("a step ran past 90 seconds");
    return { ok: false, error: "The browser took too long to respond (90 seconds)." };
  };
  const end = async (reason) => {
    if (live.ending) return;
    live.ending = true;
    log("ending: " + reason);
    server.close();
    try {
      if (statSync(path).ino === ownInode) unlinkSync(path);
    } catch {}
    await queue;
    drop("the helper ended");
    setTimeout(() => process.exit(0), 100);
  };
  server.on("connection", (socket) => {
    socket.setEncoding("utf8");
    socket.on("error", () => {});
    let buffer = "";
    let stage = "request";
    let request;
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\\n");
        if (stage === "request") {
          try {
            request = JSON.parse(line);
          } catch {
            socket.destroy();
            return;
          }
          if (request !== null && typeof request === "object" && request.control === "stop") {
            socket.end(JSON.stringify({ stopping: true }) + "\\n");
            void end("asked to stop");
            return;
          }
          if (live.ending) {
            socket.destroy();
            return;
          }
          stage = "ready";
          socket.write(JSON.stringify({ ready: true }) + "\\n");
        } else if (stage === "ready" && line === "go") {
          // Only now is the step the helper's: a client that gave up
          // before saying go runs it itself, and it never runs twice.
          stage = "running";
          void answer(request).then((result) => {
            if (!socket.destroyed) socket.end(JSON.stringify({ result }) + "\\n");
          });
        }
      }
    });
  });
  const lastUsed = () => Math.max(live.lastUsedMs, mtimeMs(usedPath(display)), mtimeMs(leasePath(display)));
  const tick = async () => {
    let inode = 0;
    try {
      inode = statSync(path).ino;
    } catch {}
    if (inode !== ownInode) return end("another helper has its socket");
    if (live.busy || live.waiting > 0) return;
    const now = Date.now();
    const quietMs = live.idleMs > 0 ? live.idleMs : DEFAULT_IDLE_CLOSE_MS;
    const port = live.port;
    const chromeUp = (live.browser !== undefined && live.browser.isConnected()) || (port !== undefined && (await cdpAlive(port)));
    if (!chromeUp) {
      if (now - lastUsed() >= quietMs) await end("unused for " + minutesText(quietMs) + ", no Chrome open");
      return;
    }
    const held = heldBy(display, now);
    const verdict = idleCloseVerdict({ nowMs: now, lastUsedMs: lastUsed(), idleMs: live.idleMs, busy: false, watched: screenWatched(display), held: held !== undefined });
    const kept = verdict === "held" ? "held:" + String(held) : verdict;
    if ((verdict === "watched" || verdict === "held") && live.kept !== kept) {
      log("unused for " + minutesText(now - lastUsed()) + ", Chrome kept open: " + (verdict === "watched" ? "someone is watching the screen" : held === "purchase" ? "a checkout card waits for the person" : "the computer is handed to the person"));
    }
    live.kept = kept;
    if (verdict === "never") {
      if (now - lastUsed() >= quietMs) await end("unused for " + minutesText(quietMs) + "; Chrome left open, closing is off");
      return;
    }
    if (verdict !== "close") return;
    await enqueue(async () => {
      // Asked again in turn: a step may have come in meanwhile.
      const again = idleCloseVerdict({ nowMs: Date.now(), lastUsedMs: lastUsed(), idleMs: live.idleMs, busy: live.waiting > 1, watched: screenWatched(display), held: heldBy(display, Date.now()) !== undefined });
      if (again !== "close" || !(await cdpAlive(port))) return;
      const context = await connect({ display, cdpPort: port });
      const tabs = await closeIdleChrome(live.browser, context, display, port);
      log("closed Chrome after " + minutesText(Date.now() - lastUsed()) + " unused, nobody watching, not handed over, no checkout card waiting (" + String(tabs) + " tab(s) kept to reopen)");
    }).catch((error) => log("could not close Chrome: " + (error instanceof Error ? error.message : String(error))));
    if (live.waiting === 0 && !(await cdpAlive(port))) await end("closed Chrome");
  };
  // The idle check looks four times per idle time, at most every 30
  // seconds; armed again when a step brings another idle time.
  let checkTimer;
  function schedule() {
    clearTimeout(checkTimer);
    if (live.ending) return;
    const every = Math.min(30000, Math.max(250, Math.floor((live.idleMs > 0 ? live.idleMs : DEFAULT_IDLE_CLOSE_MS) / 4)));
    checkTimer = setTimeout(() => {
      tick().catch((error) => log("idle check failed: " + (error instanceof Error ? error.message : String(error)))).finally(schedule);
    }, every);
  }
  schedule();
}

/**
 * Hands one step to the display's helper: "absent" when none listens,
 * "refused" when one is there but did not take the step (nothing ran),
 * "lost" when it took the step and stopped answering, else its answer.
 */
function askHelper(display, request) {
  return new Promise((resolve) => {
    const socket = net.connect(socketPath(display));
    let buffer = "";
    let stage = "connecting";
    let settled = false;
    let readyTimer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(readyTimer);
      socket.destroy();
      resolve(value);
    };
    readyTimer = setTimeout(() => finish({ kind: stage === "connecting" ? "absent" : "refused" }), 3000);
    socket.setEncoding("utf8");
    socket.once("connect", () => {
      stage = "asked";
      socket.write(JSON.stringify(request) + "\\n");
    });
    const broken = () => finish({ kind: stage === "connecting" ? "absent" : stage === "running" ? "lost" : "refused" });
    socket.on("error", broken);
    socket.on("close", broken);
    socket.on("data", (chunk) => {
      buffer += chunk;
      let newline = buffer.indexOf("\\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\\n");
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (stage === "asked" && message !== null && message.ready === true) {
          stage = "running";
          clearTimeout(readyTimer);
          socket.write("go\\n");
        } else if (stage === "running" && message !== null && message.result !== undefined) {
          finish({ kind: "answered", result: message.result });
        }
      }
    });
  });
}

function startHelper(display) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    const child = spawn(process.execPath, [SELF_PATH, "--serve", String(display)], { detached: true, stdio: "ignore", cwd: STATE_DIR });
    child.on("error", () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/** The host's way: the display's helper takes the step (started when none runs), else it runs here. */
async function client(raw) {
  const watchdog = setTimeout(() => {
    printResult({ ok: false, error: "The browser took too long to respond (90 seconds)." });
    process.exit(0);
  }, 110000);
  let result;
  try {
    const request = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    const display = request.display;
    const reachable = Number.isInteger(display) && display >= 0 && SELF_PATH.length > 0;
    let answer = reachable ? await askHelper(display, request) : { kind: "refused" };
    if (answer.kind === "absent" && startHelper(display)) {
      const deadline = Date.now() + 5000;
      while (answer.kind === "absent" && Date.now() < deadline) {
        await sleep(25);
        answer = await askHelper(display, request);
      }
    }
    if (answer.kind === "answered") {
      result = answer.result;
    } else if (answer.kind === "lost") {
      result = { ok: false, error: "The browser on this computer stopped answering during that step. Take a browser_snapshot to see where the page is before trying again." };
    } else {
      // No helper took the step: it runs here, the one-step way, and the
      // display's log says so.
      if (reachable) {
        try {
          appendFileSync(STATE_DIR + "/daemon-" + String(display) + ".log", new Date().toISOString() + " [client pid " + String(process.pid) + "] a " + String(request.op) + " step ran the one-step way: the helper " + (answer.kind === "absent" ? "did not start" : "did not take it") + "\\n");
        } catch {}
      }
      if (typeof request.playwrightRoot === "string") PLAYWRIGHT_ROOT = request.playwrightRoot;
      result = await runOnce(request);
      result.served = "once";
    }
  } catch (error) {
    result = errorResult(error);
  }
  clearTimeout(watchdog);
  printResult(result);
  process.exit(0);
}

const MODE = process.argv[2];
if (MODE === "--serve") {
  void serve(Number.parseInt(process.argv[3] ?? "", 10));
} else if (MODE === "--client") {
  void client(process.argv[3] ?? "");
} else {
  const watchdog = setTimeout(() => {
    process.stdout.write(
      "\\n" + RESULT_MARKER + JSON.stringify({ ok: false, error: "The browser took too long to respond (90 seconds)." }) + "\\n"
    );
    process.exit(0);
  }, 90000);

  (async () => {
    let result;
    try {
      const raw = process.argv[2] ?? "";
      const request = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      if (typeof request.playwrightRoot === "string") PLAYWRIGHT_ROOT = request.playwrightRoot;
      result = await runOnce(request);
    } catch (error) {
      result = errorResult(error);
    }
    clearTimeout(watchdog);
    printResult(result);
    process.exit(0);
  })();
}
`;

/** Where the host writes this file on the computer: named by its content. */
export const SAND_BROWSER_DRIVER_BOX_PATH = `${SAND_BROWSER_DRIVER_BOX_DIR}/driver-v${SAND_BROWSER_DRIVER_VERSION}-${createHash("sha256").update(SAND_BROWSER_DRIVER_SOURCE).digest("hex").slice(0, 12)}.mjs`;
