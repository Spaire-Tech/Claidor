/// <reference lib="dom" />
import { CAISRA_FACE_ATTR, clayFace } from "../shared/agent/clay-face.js";
import {
  clayFaceGeometry,
  faceActionForTransition,
  faceGazeFor,
  faceMotionFrame,
  type FaceMotionAction,
} from "../shared/agent/face-motion.js";

export { CAISRA_FACE_ATTR };

/** Set on the element whose own painting the overlay replaces. */
export const CAISRA_FACE_HOST_ATTR = "data-caisra-face-host";
export const FACE_OVERLAY_LOG_TAG = "[CaisraFaceOverlay]";

/** The viewBoxes the shipped 0.18.0 face svg is drawn with (character.tsx). */
export const GROK_FACE_VIEWBOXES = ["-15 -15 259 259", "-15 -10 259 275"] as const;

export const PERSONA_MARK_SELECTOR = [
  ".sand-grok-bot-mark",
  `svg[data-avatar-shape]`,
  ...GROK_FACE_VIEWBOXES.map((viewBox) => `svg[viewBox="${viewBox}"]`),
].join(",");

const STYLE_ID = "caisra-face-overlay";
const OURS = `[${CAISRA_FACE_ATTR}]`;
// Everything painted inside a mark that is not our overlay: a direct child,
// a grandchild, a <canvas>, a nested <svg>. `visibility` keeps the layout the
// renderer measured; `!important` on every descendant stops a child from
// turning itself back on.
const HIDE_INSIDE = `:not(${OURS}):not(${OURS} *)`;
const STYLE_TEXT = `
.sand-grok-bot-mark { position: relative; background: transparent !important; -webkit-mask: none !important; mask: none !important; }
.sand-grok-bot-mark::before, .sand-grok-bot-mark::after { display: none !important; }
.sand-grok-bot-mark ${HIDE_INSIDE} { visibility: hidden !important; }
[${CAISRA_FACE_HOST_ATTR}="1"]:not(.sand-grok-bot-mark) { visibility: hidden !important; }
${GROK_FACE_VIEWBOXES.map((viewBox) => `svg[viewBox="${viewBox}"]:not(${OURS})`).join(",\n")} { visibility: hidden !important; }
${OURS} {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  visibility: visible !important;
}
${OURS} * { visibility: visible !important; }
.sand-grok-bot-mark > ${OURS}, [${CAISRA_FACE_HOST_ATTR}="1"] + ${OURS} {
  position: absolute;
  inset: 0;
  z-index: 1;
}
/* The bob, the lean, the spin, the openness and the gaze are Grok's motion
 * table, applied by the loop in this file as SVG transforms
 * (face-motion.ts). The clay style's own idle animation is generated off. */
`;
// Inside an open shadow root the light-DOM rules above cannot reach, so the
// same hide rule is rooted at the shadow tree itself.
const SHADOW_STYLE_TEXT = `
:host { position: relative; }
*${HIDE_INSIDE} { visibility: hidden !important; }
${STYLE_TEXT.replace(/\.sand-grok-bot-mark > /g, ":host > ")}
`;

function isSvgElement(node: Element): boolean {
  return node.namespaceURI === "http://www.w3.org/2000/svg";
}

function skipHost(node: Element): boolean {
  if (node.getAttribute(CAISRA_FACE_ATTR) === "1") return true;
  if (node.closest(`[${CAISRA_FACE_ATTR}]`) != null) return true;
  if (node.closest(".sand-shared-room-avatar, .sand-group-avatar, [data-avatar-kind='photo']") != null) {
    return true;
  }
  // A face svg whose mark is already a host: the mark is painted, not the face.
  if (isSvgElement(node) && !node.classList.contains("sand-grok-bot-mark") && node.closest(".sand-grok-bot-mark") != null) {
    return true;
  }
  return false;
}

export function findPersonaAvatarHosts(root: ParentNode): Element[] {
  return [...root.querySelectorAll(PERSONA_MARK_SELECTOR)].filter((node) => !skipHost(node));
}

/**
 * The seed: the agent's id, as the mark carries it. The shipped mark names
 * its face source `sand-agent-mark-source-<agentId>` (agent-avatar.tsx); a
 * mark without one falls back to its colour, and then to one shared face.
 */
