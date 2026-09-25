import { isLoopbackIpHost, isPrivateIpHost } from "../../packages/agent/utils/ip.js";
// Web fetch, on the machine the agent runs on.
//
// Until 19 September 2026 the agent's `web_fetch` tool was a Connect RPC call
// (`aiserver.v1.AiService/RunWebFetch`) that asked a server to read the page
// for it. Claidor never served that route, and it should not: reading a
// public page needs no key, no meter and no middleman, and going through one
// would tell that middleman every address the person's agent reads. So the
// page is fetched from here, made into text, and handed to the tool in the
// shape it already understood — `{ content }` or `{ error, isTimeout }`
// (`packages/agent/tools/core/web-fetch.ts`, `WebFetchServiceResult`).

export const WEB_FETCH_TIMEOUT_MS = 30_000;
export const WEB_FETCH_MAX_BYTES = 5 * 1024 * 1024;
export const WEB_FETCH_MAX_CHARS = 100_000;
export const WEB_FETCH_USER_AGENT = "Simeon/1.0 (+https://simeonlabs.com)";
export const WEB_FETCH_MAX_REDIRECTS = 5;

// The tool checks the requested URL for localhost and private addresses
// before it runs; until 25 September 2026 this fetch then followed
// redirects on its own, so a public page could bounce the box's fetch to
// 127.0.0.1:1337 or a metadata address. Every hop is checked here, and the
// Mac-local hatch (which calls this directly) is covered the same way.
export function localNetworkRejection(url: URL): string | undefined {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const display = url.port.length > 0 ? `${host}:${url.port}` : host;
  if (host === "localhost" || host.endsWith(".localhost") || isLoopbackIpHost(host)) return `Cannot fetch from localhost (${display}): Simeon's fetch reaches public pages only.`;
  if (isPrivateIpHost(host)) return `Cannot fetch from a private address (${display}): Simeon's fetch reaches public pages only.`;
  return undefined;
}

export type WebFetchResult = { readonly content: string } | { readonly error: string; readonly isTimeout?: boolean };

export interface WebFetchOptions {
  /** Test seam: lets a fixture on 127.0.0.1 be fetched. Never set in production. */
  readonly allowLocalNetwork?: boolean;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxChars?: number;
}

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "details", "dialog", "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);
const DROP_TAGS = ["script", "style", "noscript", "template", "svg", "head", "iframe", "object", "canvas"];
const HEADING_MARKS: Record<string, string> = { h1: "# ", h2: "## ", h3: "### ", h4: "#### ", h5: "##### ", h6: "###### " };
const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»", middot: "·", bull: "•", trade: "™", euro: "€", pound: "£", yen: "¥", cent: "¢", deg: "°", times: "×", divide: "÷", frac12: "½", frac14: "¼", frac34: "¾" };

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1]?.toLowerCase() === "x" ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

// Markdown-ish text from HTML: headings keep their level, list items their
// bullet, links their address, and everything script-shaped is dropped. Not
// a parser — a page is text with tags in it, and the tags that matter for
// reading are the block boundaries.
export function htmlToText(html: string, baseUrl?: string): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let body = html;
  for (const tag of DROP_TAGS) body = body.replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), " ");
  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi, (_whole, attributes: string, inner: string) => {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attributes);
    const target = (href?.[1] ?? href?.[2] ?? href?.[3] ?? "").trim();
    const label = inner.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (target.length === 0 || target.startsWith("#") || /^javascript:/i.test(target)) return ` ${label} `;
    let absolute = target;
    if (baseUrl !== undefined) {
      try { absolute = new URL(target, baseUrl).toString(); } catch { absolute = target; }
    }
    return label.length === 0 ? ` ${absolute} ` : ` [${label}](${absolute}) `;
  });
  body = body.replace(/<(\/?)([a-z][a-z0-9-]*)\b[^>]*>/gi, (_whole, closing: string, rawTag: string) => {
    const tag = rawTag.toLowerCase();
    if (tag === "br") return "\n";
    if (tag === "hr") return "\n---\n";
    if (!BLOCK_TAGS.has(tag)) return "";
    if (closing === "") {
      if (tag in HEADING_MARKS) return `\n\n${HEADING_MARKS[tag]}`;
      if (tag === "li") return "\n- ";
      if (tag === "td" || tag === "th") return " | ";
      return "\n";
    }
    return tag in HEADING_MARKS || tag === "p" || tag === "tr" ? "\n\n" : "\n";
  });
  let text = decodeHtmlEntities(body)
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const title = titleMatch?.[1] === undefined ? "" : decodeHtmlEntities(titleMatch[1]).replace(/\s+/g, " ").trim();
  if (title.length > 0 && !text.startsWith(title)) text = `${title}\n\n${text}`;
  return text;
}

