import { afterEach, describe, expect, it } from "vitest";
import {
  caisraAccountUrl,
  caisraSignInUrl,
  exchangeCaisraAuthCode,
  isAllowedCaisraCallback,
  refreshCaisraSession,
} from "./caisra-account.js";

const saved = process.env.CAISRA_ACCOUNT_URL;

afterEach(() => {
  if (saved === undefined) delete process.env.CAISRA_ACCOUNT_URL;
  else process.env.CAISRA_ACCOUNT_URL = saved;
});

/** A Caisra response: always JSON, and a failure is still HTTP 200. */
function answer(body: unknown, status = 200): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof globalThis.fetch;
}

const SESSION = { code: 0, data: { accessToken: "access-1", refreshToken: "refresh-1" } };

describe("Caisra account", () => {
  describe("callback allowlist", () => {
    it("accepts only the shapes Caisra will hand a code to", () => {
      expect(isAllowedCaisraCallback("http://127.0.0.1:53127/auth/callback")).toBe(true);
      expect(isAllowedCaisraCallback("http://localhost:1234/auth/callback")).toBe(true);
      expect(isAllowedCaisraCallback("caisra://auth/callback")).toBe(true);
    });

    it("refuses a hosted origin, which is why sign-in runs through the desktop app", () => {
      // Not an oversight: Caisra's allowlist has no https shape, so a web
      // origin never receives a code. Catching it here beats an opaque 400
      // after the browser has already opened.
      expect(isAllowedCaisraCallback("https://app.caisra.com/auth/callback")).toBe(false);
      expect(isAllowedCaisraCallback("http://192.168.1.10/auth/callback")).toBe(false);
      expect(isAllowedCaisraCallback("http://127.0.0.1/callback")).toBe(false);
      expect(isAllowedCaisraCallback("caisra://elsewhere/callback")).toBe(false);
      expect(isAllowedCaisraCallback("not a url")).toBe(false);
    });
  });

  describe("sign-in url", () => {
    it("carries the callback and the state", () => {
      const href = caisraSignInUrl({
        redirectUri: "http://127.0.0.1:53127/auth/callback",
        state: "state-1",
      });
      const url = new URL(href);
      expect(url.origin).toBe("https://api.claidor.com");
      expect(url.pathname).toBe("/desktop/login");
      expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:53127/auth/callback");
      expect(url.searchParams.get("state")).toBe("state-1");
    });

    it("refuses to open a browser at a callback that can never receive the code", () => {
      expect(() =>
        caisraSignInUrl({ redirectUri: "https://app.caisra.com/auth/callback", state: "s" }),
      ).toThrow(/loopback callback or its caisra:\/\/ deep link/);
    });

    it("honours a staging account URL", () => {
      process.env.CAISRA_ACCOUNT_URL = "https://staging.claidor.com";
      expect(caisraAccountUrl()).toBe("https://staging.claidor.com");
      expect(
        caisraSignInUrl({ redirectUri: "caisra://auth/callback", state: "s" }).startsWith(
          "https://staging.claidor.com/desktop/login",
        ),
      ).toBe(true);
    });

    it("refuses an account URL that is not absolute HTTP(S) or carries credentials", () => {
      process.env.CAISRA_ACCOUNT_URL = "api.claidor.com";
      expect(() => caisraAccountUrl()).toThrow(/absolute HTTP\(S\) URL/);
      process.env.CAISRA_ACCOUNT_URL = "https://user:pass@api.claidor.com";
      expect(() => caisraAccountUrl()).toThrow(/must not contain credentials/);
    });
  });

  describe("exchange", () => {
    it("returns the account's tokens", async () => {
      const session = await exchangeCaisraAuthCode("code-1", { fetch: answer(SESSION) });
      expect(session).toEqual({ accessToken: "access-1", refreshToken: "refresh-1" });
    });

    it("treats a non-zero code as a failure even though the status is 200", async () => {
      // The trap this whole module exists to avoid. A client reading
      // response.ok would store undefined as the account token and only find
      // out at the first model call, as a 401 from the proxy.
      const fetch = answer({ code: 40101, message: "That sign-in link has expired." }, 200);
      await expect(exchangeCaisraAuthCode("code-1", { fetch })).rejects.toThrow(
        "That sign-in link has expired.",
      );
    });

    it("rejects an empty code without a round trip", async () => {
      const never = (() => {
        throw new Error("should not have been called");
      }) as unknown as typeof globalThis.fetch;
      await expect(exchangeCaisraAuthCode("   ", { fetch: never })).rejects.toThrow(/no auth code/);
    });

    it("refuses a success envelope that carries no tokens", async () => {
      const fetch = answer({ code: 0, data: { accessToken: "", refreshToken: "r" } });
      await expect(exchangeCaisraAuthCode("code-1", { fetch })).rejects.toThrow(/no account token/);
    });

    it("names an outage rather than surfacing a parse error", async () => {
      const html = (async () =>
        new Response("<html>502</html>", { status: 502 })) as unknown as typeof globalThis.fetch;
      await expect(exchangeCaisraAuthCode("code-1", { fetch: html })).rejects.toThrow(
        /did not answer with JSON \(HTTP 502\)/,
      );
    });
  });

  describe("refresh", () => {
    it("returns a fresh pair", async () => {
      const session = await refreshCaisraSession("refresh-0", { fetch: answer(SESSION) });
      expect(session.accessToken).toBe("access-1");
    });

    it("marks a 401 as expired, so the caller signs in again instead of retrying", async () => {
      const fetch = answer({ code: 40102, message: "Sign in again." }, 401);
      await expect(refreshCaisraSession("refresh-0", { fetch })).rejects.toMatchObject({
        message: "Sign in again.",
        expired: true,
      });
    });

    it("leaves a non-401 failure retryable", async () => {
      const fetch = answer({ code: 50000, message: "Try later." }, 200);
      const error: Error & { expired?: boolean } = await refreshCaisraSession("refresh-0", {
        fetch,
      }).then(
        () => {
          throw new Error("refresh should have rejected");
        },
        (caught) => caught,
      );
      expect(error.message).toBe("Try later.");
      // Absent, not false: only a 401 means the account must sign in again.
      expect(error.expired).toBeUndefined();
    });
  });
});
