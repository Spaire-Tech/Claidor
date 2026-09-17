import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ContractRouterClient } from "@orpc/contract";
import type { AppContract } from "@rakazo/contracts";

/**
 * The client. One of them, and it is the fork's own contract.
 *
 * `AppContract` is `packages/contracts/src/rpc.ts` — bots, threads, routines,
 * connections, computer, memory, skills, voice, usage, onboarding. Typing the
 * client off the contract means a call that does not exist does not compile,
 * so nothing here can drift from what the server actually serves.
 *
 * This is deliberately a copy of the shape in `apps/web/src/lib/rpc.ts` and not
 * an import of it. Their file carries a branch for the desktop app's local
 * settings page that reaches through an Electron bridge we do not have, and
 * importing across apps would make their file part of our merge surface. The
 * part that matters — the link, the space header, the credentials — is eight
 * lines, and eight lines of ours beats a cross-app import of theirs.
 *
 * **The space header.** The fork scopes everything by space, passed as
 * `x-rakazo-space-id`. A request without it lands in the caller's default
 * space, which is right for a single-person account and is what Caisra is
 * today.
 */

const SPACE_KEY = "caisra:space-id";

type Context = { spaceId?: string | null };

/** The chosen space, or nothing. Storage can throw in a private window. */
export function selectedSpaceId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SPACE_KEY);
  } catch {
    return null;
  }
}

export function selectSpace(id: string): void {
  try {
    window.localStorage.setItem(SPACE_KEY, id);
  } catch {
    // A space that cannot be remembered still works for this session.
  }
}

/** Adds `x-rakazo-space-id` when a space is chosen, and removes it when not. */
export function withSpaceHeaders(
  init?: HeadersInit,
  spaceId: string | null = selectedSpaceId(),
): Headers {
  const headers = new Headers(init);
  if (spaceId) headers.set("x-rakazo-space-id", spaceId);
  else headers.delete("x-rakazo-space-id");
  return headers;
}

/**
 * Where the server is.
 *
 * In the browser it is wherever the app is served from. The founder's second
 * decision of 17 September is that the backend is hosted by us, and their
 * desktop app already takes `mode: "existing"` with a `serverUrl`, so when
 * Caisra ships as an app this is the one line that reads that setting.
 */
export function serverUrl(): string {
  if (typeof window === "undefined") return "http://127.0.0.1:5173/rpc";
  return `${window.location.origin}/rpc`;
}

const link = new RPCLink<Context>({
  url: serverUrl,
  fetch: (input, init, options) => {
    const request = new Request(input, init);
    const spaceId =
      options.context.spaceId === undefined ? selectedSpaceId() : options.context.spaceId;
    return fetch(request, {
      headers: withSpaceHeaders(request.headers, spaceId),
      // The session is a cookie the browser sign-in set.
      credentials: "include",
    });
  },
});

export const rpc: ContractRouterClient<AppContract, Context> = createORPCClient(link);
