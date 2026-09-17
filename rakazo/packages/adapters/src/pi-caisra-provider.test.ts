import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import { afterEach, describe, expect, it } from "vitest";
import {
  CAISRA_PROVIDER_ID,
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
    expect(opus?.baseUrl).toBe("https://api.claidor.com/desktop/api/proxy/v1");
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

  it("signs in through the runtime's OAuth slot, not an api key", () => {
    // An api-key credential has nowhere to hold the refresh token or the
    // expiry, so a one-hour access token would sign the person out hourly.
    // The OAuth credential is {access, refresh, expires} and Models refreshes
    // it under its store lock, which is why this slot is the right one.
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const auth = caisraProvider()?.auth;
    expect(auth?.apiKey).toBeUndefined();
    expect(typeof auth?.oauth?.login).toBe("function");
    expect(typeof auth?.oauth?.refresh).toBe("function");
    // Their other sign-ins spend a person's own ChatGPT or Claude plan. A
    // Caisra account is billed by us, so it is not a subscription sign-in.
    expect(auth?.oauth?.isSubscription).toBe(false);
  });

  it("sends the account's access token and the proxy's base URL to a request", async () => {
    setEnv("CAISRA_MODELS", "claude-opus-5");
    const auth = await caisraProvider()?.auth?.oauth?.toAuth({
      type: "oauth",
      access: "access-1",
      refresh: "refresh-1",
      expires: Date.now() + 60_000,
    });
    expect(auth?.apiKey).toBe("access-1");
    expect(auth?.baseUrl).toBe("https://api.claidor.com/desktop/api/proxy/v1");
  });
});
