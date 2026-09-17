import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, describe, expect, it } from "vitest";
import {
  CAISRA_PROVIDER_ID,
  CAISRA_UNAUTHENTICATED_KEY,
  caisraBaseUrl,
  caisraProvider,
  registerCaisraProvider,
} from "./pi-caisra-provider.js";

const ENV_KEYS = [
  "CAISRA_MODELS",
  "CAISRA_MODELS_URL",
  "CAISRA_VISION_MODELS",
  "CAISRA_CONTEXT_WINDOW",
  "CAISRA_MAX_TOKENS",
] as const;

const saved = new Map<string, string | undefined>();
for (const key of ENV_KEYS) saved.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = saved.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("Caisra model provider", () => {
  it("stays absent when no Caisra models are configured", () => {
    setEnv("CAISRA_MODELS", undefined);
    expect(caisraProvider()).toBeUndefined();

    // Blank and whitespace-only values are configuration noise, not a model id.
    setEnv("CAISRA_MODELS", "");
    expect(caisraProvider()).toBeUndefined();
    setEnv("CAISRA_MODELS", "  ,  ");
    expect(caisraProvider()).toBeUndefined();
  });

  it("registers the configured models against the proxy", () => {
    setEnv("CAISRA_MODELS", "claude-opus-5, gpt-5.6-luna");
    const models = registerCaisraProvider(builtinModels());
    const opus = models.getModel(CAISRA_PROVIDER_ID, "claude-opus-5");
    expect(opus?.baseUrl).toBe("https://api.claidor.com/api/proxy/v1");
    expect(models.getModel(CAISRA_PROVIDER_ID, "gpt-5.6-luna")).toBeDefined();
  });

  it("leaves the built-in providers alone", () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const models = registerCaisraProvider(builtinModels());
    expect(models.getModel("anthropic", "claude-opus-5")).toBeDefined();
  });

  it("never declares reasoning support on the completions wire", () => {
    // OpenAI answers 400 when reasoning_effort arrives with function tools on
    // /v1/chat/completions. An agent always carries tools, so declaring it here
    // would fail every tool-holding turn rather than degrade.
    setEnv("CAISRA_MODELS", "gpt-5.6-luna");
    const model = registerCaisraProvider(builtinModels()).getModel(
      CAISRA_PROVIDER_ID,
      "gpt-5.6-luna",
    );
    expect(model?.reasoning).toBe(false);
    expect(model?.api).toBe("openai-completions");
    const compat = model?.compat as { supportsReasoningEffort?: boolean } | undefined;
    expect(compat?.supportsReasoningEffort).toBe(false);
  });

  it("bills nothing locally, because the proxy meters", () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const model = registerCaisraProvider(builtinModels()).getModel(
      CAISRA_PROVIDER_ID,
      "claude-opus-5",
    );
    expect(model?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  it("marks only the declared vision models as accepting images", () => {
    setEnv("CAISRA_MODELS", "sees, blind");
    setEnv("CAISRA_VISION_MODELS", "sees");
    const models = registerCaisraProvider(builtinModels());
    expect(models.getModel(CAISRA_PROVIDER_ID, "sees")?.input).toContain("image");
    expect(models.getModel(CAISRA_PROVIDER_ID, "blind")?.input).not.toContain("image");
  });

  it("rejects a base URL that is not absolute HTTP(S), or carries credentials", () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    setEnv("CAISRA_MODELS_URL", "api.claidor.com/v1");
    expect(() => caisraBaseUrl()).toThrow(/absolute HTTP\(S\) URL/);
    setEnv("CAISRA_MODELS_URL", "ftp://api.claidor.com/v1");
    expect(() => caisraBaseUrl()).toThrow(/absolute HTTP\(S\) URL/);
    // A key in the URL would reach logs and proxies; the bearer is per user.
    setEnv("CAISRA_MODELS_URL", "https://user:pass@api.claidor.com/v1");
    expect(() => caisraBaseUrl()).toThrow(/must not contain credentials/);
  });

  it("refuses a token limit that is not a positive integer", () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    setEnv("CAISRA_CONTEXT_WINDOW", "-1");
    expect(() => caisraProvider()).toThrow(/positive integer/);
    setEnv("CAISRA_CONTEXT_WINDOW", "lots");
    expect(() => caisraProvider()).toThrow(/positive integer/);
  });

  it("hands the signed-in account's token to the proxy when one is stored", async () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const resolve = caisraProvider()?.auth?.apiKey?.resolve;
    const resolved = await resolve?.({
      ctx: {},
      signal: new AbortController().signal,
      credential: { key: "account-token" },
    } as never);
    expect(resolved?.auth.apiKey).toBe("account-token");
    expect(resolved?.auth.baseUrl).toBe("https://api.claidor.com/api/proxy/v1");
  });

  it("still resolves before sign-in, so the models do not vanish from the picker", async () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const resolve = caisraProvider()?.auth?.apiKey?.resolve;
    const resolved = await resolve?.({ ctx: {}, signal: new AbortController().signal } as never);
    // Models hides every model of a provider whose auth resolves to undefined,
    // which would empty the picker the user signs in from. The placeholder is
    // not a working bearer; the proxy answers 401 and that is explainable.
    expect(resolved?.auth.apiKey).toBe(CAISRA_UNAUTHENTICATED_KEY);
    expect(resolved?.auth.apiKey).not.toMatch(/^sk-|^claidor_/);
  });
});
