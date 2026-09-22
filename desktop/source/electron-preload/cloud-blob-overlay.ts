/// <reference lib="dom" />
import { cloudBlobColorFromGrokMark } from "../shared/agent/cloud-blobs.js";
import {
  CAISRA_CLOUD_BLOB_ATTR,
  CLOUD_BLOB_VIEWBOX,
  LEGACY_CLOUD_BLOB_VIEWBOX,
  cloudBlobPaint,
  cloudBlobSvgMarkup,
} from "../shared/agent/cloud-blob-face.js";

export { CAISRA_CLOUD_BLOB_ATTR };

/** Set on the element whose own painting the overlay replaces. */
export const CAISRA_CLOUD_HOST_ATTR = "data-caisra-cloud-host";
export const CLOUD_OVERLAY_LOG_TAG = "[CaisraCloudOverlay]";

export const PERSONA_MARK_SELECTOR = [
  ".sand-grok-bot-mark",
  `svg[data-avatar-shape]`,
  `svg[viewBox="${CLOUD_BLOB_VIEWBOX}"]`,
  `svg[viewBox="${LEGACY_CLOUD_BLOB_VIEWBOX}"]`,
].join(",");

const STYLE_ID = "caisra-cloud-blob-overlay";
const OURS = `[${CAISRA_CLOUD_BLOB_ATTR}]`;
// Everything painted inside a mark that is not our overlay: a direct child,
// a grandchild, a <canvas>, a nested <svg>. `visibility` keeps the layout the
// renderer measured; `!important` on every descendant stops a child from
// turning itself back on.
const HIDE_INSIDE = `:not(${OURS}):not(${OURS} *)`;
const STYLE_TEXT = `
.sand-grok-bot-mark { position: relative; background: transparent !important; -webkit-mask: none !important; mask: none !important; }
.sand-grok-bot-mark::before, .sand-grok-bot-mark::after { display: none !important; }
.sand-grok-bot-mark ${HIDE_INSIDE} { visibility: hidden !important; }
[${CAISRA_CLOUD_HOST_ATTR}="1"]:not(.sand-grok-bot-mark) { visibility: hidden !important; }
svg[viewBox="${CLOUD_BLOB_VIEWBOX}"]:not(${OURS}),
svg[viewBox="${LEGACY_CLOUD_BLOB_VIEWBOX}"]:not(${OURS}) { visibility: hidden !important; }
${OURS} {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  visibility: visible !important;
}
${OURS} * { visibility: visible !important; }
.sand-grok-bot-mark > ${OURS}, [${CAISRA_CLOUD_HOST_ATTR}="1"] + ${OURS} {
  position: absolute;
  inset: 0;
  z-index: 1;
}
@keyframes caisra-cloud-bob {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  50% { transform: translateY(-4%) scale(1.015, 0.985); }
}
@keyframes caisra-cloud-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
@keyframes caisra-cloud-gaze {
  0%, 100% { transform: translate(0, 0); }
  30% { transform: translate(1.8px, -1px); }
  65% { transform: translate(-1.6px, 1.2px); }
}
${OURS} .caisra-cloud-blob__face {
  transform-box: fill-box;
  transform-origin: center;
  animation: caisra-cloud-bob 4.6s ease-in-out infinite;
}
${OURS} .caisra-cloud-blob__eye {
  transform-box: fill-box;
  transform-origin: center;
  animation: caisra-cloud-blink 5.4s ease-in-out infinite;
}
${OURS} .caisra-cloud-blob__eye[data-eye="right"] {
  animation-delay: 0.04s;
}
${OURS} .caisra-cloud-blob__pupil {
  animation: caisra-cloud-gaze 6.2s ease-in-out infinite;
}
${OURS}[data-sleeping="true"] .caisra-cloud-blob__eye,
${OURS}[data-sleeping="true"] .caisra-cloud-blob__pupil {
  animation: none;
}
@media (prefers-reduced-motion: reduce) {
  ${OURS} .caisra-cloud-blob__face,
  ${OURS} .caisra-cloud-blob__eye,
  ${OURS} .caisra-cloud-blob__pupil { animation: none; }
}
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
  if (node.getAttribute(CAISRA_CLOUD_BLOB_ATTR) === "1") return true;
  if (node.closest(`[${CAISRA_CLOUD_BLOB_ATTR}]`) != null) return true;
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

function inlineProperty(host: Element, name: string): string {
  const style = (host as { style?: { getPropertyValue?(name: string): string } }).style;
  try {
    return style?.getPropertyValue?.(name) ?? "";
  } catch {
    return "";
  }
}

function computedProperty(host: Element, name: string): string {
  const view = host.ownerDocument?.defaultView;
  if (view == null || typeof view.getComputedStyle !== "function") return "";
  try {
    return view.getComputedStyle(host).getPropertyValue(name) ?? "";
  } catch {
    return "";
  }
}

/**
 * The shipped 0.18.0 mark carries no `data-avatar-color`; its ink is `--fg`
 * (`light-dark(#2A92FE, #0E74E0)` for the default blue), set inline on the
 * mark or inherited from an ancestor, and painted through `currentColor`.
 * Read the inline value first, then the computed one, then the computed
 * `color` itself, which is what the face is drawn with.
 */
export function hostForeground(host: Element): string {
  const inline = inlineProperty(host, "--fg");
  if (inline.trim().length > 0) return inline;
  const computed = computedProperty(host, "--fg");
  if (computed.trim().length > 0) return computed;
  return computedProperty(host, "color");
}

function hostColor(host: Element): string | null {
  return cloudBlobColorFromGrokMark(host.getAttribute("data-avatar-color"))
    ?? cloudBlobColorFromGrokMark(host.closest("[data-avatar-color]")?.getAttribute("data-avatar-color"))
    ?? cloudBlobColorFromGrokMark(hostForeground(host))
    ?? null;
}

function hostIdentity(host: Element): string {
  return host.getAttribute("data-source-id")
    ?? host.closest("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.querySelector("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.getAttribute("data-agent-id")
    ?? host.closest("[data-agent-id]")?.getAttribute("data-agent-id")
    ?? hostColor(host)
    ?? "persona";
}

function hostSleeping(host: Element): boolean {
  const state = host.getAttribute("data-grok-state")
    ?? host.querySelector("[data-grok-state]")?.getAttribute("data-grok-state")
    ?? host.shadowRoot?.querySelector("[data-grok-state]")?.getAttribute("data-grok-state")
    ?? "";
  return state === "sleeping" || state === "drowsy" || state === "powering-down";
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
    return next != null && next.getAttribute(CAISRA_CLOUD_BLOB_ATTR) === "1" ? next : null;
  }
  for (const child of mount.container.children) {
    if (child.getAttribute(CAISRA_CLOUD_BLOB_ATTR) === "1") return child;
  }
  return null;
}

function sizePx(host: Element): number | undefined {
  const width = Number.parseFloat(host.getAttribute("width") ?? "");
  if (Number.isFinite(width) && width > 0) return width;
  const styleWidth = (host as HTMLElement).style?.width;
  const parsed = styleWidth == null ? Number.NaN : Number.parseFloat(styleWidth);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function setStyle(element: Element, declarations: Record<string, string>): void {
  // CSSOM writes are not subject to the page's style-src policy; a `style`
  // attribute in parsed markup is.
  const style = (element as HTMLElement).style;
  if (style == null) return;
  for (const [name, value] of Object.entries(declarations)) style.setProperty(name, value);
}

export function paintCloudBlobHost(host: Element): Element | null {
  const mount = mountFor(host);
  if (mount == null) return null;
  injectCloudBlobOverlayStyle(mount.styleRoot);
  if (mount.sibling) {
    host.setAttribute(CAISRA_CLOUD_HOST_ATTR, "1");
    const parent = mount.container as HTMLElement;
    if (parent.style != null && parent.style.position === "") parent.style.position = "relative";
  }
  const agentId = hostIdentity(host);
  const color = hostColor(host);
  const paint = cloudBlobPaint(agentId, color);
  const sleeping = hostSleeping(host);
  const current = existingOverlay(mount, host);
  if (
    current != null
    && current.getAttribute("data-avatar-color") === paint.id
    && current.getAttribute("data-sleeping") === String(sleeping)
  ) {
    return current;
  }
  const wrapper = host.ownerDocument.createElement("div");
  const measured = sizePx(host);
  wrapper.innerHTML = cloudBlobSvgMarkup({
    id: `caisra-cloud-${paint.id}-${Math.abs(hashString(agentId))}`,
    agentId,
    color: paint.id,
    ...(measured == null ? {} : { sizePx: measured }),
    ...(sleeping ? { sleeping: true } : {}),
  });
  const next = wrapper.firstElementChild;
  if (next == null) throw new Error("cloud blob markup did not produce an element");
  next.setAttribute("data-sleeping", String(sleeping));
  setStyle(next, { display: "block", height: "100%", width: "100%", overflow: "visible", "pointer-events": "none" });
  if (mount.sibling) {
    setStyle(next, { position: "absolute", inset: "0", "z-index": "1" });
  }
  if (current != null) current.replaceWith(next);
  else if (mount.sibling) host.after(next);
  else mount.container.append(next);
  return next;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function syncCloudBlobMarks(root: ParentNode): number {
  const hosts = findPersonaAvatarHosts(root);
  let painted = 0;
  for (const host of hosts) {
    try {
      if (paintCloudBlobHost(host) != null) painted += 1;
    } catch (error) {
      console.warn(`${CLOUD_OVERLAY_LOG_TAG} could not paint a mark`, error);
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

export function injectCloudBlobOverlayStyle(root: Document | ShadowRoot): boolean {
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
  for (const ours of clone.querySelectorAll(`[${CAISRA_CLOUD_BLOB_ATTR}]`)) ours.remove();
  const markup = clone.outerHTML.replace(/\s+/g, " ");
  return markup.length > 400 ? `${markup.slice(0, 400)}…` : markup;
}

/**
 * One line in the renderer console so the real DOM can be read off a
 * screenshot instead of guessed: how many marks were painted, what the first
 * one looks like without our overlay, and what else in the page could be a
 * face if none was found.
 */
export function describeCloudBlobOverlay(doc: Document): string {
  const hosts = findPersonaAvatarHosts(doc);
  const marks = doc.querySelectorAll(".sand-grok-bot-mark").length;
  const painted = doc.querySelectorAll(`[${CAISRA_CLOUD_BLOB_ATTR}]`).length;
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
  return `${CLOUD_OVERLAY_LOG_TAG} ${parts.join(" ")}`;
}

export function installCloudBlobOverlay(
  doc: Document | undefined = pageDocument(),
  options: { readonly log?: (line: string) => void; readonly diagnosticDelayMs?: number } = {},
): { disconnect(): void } | null {
  const log = options.log ?? ((line: string) => console.info(line));
  if (doc == null) {
    if (typeof window !== "undefined") {
      window.addEventListener("DOMContentLoaded", () => {
        installCloudBlobOverlay(pageDocument(), options);
      }, { once: true });
    }
    return null;
  }
  let disconnected = false;
  let lastPainted = -1;
  const sync = (): void => {
    if (disconnected) return;
    const painted = syncCloudBlobMarks(doc);
    if (painted !== lastPainted) {
      lastPainted = painted;
      log(describeCloudBlobOverlay(doc));
    }
  };
  const Observer = doc.defaultView?.MutationObserver ?? globalThis.MutationObserver;
  const observer = new Observer(sync);
  const start = (): void => {
    if (disconnected) return;
    // At preload time the parser may not have produced <head> yet; the
    // stylesheet is retried from every sync until it lands.
    injectCloudBlobOverlayStyle(doc);
    const target = doc.documentElement ?? doc;
    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-avatar-color", "data-avatar-shape", "data-grok-state", "class", "style", "viewBox"],
    });
    sync();
    const delay = options.diagnosticDelayMs ?? 4000;
    if (delay > 0 && typeof setTimeout === "function") {
      setTimeout(() => {
        if (!disconnected && lastPainted <= 0) log(describeCloudBlobOverlay(doc));
      }, delay);
    }
  };
  try {
    injectCloudBlobOverlayStyle(doc);
  } catch (error) {
    console.warn(`${CLOUD_OVERLAY_LOG_TAG} stylesheet deferred`, error);
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return { disconnect() { disconnected = true; observer.disconnect(); } };
}

/** The preload must never fail because of the overlay: the bridges it exposes are what the window runs on. */
export function installCloudBlobOverlaySafely(): { disconnect(): void } | null {
  try {
    return installCloudBlobOverlay();
  } catch (error) {
    console.warn(`${CLOUD_OVERLAY_LOG_TAG} not installed`, error);
    return null;
  }
}
