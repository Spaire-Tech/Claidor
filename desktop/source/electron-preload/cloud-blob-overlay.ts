/// <reference lib="dom" />
import {
  CAISRA_CLOUD_BLOB_ATTR,
  CLOUD_BLOB_VIEWBOX,
  cloudBlobPaint,
  cloudBlobSvgMarkup,
} from "../shared/agent/cloud-blob-face.js";

export { CAISRA_CLOUD_BLOB_ATTR };

export const PERSONA_MARK_SELECTOR = [
  ".sand-grok-bot-mark",
  `svg[data-avatar-shape]`,
  `svg[viewBox="${CLOUD_BLOB_VIEWBOX}"]`,
].join(",");

const STYLE_ID = "caisra-cloud-blob-overlay";
const STYLE_TEXT = `
.sand-grok-bot-mark { position: relative; }
.sand-grok-bot-mark > :not([${CAISRA_CLOUD_BLOB_ATTR}]) { visibility: hidden !important; }
svg[viewBox="${CLOUD_BLOB_VIEWBOX}"]:not([${CAISRA_CLOUD_BLOB_ATTR}]) { visibility: hidden !important; }
[${CAISRA_CLOUD_BLOB_ATTR}] {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
}
.sand-grok-bot-mark > [${CAISRA_CLOUD_BLOB_ATTR}] {
  position: absolute;
  inset: 0;
}
@keyframes caisra-cloud-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4%); }
}
@keyframes caisra-cloud-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.08); }
}
[${CAISRA_CLOUD_BLOB_ATTR}] .caisra-cloud-blob__face {
  transform-box: fill-box;
  transform-origin: center;
  animation: caisra-cloud-bob 4.6s ease-in-out infinite;
}
[${CAISRA_CLOUD_BLOB_ATTR}] .caisra-cloud-blob__eyes {
  transform-box: fill-box;
  transform-origin: center;
  animation: caisra-cloud-blink 5.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  [${CAISRA_CLOUD_BLOB_ATTR}] .caisra-cloud-blob__face,
  [${CAISRA_CLOUD_BLOB_ATTR}] .caisra-cloud-blob__eyes { animation: none; }
}
`;

function skipHost(node: Element): boolean {
  if (node.getAttribute(CAISRA_CLOUD_BLOB_ATTR) === "1") return true;
  if (node.closest(`[${CAISRA_CLOUD_BLOB_ATTR}]`) != null) return true;
  if (node.closest(".sand-shared-room-avatar, .sand-group-avatar, [data-avatar-kind='photo']") != null) {
    return true;
  }
  if (node.matches("svg") && node.parentElement?.classList.contains("sand-grok-bot-mark") === true) {
    return true;
  }
  return false;
}

export function findPersonaAvatarHosts(root: ParentNode): Element[] {
  return [...root.querySelectorAll(PERSONA_MARK_SELECTOR)].filter((node) => !skipHost(node));
}

function hostIdentity(host: Element): string {
  return host.getAttribute("data-source-id")
    ?? host.closest("[data-source-id]")?.getAttribute("data-source-id")
    ?? host.getAttribute("data-agent-id")
    ?? host.closest("[data-agent-id]")?.getAttribute("data-agent-id")
    ?? host.getAttribute("data-avatar-color")
    ?? "persona";
}

function hostColor(host: Element): string | null {
  return host.getAttribute("data-avatar-color")
    ?? host.closest("[data-avatar-color]")?.getAttribute("data-avatar-color")
    ?? null;
}

function hostSleeping(host: Element): boolean {
  const state = host.getAttribute("data-grok-state")
    ?? host.querySelector("[data-grok-state]")?.getAttribute("data-grok-state")
    ?? "";
  return state === "sleeping" || state === "drowsy";
}

function existingOverlay(mount: Element): Element | null {
  return mount.querySelector(`:scope > [${CAISRA_CLOUD_BLOB_ATTR}]`);
}

function sizePx(host: Element): number | undefined {
  const width = Number.parseFloat(host.getAttribute("width") ?? "");
  if (Number.isFinite(width) && width > 0) return width;
  const styleWidth = (host as HTMLElement).style?.width;
  const parsed = styleWidth == null ? Number.NaN : Number.parseFloat(styleWidth);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function paintCloudBlobHost(host: Element): Element {
  const mount = host.classList.contains("sand-grok-bot-mark") ? host : host.parentElement ?? host;
  if (mount !== host && mount instanceof HTMLElement && mount.style.position === "") {
    mount.style.position = "relative";
  }
  const agentId = hostIdentity(host);
  const color = hostColor(host);
  const paint = cloudBlobPaint(agentId, color);
  const sleeping = hostSleeping(host);
  const current = existingOverlay(mount);
  if (
    current != null
    && current.getAttribute("data-avatar-color") === paint.id
    && current.getAttribute("data-sleeping") === String(sleeping)
  ) {
    return current;
  }
  const wrapper = mount.ownerDocument.createElement("div");
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
  if (mount !== host && host instanceof SVGSVGElement) {
    next.setAttribute("style", "position:absolute;inset:0;display:block;height:100%;width:100%;overflow:visible;pointer-events:none");
  }
  if (current != null) current.replaceWith(next);
  else mount.append(next);
  return next;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export function syncCloudBlobMarks(root: ParentNode): number {
  const hosts = findPersonaAvatarHosts(root);
  for (const host of hosts) paintCloudBlobHost(host);
  return hosts.length;
}

export function injectCloudBlobOverlayStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID) != null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLE_TEXT;
  (doc.head ?? doc.documentElement).append(style);
}

export function installCloudBlobOverlay(
  doc: Document | undefined = typeof document === "undefined" ? undefined : document,
): { disconnect(): void } | null {
  if (doc == null) return null;
  injectCloudBlobOverlayStyle(doc);
  const observer = new MutationObserver(() => {
    syncCloudBlobMarks(doc);
  });
  const start = (): void => {
    observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-avatar-color", "data-avatar-shape", "data-grok-state", "class", "viewBox"],
    });
    syncCloudBlobMarks(doc);
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return { disconnect() { observer.disconnect(); } };
}
