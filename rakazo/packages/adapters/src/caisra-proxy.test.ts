import { describe, expect, it } from "vitest";
import type { CaisraSession } from "./caisra-account.js";
import { CaisraProxyFailure, type CaisraSessionStore, caisraProxyFetch } from "./caisra-proxy.js";

function memoryStore(initial?: CaisraSession): CaisraSessionStore & { writes: number } {
  let session = initial;
  return {
    writes: 0,
    async read() {
      return session;
    },
    async write(_accountId, next) {
      session = next;
      this.writes += 1;
    },
  };
}

/** A far end that answers 401 until a named token arrives, then 200. */
function upstream(accepts: string) {
  const seen: string[] = [];
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const token = new Headers(init.headers).get("authorization");
    seen.push(token ?? "");
    return token === `Bearer ${accepts}`
      ? new Response('{"ok":true}', { status: 200 })
      : new Response('{"error":"expired"}', { status: 401 });
  }) as unknown as typeof globalThis.fetch;
  return { fetchImpl, seen };
}

const REFRESHED = { code: 0, data: { accessToken: "access-2", refreshToken: "refresh-2" } };

/** Routes the refresh call to the account API and everything else upstream. */
function withRefresh(
  upstreamFetch: typeof globalThis.fetch,
  refresh: { body: unknown; status?: number },
  counter?: { calls: number },
): typeof globalThis.fetch {
  return (async (url: string, init: RequestInit) => {
    if (String(url).includes("/desktop/api/auth/refresh")) {
      if (counter) counter.calls += 1;
      return new Response(JSON.stringify(refresh.body), {
        status: refresh.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }
    return upstreamFetch(url, init);
  }) as unknown as typeof globalThis.fetch;
}

const PATH = "/v1/chat/completions";
const INIT: RequestInit = { method: "POST", body: "{}" };

describe("Caisra proxy", () => {
  it("sends the account's access token and returns the answer", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const { fetchImpl, seen } = upstream("access-1");
    const response = await caisraProxyFetch({
      accountId: "a",
      path: PATH,
      init: INIT,
      store,
      fetch: fetchImpl,
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(["Bearer access-1"]);
    expect(store.writes).toBe(0);
  });

  it("refuses without a session rather than calling out", async () => {
    const never = (() => {
      throw new Error("should not have been called");
    }) as unknown as typeof globalThis.fetch;
    await expect(
      caisraProxyFetch({
        accountId: "a",
        path: PATH,
        init: INIT,
        store: memoryStore(),
        fetch: never,
      }),
    ).rejects.toMatchObject({ failure: CaisraProxyFailure.NotConnected });
  });

  it("refreshes on a 401 and retries with the new token", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const { fetchImpl, seen } = upstream("access-2");
    const response = await caisraProxyFetch({
      accountId: "a",
      path: PATH,
      init: INIT,
      store,
      fetch: withRefresh(fetchImpl, { body: REFRESHED }),
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(["Bearer access-1", "Bearer access-2"]);
    expect(store.writes).toBe(1);
  });

  it("retries with a token another request already refreshed, spending no refresh", async () => {
    // The detail that stops one expiry becoming a stampede: a 401 is not by
    // itself a reason to refresh, because a sibling request may have just done
    // it. Re-read first, retry, and only then spend one.
    let session: CaisraSession = { accessToken: "access-1", refreshToken: "refresh-1" };
    let reads = 0;
    const store: CaisraSessionStore = {
      async read() {
        reads += 1;
        // Between the first send and the re-read, a sibling refreshed.
        if (reads === 2) session = { accessToken: "access-2", refreshToken: "refresh-2" };
        return session;
      },
      async write(_id, next) {
        session = next;
      },
    };
    const { fetchImpl, seen } = upstream("access-2");
    const counter = { calls: 0 };
    const response = await caisraProxyFetch({
      accountId: "a",
      path: PATH,
      init: INIT,
      store,
      fetch: withRefresh(fetchImpl, { body: REFRESHED }, counter),
    });
    expect(response.status).toBe(200);
    expect(seen).toEqual(["Bearer access-1", "Bearer access-2"]);
    expect(counter.calls).toBe(0);
  });

  it("shares one refresh between concurrent callers", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const { fetchImpl } = upstream("access-2");
    const counter = { calls: 0 };
    const fetchWithRefresh = withRefresh(fetchImpl, { body: REFRESHED }, counter);
    const results = await Promise.all(
      [0, 1, 2, 3].map(() =>
        caisraProxyFetch({
          accountId: "a",
          path: PATH,
          init: INIT,
          store,
          fetch: fetchWithRefresh,
        }),
      ),
    );
    expect(results.every((r) => r.status === 200)).toBe(true);
    // Four rejected requests, one refresh between them.
    expect(counter.calls).toBe(1);
  });

  it("keeps separate accounts' refreshes separate", async () => {
    const storeA = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const storeB = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const { fetchImpl } = upstream("access-2");
    const counter = { calls: 0 };
    const fetchWithRefresh = withRefresh(fetchImpl, { body: REFRESHED }, counter);
    await Promise.all([
      caisraProxyFetch({
        accountId: "a",
        path: PATH,
        init: INIT,
        store: storeA,
        fetch: fetchWithRefresh,
      }),
      caisraProxyFetch({
        accountId: "b",
        path: PATH,
        init: INIT,
        store: storeB,
        fetch: fetchWithRefresh,
      }),
    ]);
    expect(counter.calls).toBe(2);
  });

  it("reports a rejected refresh token as expired, not as a retryable fault", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "stale" });
    const { fetchImpl } = upstream("never");
    await expect(
      caisraProxyFetch({
        accountId: "a",
        path: PATH,
        init: INIT,
        store,
        fetch: withRefresh(fetchImpl, {
          body: { code: 40102, message: "Sign in again." },
          status: 401,
        }),
      }),
    ).rejects.toMatchObject({
      failure: CaisraProxyFailure.Expired,
      message: "Sign in again.",
    });
  });

  it("reports a server fault as retryable, so a run is not signed out over an outage", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const { fetchImpl } = upstream("never");
    await expect(
      caisraProxyFetch({
        accountId: "a",
        path: PATH,
        init: INIT,
        store,
        fetch: withRefresh(fetchImpl, { body: { code: 50000, message: "Try later." } }),
      }),
    ).rejects.toMatchObject({ failure: CaisraProxyFailure.Unavailable });
  });

  it("applies the account's own base URL, so configuration cannot redirect it", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const urls: string[] = [];
    const capture = (async (url: string) => {
      urls.push(String(url));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await caisraProxyFetch({
      accountId: "a",
      path: PATH,
      init: INIT,
      store,
      fetch: capture,
    });
    expect(urls[0]).toBe("https://api.claidor.com/api/proxy/v1/chat/completions");
  });

  it("surfaces a network fault as retryable rather than as a rejection", async () => {
    const store = memoryStore({ accessToken: "access-1", refreshToken: "refresh-1" });
    const broken = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof globalThis.fetch;
    await expect(
      caisraProxyFetch({ accountId: "a", path: PATH, init: INIT, store, fetch: broken }),
    ).rejects.toMatchObject({ failure: CaisraProxyFailure.Unavailable, message: "ECONNRESET" });
  });
});
