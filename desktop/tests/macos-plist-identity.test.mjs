import assert from "node:assert/strict";
import test from "node:test";

import { plistIdentityRewrites } from "../scripts/lib/macos-plist-identity.mjs";

const identity = { bundleId: "com.simeonlabs.simeon", name: "Simeon", year: 2026 };

test("the copyright line and permission prompts name Simeon; working values are only reported", () => {
  const { rewrites, reported } = plistIdentityRewrites({
    NSHumanReadableCopyright: "Copyright © 2026 SpaceXAI",
    NSCameraUsageDescription: "Grok Bot uses the camera for video calls.",
    NSMicrophoneUsageDescription: "Simeon uses the microphone to take your dictation.",
    SUFeedURL: "https://updates.cursor.sh/feed",
    CFBundleIdentifier: "com.simeonlabs.simeon",
  }, identity);
  assert.deepEqual(rewrites, {
    NSHumanReadableCopyright: "Copyright © 2026 SimeonLabs, Inc. All rights reserved.",
    NSCameraUsageDescription: "Simeon uses the camera for video calls.",
  });
  assert.deepEqual(reported, ["SUFeedURL"]);
});

test("a helper's bundle id follows the app's, keeping its helper suffix", () => {
  assert.deepEqual(plistIdentityRewrites({ CFBundleIdentifier: "com.anysphere.sand.helper.Renderer", CFBundleName: "Simeon Helper (Renderer)" }, { ...identity, role: "helper" }).rewrites,
    { CFBundleIdentifier: "com.simeonlabs.simeon.helper.Renderer" });
  assert.deepEqual(plistIdentityRewrites({ CFBundleIdentifier: "com.simeonlabs.simeon.helper" }, { ...identity, role: "helper" }).rewrites, {});
  // The main plist's id is set by the packager, never here.
  assert.deepEqual(plistIdentityRewrites({ CFBundleIdentifier: "com.anysphere.sand" }, identity).rewrites, {});
});

test("an ordinary word is never mistaken for the maker's name", () => {
  const { rewrites, reported } = plistIdentityRewrites({ NSAccessibilityUsageDescription: "Simeon moves the cursor to work on your screen." }, identity);
  assert.deepEqual(rewrites, {});
  assert.deepEqual(reported, []);
});