function contentTypeOf(response: Response): { readonly mime: string; readonly charset: string } {
  const header = response.headers.get("content-type") ?? "";
  const [mimePart = "", ...params] = header.split(";");
  const charset = params.map((part) => part.trim()).find((part) => /^charset=/i.test(part))?.slice("charset=".length).replace(/^["']|["']$/g, "") ?? "utf-8";
  return { mime: mimePart.trim().toLowerCase(), charset };
}

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (response.body == null) return new Uint8Array(await response.arrayBuffer());
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done || value === undefined) break;
    const room = maxBytes - total;
    if (value.byteLength >= room) {
      chunks.push(value.subarray(0, Math.max(0, room)));
      total = maxBytes;
      await reader.cancel().catch(() => undefined);
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.byteLength; }
  return out;
}

export async function fetchWebPage(url: string, options: WebFetchOptions = {}): Promise<WebFetchResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: `"${url}" is not a URL.` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: `Only http and https addresses can be fetched (got ${parsed.protocol}).` };
  }
  const timeoutMs = options.timeoutMs ?? WEB_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? WEB_FETCH_MAX_BYTES;
  const maxChars = options.maxChars ?? WEB_FETCH_MAX_CHARS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const rejectHop = (url: URL): string | undefined => options.allowLocalNetwork === true ? undefined : localNetworkRejection(url);
  try {
    const firstRejection = rejectHop(parsed);
    if (firstRejection !== undefined) return { error: firstRejection };
    let current = parsed;
    let response: Response;
    let hops = 0;
    for (;;) {
      response = await (options.fetch ?? fetch)(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": WEB_FETCH_USER_AGENT, accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.5" },
      });
      const location = response.headers.get("location");
      if (response.status < 300 || response.status >= 400 || location == null) break;
      await response.body?.cancel().catch(() => undefined);
      if (++hops > WEB_FETCH_MAX_REDIRECTS) return { error: `${parsed.hostname} redirected more than ${WEB_FETCH_MAX_REDIRECTS} times.` };
      let next: URL;
      try { next = new URL(location, current); } catch { return { error: `${current.hostname} redirected to an address that is not a URL.` }; }
      if (next.protocol !== "http:" && next.protocol !== "https:") return { error: `${current.hostname} redirected to ${next.protocol}, which cannot be fetched.` };
      const rejection = rejectHop(next);
      if (rejection !== undefined) return { error: `${current.hostname} redirected to ${next.hostname}. ${rejection}` };
      current = next;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return { error: `${parsed.hostname} answered ${response.status}${response.statusText ? ` ${response.statusText}` : ""}.` };
    }
    const { mime, charset } = contentTypeOf(response);
    const bytes = await readBounded(response, maxBytes);
    let decoded: string;
    try {
      decoded = new TextDecoder(charset).decode(bytes);
    } catch {
      decoded = new TextDecoder("utf-8").decode(bytes);
    }
    const isHtml = mime === "text/html" || mime === "application/xhtml+xml" || (mime === "" && /<\s*(html|body|!doctype)/i.test(decoded.slice(0, 2048)));
    if (!isHtml && !mime.startsWith("text/") && !/[/+]json$/.test(mime) && !/[/+]xml$/.test(mime)) {
      return { error: `${parsed.hostname} returned ${mime || "an unknown type"}, which is not text.` };
    }
    const text = isHtml ? htmlToText(decoded, response.url || current.toString()) : decoded.trim();
    if (text.length === 0) return { error: "The page had no readable text." };
    return { content: text.length > maxChars ? `${text.slice(0, maxChars)}\n\n[truncated at ${maxChars} characters]` : text };
  } catch (error) {
    if (controller.signal.aborted) return { error: `Fetching ${parsed.hostname} took longer than ${Math.round(timeoutMs / 1000)} seconds.`, isTimeout: true };
    return { error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}
