import { claidorProxyRequest, type ClaidorApiAuth } from "../../../shared/node/cursor-backend/claidor-api.js";
import { fetchWebPage, type WebFetchOptions, type WebFetchResult } from "../../../shared/node/web-fetch.js";

// The agent's `web_search` and `web_fetch` tools, behind the two seams the
// host composition already had (`production.ts`, `createWebSearch` and
// `createWebFetch`). Until 19 September 2026 both were Connect RPC calls on
// `aiserver.v1.AiService` that Claidor never served
// (`docs/product/capabilities-measured.md`).

export interface WebSearchDocument { readonly url: string; readonly title: string; readonly text: string }
export interface WebSearchAnswer { readonly answer: string; readonly documents: readonly WebSearchDocument[] }

// Search goes to Claidor's `web/search` door, which runs OpenAI's hosted
// search and meters it against the person's account
// (`server/polar/desktop/capabilities.py`).
export function createClaidorWebSearchService(options: ClaidorApiAuth & { readonly fetch?: typeof fetch }) {
  return async (_ctx: unknown, args: { searchTerm: string; explanation?: string }): Promise<WebSearchAnswer> => {
    const response = await claidorProxyRequest(options, "web/search", {
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      json: { query: args.searchTerm, ...(args.explanation === undefined ? {} : { explanation: args.explanation }) },
    });
    const body = (await response.json().catch(() => null)) as { answer?: unknown; documents?: unknown } | null;
    const documents = Array.isArray(body?.documents) ? body.documents : [];
    return {
      answer: typeof body?.answer === "string" ? body.answer : "",
      documents: documents.flatMap((document): WebSearchDocument[] => {
        if (document == null || typeof document !== "object" || typeof (document as { url?: unknown }).url !== "string") return [];
        const { url, title, text } = document as { url: string; title?: unknown; text?: unknown };
        return [{ url, title: typeof title === "string" ? title : "", text: typeof text === "string" ? text : "" }];
      }),
    };
  };
}

// Fetch stays on this machine: a public page needs no key and no meter, and
// no server of ours should learn which pages the person's agent reads.
export function createLocalWebFetchService(options: WebFetchOptions = {}) {
  return async (_ctx: unknown, url: string): Promise<WebFetchResult> => fetchWebPage(url, options);
}
