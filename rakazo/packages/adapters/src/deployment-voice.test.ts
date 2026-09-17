import { describe, expect, it } from "vitest";
import {
  DEFAULT_VOICE_PROVIDER_ID,
  hasDeploymentVoice,
  resolveDeploymentVoice,
} from "./deployment-voice.js";

// Every case passes its own env, so none of this depends on what the test
// runner happens to have set -- which it does: the suite runs with
// AGENT_RUNTIME=scripted, and an earlier version of the resolver read that
// from process.env and answered "scripted" to every question below.

describe("the voice this deployment speaks with", () => {
  it("is ElevenLabs, from the operator's key, with nobody asked for one", () => {
    expect(DEFAULT_VOICE_PROVIDER_ID).toBe("elevenlabs");
    expect(resolveDeploymentVoice({ ELEVENLABS_API_KEY: "sk-eleven" })).toEqual({
      provider: "elevenlabs",
      apiKey: "sk-eleven",
      voiceId: "",
    });
  });

  it("takes the voice id from the environment when one is given", () => {
    expect(
      resolveDeploymentVoice({ ELEVENLABS_API_KEY: "sk-eleven", ELEVENLABS_VOICE_ID: "rachel" })
        ?.voiceId,
    ).toBe("rachel");
    // VOICE_ID is the provider-neutral spelling and wins, so switching provider
    // does not mean renaming the variable that picks the voice.
    expect(
      resolveDeploymentVoice({
        ELEVENLABS_API_KEY: "sk-eleven",
        ELEVENLABS_VOICE_ID: "rachel",
        VOICE_ID: "adam",
      })?.voiceId,
    ).toBe("adam");
  });

  it("is nothing at all when no key is configured", () => {
    // Not a thrown error and not a half-configured provider: a deployment with
    // no voice key simply does not speak, and `status.configured` says so.
    expect(resolveDeploymentVoice({})).toBeNull();
    expect(resolveDeploymentVoice({ ELEVENLABS_API_KEY: "   " })).toBeNull();
    expect(hasDeploymentVoice({})).toBe(false);
  });

  it("switches provider and key together", () => {
    const every = {
      ELEVENLABS_API_KEY: "sk-eleven",
      CARTESIA_API_KEY: "sk-cartesia",
      FISH_AUDIO_API_KEY: "sk-fish",
    };
    expect(resolveDeploymentVoice({ ...every, VOICE_PROVIDER: "cartesia" })).toMatchObject({
      provider: "cartesia",
      apiKey: "sk-cartesia",
    });
    // A provider named without its own key gets none, never another vendor's.
    expect(
      resolveDeploymentVoice({ ELEVENLABS_API_KEY: "sk-eleven", VOICE_PROVIDER: "cartesia" }),
    ).toBeNull();
  });

  it("reads OpenAI's own key, so one key can serve models and speech", () => {
    expect(
      resolveDeploymentVoice({ OPENAI_API_KEY: "sk-openai", VOICE_PROVIDER: "openai" }),
    ).toMatchObject({ provider: "openai", apiKey: "sk-openai" });
    // ...but a voice-only key wins where the operator has separated them.
    expect(
      resolveDeploymentVoice({
        OPENAI_API_KEY: "sk-openai",
        VOICE_OPENAI_API_KEY: "sk-voice-only",
        VOICE_PROVIDER: "openai",
      })?.apiKey,
    ).toBe("sk-voice-only");
  });

  it("refuses a provider this build has no adapter for", () => {
    // A typo must read as "no voice configured" here rather than blow up later
    // inside somebody's call, where createVoiceProvider throws.
    expect(
      resolveDeploymentVoice({ ELEVENLABS_API_KEY: "sk-eleven", VOICE_PROVIDER: "elevnlabs" }),
    ).toBeNull();
  });

  it("speaks in the offline harness with no key at all", () => {
    expect(resolveDeploymentVoice({ AGENT_RUNTIME: "scripted" })).toMatchObject({
      provider: "scripted",
    });
  });
});
