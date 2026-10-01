/**
 * The call banner's page entry: the real ElevenLabs SDK over WebRTC, the
 * WebAudio ringer, and `window.simeonCall` from the preload. Bundled with
 * the SDK into `dist/voice-call/banner.js` (scripts/lib/clean-build.mjs).
 */
import { Conversation } from "@elevenlabs/client";

import { bannerElements, createBannerPainter } from "./banner-view.js";
import { createCallController, type ConversationLike, type SimeonCallBridge } from "./call-controller.js";
import { createRinger } from "./ring.js";

declare global {
  interface Window { readonly simeonCall?: SimeonCallBridge }
}

function run(): void {
  const bridge = window.simeonCall;
  if (bridge == null) throw new Error("The call banner has no bridge to the app.");
  const elements = bannerElements(document);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const painter = createBannerPainter(elements, { reducedMotion, seed: Math.random() * 10 });
  const ringer = createRinger();
  const controller = createCallController({
    bridge,
    elements,
    painter,
    ring: (cycles) => ringer.ring(cycles),
    stopRinging: () => ringer.stop(),
    now: () => Date.now(),
    requestFrame: (callback) => { window.requestAnimationFrame(callback); },
    setTimer: (run, ms) => { const timer = window.setTimeout(run, ms); return () => window.clearTimeout(timer); },
    observeHeight: (element, listener) => {
      let last = -1;
      new ResizeObserver(() => { const height = Math.ceil(element.getBoundingClientRect().height); if (height !== last) { last = height; listener(height); } }).observe(element);
    },
    startSession: async (options) => await Conversation.startSession({
      conversationToken: options.conversationToken,
      connectionType: "webrtc",
      // `language` is a code from ElevenLabs' own list ("en"); the SDK types it as that list.
      overrides: options.overrides as unknown as NonNullable<Parameters<typeof Conversation.startSession>[0]["overrides"]>,
      clientTools: options.clientTools,
      onConnect: options.onConnect,
      onDisconnect: (details) => options.onDisconnect({ reason: details.reason, ...("message" in details ? { message: details.message } : {}) }),
      onError: options.onError,
      onModeChange: options.onModeChange,
      onMessage: ({ message, source }) => options.onMessage({ message, source }),
    }) as unknown as ConversationLike,
  });
  void controller.start();
}

try { run(); } catch (error) {
  const detail = error instanceof Error ? error.message : String(error);
  void window.simeonCall?.log({ line: `banner failed to start: ${detail}` });
}
