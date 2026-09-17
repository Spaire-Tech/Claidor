import { describe, expect, it } from "vitest";
import { CAISRA_PROVIDER_ID } from "./pi-caisra-provider.js";

/**
 * Caisra has to be visible from every surface that asks what providers exist.
 *
 * Those surfaces do not share one catalog. Several modules each build their own
 * from the built-in providers plus some subset of the ones registered from
 * configuration, and the subsets differ. A provider added to one of them works
 * in that place and is silently missing everywhere else: absent from the model
 * picker, or present in the picker and refused at sign-in with "no OAuth
 * handler". Nothing type-checks or fails loudly, so this pins the behaviour at
 * the public entry points rather than the structure behind them.
 *
 * Configuration is set before the first call on purpose: each of those catalogs
 * caches on first use, so a test that called in before setting it would cache a
 * catalog without Caisra and then measure the cache.
 */
process.env.CAISRA_MODELS = "claude-opus-5, sees";
process.env.CAISRA_VISION_MODELS = "sees";

describe("Caisra is visible wherever providers are listed", () => {
  it("appears in the model picker", async () => {
    const { listPiCatalog } = await import("./pi-models.js");
    const entries = listPiCatalog().filter((entry) => entry.provider === CAISRA_PROVIDER_ID);
    expect(entries.map((entry) => entry.id)).toEqual(["claude-opus-5", "sees"]);
  });

  it("offers sign-in rather than a key field", async () => {
    const { listPiCatalog } = await import("./pi-models.js");
    const entry = listPiCatalog().find((item) => item.provider === CAISRA_PROVIDER_ID);
    // A person never types a Caisra key: the proxy holds the provider keys and
    // bills the account, so the only way in is the sign-in button.
    expect(entry?.auth).toBe("oauth");
    expect(entry?.oauthLabel).toBe("Sign in to Caisra");
    expect(entry?.signIn).toBe("auth-url");
    // Not a model subscription of the person's own, unlike every other
    // sign-in here, so it must not be presented as one.
    expect(entry?.subscription).toBe(false);
  });

  it("resolves an OAuth handler for sign-in", async () => {
    const { loadProviderOAuth } = await import("./pi-oauth.js");
    expect(typeof loadProviderOAuth(CAISRA_PROVIDER_ID)?.login).toBe("function");
  });

  it("is known to the vision lookup, so an image model is not treated as text-only", async () => {
    const { modelAcceptsImageInput } = await import("./model-vision.js");
    expect(modelAcceptsImageInput(CAISRA_PROVIDER_ID, "sees")).toBe(true);
    expect(modelAcceptsImageInput(CAISRA_PROVIDER_ID, "claude-opus-5")).toBe(false);
  });
});