export function hostIdentity(host: Element): string {
  const raw = host.getAttribute("data-source-id")
    ?? host.closest("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.querySelector("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.shadowRoot?.querySelector("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.getAttribute("data-agent-id")
    ?? host.closest("[data-agent-id]")?.getAttribute("data-agent-id")
    ?? host.getAttribute("data-avatar-color")
    ?? host.closest("[data-avatar-color]")?.getAttribute("data-avatar-color")
    ?? "persona";
  return raw.replace(/^sand-agent-mark-source-/, "");
}

/** The agent's state as the shipped mark writes it: `data-grok-state`, on the mark or on the face inside it. */
export function hostGrokState(host: Element): string | null {
  return host.getAttribute("data-grok-state")
    ?? host.querySelector("[data-grok-state]")?.getAttribute("data-grok-state")
    ?? host.shadowRoot?.querySelector("[data-grok-state]")?.getAttribute("data-grok-state")
    ?? null;
}

function hostPaused(host: Element): boolean {
  return host.getAttribute("data-paused") === "true"
    || host.querySelector("[data-paused='true']") != null
    || host.shadowRoot?.querySelector("[data-paused='true']") != null;
}

interface Mount {
  /** Where the overlay element lives. */
  readonly container: Element | ShadowRoot;
  /** Where the overlay's stylesheet has to live for it to apply. */
  readonly styleRoot: Document | ShadowRoot;
  /** The overlay is a sibling of the host rather than a child of it. */
  readonly sibling: boolean;
}

function mountFor(host: Element): Mount | null {
  const doc = host.ownerDocument;
  const isMark = host.classList.contains("sand-grok-bot-mark");
  if (isMark && !isSvgElement(host)) {
    // An open shadow root would leave a light-DOM child unrendered unless it
    // is slotted; paint inside the shadow tree instead. A closed one cannot
    // be reached, and is reported by the diagnostic line.
    if (host.shadowRoot != null) return { container: host.shadowRoot, styleRoot: host.shadowRoot, sibling: false };
    return { container: host, styleRoot: doc, sibling: false };
  }
  // The host paints itself (an <svg> mark or a bare face svg): sit beside it.
  const parent = host.parentElement;
  if (parent == null) return null;
  return { container: parent, styleRoot: parent.getRootNode() as Document | ShadowRoot, sibling: true };
}

function existingOverlay(mount: Mount, host: Element): Element | null {
  if (mount.sibling) {
    const next = host.nextElementSibling;
    return next != null && next.getAttribute(CAISRA_FACE_ATTR) === "1" ? next : null;
  }
  for (const child of mount.container.children) {
    if (child.getAttribute(CAISRA_FACE_ATTR) === "1") return child;
  }
  return null;
}

function setStyle(element: Element, declarations: Record<string, string>): void {
  // CSSOM writes are not subject to the page's style-src policy; a `style`
  // attribute in parsed markup is.
  const style = (element as HTMLElement).style;
  if (style == null) return;
  for (const [name, value] of Object.entries(declarations)) style.setProperty(name, value);
}

export function paintFaceHost(host: Element): Element | null {
  const mount = mountFor(host);
  if (mount == null) return null;
  injectFaceOverlayStyle(mount.styleRoot);
  if (mount.sibling) {
    host.setAttribute(CAISRA_FACE_HOST_ATTR, "1");
    const parent = mount.container as HTMLElement;
    if (parent.style != null && parent.style.position === "") parent.style.position = "relative";
  }
  const agentId = hostIdentity(host);
  const current = existingOverlay(mount, host);
  if (current != null && current.getAttribute("data-agent-id") === agentId) return current;
  const wrapper = host.ownerDocument.createElement("div");
  wrapper.innerHTML = clayFace(agentId).svg;
  const next = wrapper.firstElementChild;
  if (next == null) throw new Error("clay face markup did not produce an element");
  setStyle(next, { display: "block", height: "100%", width: "100%", overflow: "visible", "pointer-events": "none" });
  if (mount.sibling) {
    setStyle(next, { position: "absolute", inset: "0", "z-index": "1" });
  }
  if (current != null) current.replaceWith(next);
  else if (mount.sibling) host.after(next);
  else mount.container.append(next);
  trackFaceMotion(host, next);
  return next;
}

// ---------------------------------------------------------------- motion
// One loop for every painted face. Each frame reads the mark's state, turns
// a change of state into a one-off move when the table says so, and writes
// Grok's transforms onto the face, the eyes and the pupils.

interface TrackedFace {
  readonly host: Element;
  readonly overlay: Element;
  readonly paintedAt: number;
  state: string | null;
  action: FaceMotionAction | null;
}

const tracked = new Map<Element, TrackedFace>();
let clock: { stop(): void } | null = null;
let pointer: { x: number; y: number } | null = null;
let reducedMotion = false;
let clockNow: () => number = () => (typeof performance === "undefined" ? Date.now() : performance.now());

function trackFaceMotion(host: Element, overlay: Element): void {
  const previous = tracked.get(host);
  tracked.set(host, {
    host,
    overlay,
    paintedAt: previous?.paintedAt ?? clockNow(),
    state: previous?.state ?? hostGrokState(host),
    action: previous?.action ?? null,
  });
  startFaceMotionClock(host.ownerDocument);
}

/** Applies one frame to every tracked face. Exported so a test can drive it without a display. */
export function tickFaceMotion(now: number = clockNow()): number {
  let alive = 0;
  for (const [host, entry] of tracked) {
    if (!entry.overlay.isConnected || !host.isConnected) { tracked.delete(host); continue; }
    alive += 1;
    const state = hostGrokState(host);
    if (state !== entry.state) {
      const kind = faceActionForTransition(entry.state, state);
      entry.state = state;
      if (kind != null) entry.action = { kind, startedAt: now };
    }
    let gaze = { x: 0, y: 0 };
    if (pointer != null && !reducedMotion) {
      const box = entry.overlay.getBoundingClientRect();
      gaze = faceGazeFor(pointer, box);
    }
    const eyeY = Number.parseFloat(entry.overlay.getAttribute("data-eye-y") ?? "");
    const frame = faceMotionFrame({
      state,
      elapsedMs: now - entry.paintedAt,
      nowMs: now,
      action: entry.action,
      gaze,
      still: reducedMotion || hostPaused(host),
    }, clayFaceGeometry(Number.isFinite(eyeY) ? eyeY : 50));
    if (frame.actionDone) entry.action = null;
    entry.overlay.querySelector(".caisra-face__face")?.setAttribute("transform", frame.face);
    entry.overlay.querySelector(".caisra-face__eyes")?.setAttribute("transform", frame.eyes);
    for (const pupil of entry.overlay.querySelectorAll(".caisra-face__pupil")) pupil.setAttribute("transform", frame.pupils);
  }
  if (alive === 0) stopFaceMotionClock();
  return alive;
}

export function trackedFaceCount(): number {
  return tracked.size;
}

function startFaceMotionClock(doc: Document): void {
  if (clock != null) return;
  const view = doc.defaultView;
  reducedMotion = view?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const onPointer = (event: Event): void => {
    const at = event as PointerEvent;
    pointer = { x: at.clientX, y: at.clientY };
  };
  const onLeave = (): void => { pointer = null; };
  view?.addEventListener("pointermove", onPointer, { passive: true });
  doc.documentElement?.addEventListener("pointerleave", onLeave);
  const raf = view?.requestAnimationFrame?.bind(view);
  let handle: number | ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const step = (): void => {
    if (stopped) return;
    tickFaceMotion(clockNow());
    if (stopped) return;
    handle = raf != null ? raf(step) : setTimeout(step, 16);
  };
  clock = {
    stop() {
      stopped = true;
      if (handle != null) {
        if (raf != null && typeof handle === "number") view?.cancelAnimationFrame?.(handle);
        else clearTimeout(handle as ReturnType<typeof setTimeout>);
      }
      view?.removeEventListener("pointermove", onPointer);
      doc.documentElement?.removeEventListener("pointerleave", onLeave);
    },
  };
  step();
}

function stopFaceMotionClock(): void {
  clock?.stop();
  clock = null;
}

/** Stops the loop and forgets every face; the next paint starts it again. */
export function resetFaceMotion(now?: () => number): void {
  stopFaceMotionClock();
  tracked.clear();
  pointer = null;
  if (now != null) clockNow = now;
}

export function syncFaceMarks(root: ParentNode): number {
  const hosts = findPersonaAvatarHosts(root);
  let painted = 0;
  for (const host of hosts) {
    try {
      if (paintFaceHost(host) != null) painted += 1;
    } catch (error) {
      console.warn(`${FACE_OVERLAY_LOG_TAG} could not paint a mark`, error);
    }
  }
  return painted;
}

function styleContainer(root: Document | ShadowRoot): Element | ShadowRoot | null {
  if ((root as Document).nodeType === 9) {
    const doc = root as Document;
    return doc.head ?? doc.documentElement ?? null;
  }
  return root as ShadowRoot;
}

function findStyle(root: Document | ShadowRoot): Element | null {
  if ((root as Document).nodeType === 9) return (root as Document).getElementById(STYLE_ID);
  return (root as ShadowRoot).querySelector(`#${STYLE_ID}`);
}

export function injectFaceOverlayStyle(root: Document | ShadowRoot): boolean {
  if (findStyle(root) != null) return true;
  const container = styleContainer(root);
  if (container == null) return false;
  const doc = (root as Document).nodeType === 9 ? (root as Document) : (root as ShadowRoot).ownerDocument;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = (root as Document).nodeType === 9 ? STYLE_TEXT : SHADOW_STYLE_TEXT;
  container.append(style);
  return true;
}

function pageDocument(): Document | undefined {
  if (typeof document !== "undefined") return document;
  const candidate = (globalThis as { document?: Document }).document;
  return candidate;
}

function describe(node: Element): string {
  const clone = node.cloneNode(true) as Element;
  for (const ours of clone.querySelectorAll(`[${CAISRA_FACE_ATTR}]`)) ours.remove();
  const markup = clone.outerHTML.replace(/\s+/g, " ");
  return markup.length > 400 ? `${markup.slice(0, 400)}…` : markup;
}

/**
 * One line in the renderer console so the real DOM can be read off a
 * screenshot instead of guessed: how many marks were painted, what the first
 * one looks like without our overlay, and what else in the page could be a
 * face if none was found.
 */
export function describeFaceOverlay(doc: Document): string {
  const hosts = findPersonaAvatarHosts(doc);
  const marks = doc.querySelectorAll(".sand-grok-bot-mark").length;
  const painted = doc.querySelectorAll(`[${CAISRA_FACE_ATTR}]`).length;
  const closedShadow = [...doc.querySelectorAll(".sand-grok-bot-mark")]
    .filter((mark) => mark.shadowRoot == null && mark.childElementCount === 0 && mark.textContent?.trim() === "").length;
  const parts = [
    `marks=${marks}`,
    `hosts=${hosts.length}`,
    `painted=${painted}`,
    `readyState=${doc.readyState}`,
  ];
  if (closedShadow > 0) parts.push(`emptyMarks=${closedShadow}`);
  if (hosts[0] != null) parts.push(`first=${describe(hosts[0])}`);
  else {
    parts.push(`svg=${doc.querySelectorAll("svg").length}`);
    parts.push(`canvas=${doc.querySelectorAll("canvas").length}`);
    parts.push(`grokState=${doc.querySelectorAll("[data-grok-state]").length}`);
    parts.push(`avatars=${doc.querySelectorAll("[class*='avatar']").length}`);
  }
  return `${FACE_OVERLAY_LOG_TAG} ${parts.join(" ")}`;
}

export function installFaceOverlay(
  doc: Document | undefined = pageDocument(),
  options: { readonly log?: (line: string) => void; readonly diagnosticDelayMs?: number } = {},
): { disconnect(): void } | null {
  const log = options.log ?? ((line: string) => console.info(line));
  if (doc == null) {
    if (typeof window !== "undefined") {
      window.addEventListener("DOMContentLoaded", () => {
        installFaceOverlay(pageDocument(), options);
      }, { once: true });
    }
    return null;
  }
  let disconnected = false;
  let lastPainted = -1;
  const sync = (): void => {
    if (disconnected) return;
    const painted = syncFaceMarks(doc);
    if (painted !== lastPainted) {
      lastPainted = painted;
      log(describeFaceOverlay(doc));
    }
  };
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const observer = new Observer(sync);
  const start = (): void => {
    if (disconnected) return;
    // At preload time the parser may not have produced <head> yet; the
    // stylesheet is retried from every sync until it lands.
    injectFaceOverlayStyle(doc);
    const target = doc.documentElement ?? doc;
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-avatar-color", "data-avatar-shape", "data-source-id", "data-grok-state", "class", "style", "viewBox"],
    });
    sync();
    const delay = options.diagnosticDelayMs ?? 4000;
    if (delay > 0 && typeof setTimeout === "function") {
      setTimeout(() => {
        if (!disconnected && lastPainted <= 0) log(describeFaceOverlay(doc));
      }, delay);
    }
  };
  try {
    injectFaceOverlayStyle(doc);
  } catch (error) {
    console.warn(`${FACE_OVERLAY_LOG_TAG} stylesheet deferred`, error);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return { disconnect() { disconnected = true; observer.disconnect(); resetFaceMotion(); } };
}

/** The preload must never fail because of the overlay: the bridges it exposes are what the window runs on. */
export function installFaceOverlaySafely(): { disconnect(): void } | null {
  try {
    return installFaceOverlay();
  } catch (error) {
    console.warn(`${FACE_OVERLAY_LOG_TAG} not installed`, error);
    return null;
  }
}
