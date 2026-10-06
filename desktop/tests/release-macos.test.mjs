import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseSigningIdentity,
  dittoZipArguments,
  entitlementsPlist,
  hdiutilCreateArguments,
  isHelperBinary,
  notarytoolSubmitArguments,
  readNotarizationResult,
  releaseFileNames,
  releaseRecord,
  releaseUrls,
  squirrelFeed,
} from "../scripts/lib/release-macos.mjs";

// 5 October 2026: the Mac release (scripts/release-macos.mjs) runs on a Mac
// only; what it is built from is checked here.

const FIND_IDENTITY = `Policy: Code Signing
  Matching identities
  1) 1111111111111111111111111111111111111111 "Apple Development: Someone (ABCDE12345)"
  2) 2222222222222222222222222222222222222222 "Developer ID Application: Someone (496QXRMJXG)"
     2 identities found
`;

test("the Developer ID Application certificate is chosen by team id, and the absence is explained", () => {
  assert.equal(chooseSigningIdentity(FIND_IDENTITY, { teamId: "496QXRMJXG" }), "Developer ID Application: Someone (496QXRMJXG)");
  assert.equal(chooseSigningIdentity(FIND_IDENTITY), "Developer ID Application: Someone (496QXRMJXG)");
  assert.throws(() => chooseSigningIdentity(FIND_IDENTITY, { teamId: "NOPE" }), /No Developer ID Application certificate for team NOPE/);
  assert.throws(() => chooseSigningIdentity("  0 valid identities found\n"), /Install one from developer.apple.com/);
  const two = FIND_IDENTITY + '  3) 3333 "Developer ID Application: Other (496QXRMJXG)"\n';
  assert.throws(() => chooseSigningIdentity(two, { teamId: "496QXRMJXG" }), /SIMEON_SIGN_IDENTITY/);
});

test("the entitlements carry what Electron and the app's calls need, the helpers less", () => {
  const app = entitlementsPlist();
  for (const key of ["cs.allow-jit", "cs.allow-unsigned-executable-memory", "cs.disable-library-validation", "device.audio-input", "device.camera"]) assert.ok(app.includes(`com.apple.security.${key}`), key);
  const helper = entitlementsPlist({ helper: true });
  assert.ok(helper.includes("cs.allow-jit"));
  assert.ok(!helper.includes("device.camera"));
  assert.ok(isHelperBinary("/x/Simeon.app/Contents/Frameworks/Simeon Helper (Renderer).app/Contents/MacOS/Simeon Helper (Renderer)"));
  assert.ok(!isHelperBinary("/x/Simeon.app/Contents/MacOS/Simeon"));
  assert.ok(!isHelperBinary("/x/Simeon.app/Contents/Resources/app.asar.unpacked/dist/native/tree-sitter.node"));
});

test("the command lines: zip with the .app at the root, a compressed read-only image, notarytool with the stored profile", () => {
  assert.deepEqual(dittoZipArguments("/d/Simeon.app", "/r/Simeon.zip"), ["-c", "-k", "--sequesterRsrc", "--keepParent", "/d/Simeon.app", "/r/Simeon.zip"]);
  const hdiutil = hdiutilCreateArguments("/w/dmg", "/r/Simeon.dmg");
  assert.equal(hdiutil[0], "create");
  assert.ok(hdiutil.includes("UDZO") && hdiutil.includes("Simeon"));
  assert.deepEqual(notarytoolSubmitArguments("/r/Simeon.dmg"), ["notarytool", "submit", "/r/Simeon.dmg", "--keychain-profile", "simeon-notary", "--wait", "--output-format", "json"]);
  assert.deepEqual(readNotarizationResult('{"id":"abc","status":"Accepted"}'), { id: "abc", status: "Accepted" });
  assert.throws(() => readNotarizationResult('{"id":"abc","status":"Invalid"}'), /did not accept .*notarytool log abc/);
  assert.throws(() => readNotarizationResult("not json"), /other than JSON/);
});

test("the release record and the feed name the files where they will be served", () => {
  assert.deepEqual(releaseFileNames("0.1.0"), { dmg: "Simeon-0.1.0-darwin-arm64.dmg", zip: "Simeon-0.1.0-darwin-arm64.zip" });
  const record = releaseRecord({ version: "0.1.0", pubDate: "2026-10-05T12:00:00.000Z", dmg: { sha256: "d", size: 1 }, zip: { sha256: "z", size: 2 }, notarization: { app: "a", dmg: "b" } });
  assert.equal(record.dmg.url, "https://simeonlabs.com/releases/0.1.0/Simeon-0.1.0-darwin-arm64.dmg");
  assert.equal(record.zip.url, "https://simeonlabs.com/releases/0.1.0/Simeon-0.1.0-darwin-arm64.zip");
  assert.equal(record.platform, "darwin-arm64");
  assert.deepEqual(releaseUrls(record).feed, "https://simeonlabs.com/releases/0.1.0/feed.json");
  // What the updater's parseUpdateResponse wants: url and name.
  assert.deepEqual(squirrelFeed({ version: "0.1.0", zipUrl: record.zip.url, pubDate: record.pub_date }), { url: record.zip.url, name: "0.1.0", pub_date: "2026-10-05T12:00:00.000Z" });
});
