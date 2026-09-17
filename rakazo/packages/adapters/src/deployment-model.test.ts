import { describe, expect, it } from "vitest";
import {
  CLAIDOR_DEFAULT_BASE_URL,
  CLAIDOR_DEFAULT_MODEL_ID,
  CLAIDOR_PROVIDER_ID,
  CLAIDOR_PROVIDER_NAME,
  claidorCatalog,
  resolveDeploymentModel,
} from "./deployment-model.js";

describe("resolveDeploymentModel", () => {
  it("pairs the deployment model key with the provider it belongs to", () => {
    const both = { OPENROUTER_API_KEY: "or-key", ANTHROPIC_API_KEY: "sk-ant-key" };
    expect(resolveDeploymentModel(both)).toEqual({
      provider: "openrouter",
      model: "openai/gpt-5.6-luna",
      key: "or-key",
    });
    // The whole point: switching the provider switches the key with it.
    expect(resolveDeploymentModel({ ...both, PI_DEFAULT_PROVIDER: "anthropic" })).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-5",
      key: "sk-ant-key",
    });
    // A provider with no key configured yields no key — never another vendor's.
    expect(
      resolveDeploymentModel({ OPENROUTER_API_KEY: "or-key", PI_DEFAULT_PROVIDER: "anthropic" }),
    ).toEqual({ provider: "anthropic", model: "claude-sonnet-5", key: undefined });
  });
});

describe("Claidor, when it is configured", () => {
  it("is the model service, and carries its address with its key", () => {
    // A key without a base URL would be a provider pointed at nothing, so the
    // two are returned together or not at all.
    expect(resolveDeploymentModel({ CLAIDOR_API_KEY: "claidor_pat_x" })).toEqual({
      provider: CLAIDOR_PROVIDER_ID,
      model: CLAIDOR_DEFAULT_MODEL_ID,
      key: "claidor_pat_x",
      baseUrl: CLAIDOR_DEFAULT_BASE_URL,
    });
  });

  it("wins over every other provider, whatever else is set", () => {
    // This is the product rule, not a preference: nobody using this deployment
    // enters an API key, so a stray OPENROUTER_API_KEY in the environment must
    // not quietly become the model somebody's work runs on.
    const resolved = resolveDeploymentModel({
      CLAIDOR_API_KEY: "claidor_pat_x",
      OPENROUTER_API_KEY: "or-key",
      ANTHROPIC_API_KEY: "sk-ant-key",
      PI_DEFAULT_PROVIDER: "anthropic",
      PI_DEFAULT_MODEL: "claude-opus-5",
    });
    expect(resolved.provider).toBe(CLAIDOR_PROVIDER_ID);
    expect(resolved.key).toBe("claidor_pat_x");
    expect(resolved.model).toBe(CLAIDOR_DEFAULT_MODEL_ID);
  });

  it("takes an operator's own address and model when given them", () => {
    expect(
      resolveDeploymentModel({
        CLAIDOR_API_KEY: "claidor_pat_x",
        CLAIDOR_API_BASE_URL: "http://127.0.0.1:8000/desktop/api/proxy/v1",
        CLAIDOR_MODEL: "gpt-5.6-luna",
      }),
    ).toEqual({
      provider: CLAIDOR_PROVIDER_ID,
      model: "gpt-5.6-luna",
      key: "claidor_pat_x",
      baseUrl: "http://127.0.0.1:8000/desktop/api/proxy/v1",
    });
  });

  it("leaves the bring-your-own-key providers alone when it is absent", () => {
    // The offline harness and the eval runner use them and must not need a
    // Claidor account to run, which is why the old path is kept rather than
    // deleted.
    const blank = resolveDeploymentModel({ CLAIDOR_API_KEY: "   ", OPENROUTER_API_KEY: "or-key" });
    expect(blank.provider).toBe("openrouter");
    expect(blank.baseUrl).toBeUndefined();
  });
});

describe("the menu Claidor serves", () => {
  it("is empty when Claidor is not this deployment's model service", () => {
    // So `models.list` falls back to Pi's own catalogue and the offline
    // harness still has models to choose from.
    expect(claidorCatalog({ OPENROUTER_API_KEY: "or-key" })).toEqual([]);
  });

  it("names the models in plain words, with no key to enter", () => {
    const menu = claidorCatalog({ CLAIDOR_API_KEY: "claidor_pat_x" });
    expect(menu.map((one) => one.id)).toEqual(["gpt-5.6-terra", "gpt-5.6-luna"]);
    expect(menu[0]?.label).toBe("Everyday");
    expect(menu[1]?.label).toBe("Quick");
    for (const entry of menu) {
      expect(entry.providerName).toBe(CLAIDOR_PROVIDER_NAME);
      // No `auth`, no `authHint`, no `signIn`: the catalogue entry shape has
      // fields for a key flow and this menu fills none of them, because there
      // is no key flow left to describe.
      expect(entry).not.toHaveProperty("auth");
      expect(entry).not.toHaveProperty("signIn");
      expect(entry.billing).toMatch(/allowance/);
    }
  });

  it("never lists Claude, because that wire cannot reach it", () => {
    // Claidor's catalogue has Claude, but an OpenAI-compatible client speaks
    // Chat Completions only and nothing in that proxy translates a Chat
    // Completions request into an Anthropic one. A menu offering it would
    // earn a 400 on the next request.
    const ids = claidorCatalog({ CLAIDOR_API_KEY: "claidor_pat_x" }).map((one) => one.id);
    expect(ids.some((id) => id.startsWith("claude"))).toBe(false);
  });

  it("keeps the configured model on its own menu, even off the standard list", () => {
    // Otherwise a deployment pinned to something unusual would show a menu
    // that excludes the model actually answering, which reads as a bug at the
    // exact moment somebody goes looking.
    const menu = claidorCatalog({
      CLAIDOR_API_KEY: "claidor_pat_x",
      CLAIDOR_MODEL: "gpt-6-astra",
    });
    expect(menu[0]?.id).toBe("gpt-6-astra");
    expect(menu.map((one) => one.id)).toContain("gpt-5.6-terra");
  });

  it("takes an operator's own list when given one", () => {
    expect(
      claidorCatalog({
        CLAIDOR_API_KEY: "claidor_pat_x",
        CLAIDOR_MODELS: " gpt-5.6-luna , ",
        CLAIDOR_MODEL: "gpt-5.6-luna",
      }).map((one) => one.id),
    ).toEqual(["gpt-5.6-luna"]);
  });
});
