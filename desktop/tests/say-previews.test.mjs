/**
 * The engine's sentences the person reads outside a chat, in their language
 * (20 October 2026, docs/localization.md): the sidebar's previews, the
 * notifications, the approval cards' summaries, the Channels tab. The host
 * pins the person's language (`pinUserLanguageReader`); unpinned, or
 * English, every sentence reads as before. Where an app compares the
 * engine's words, its French is the engine's.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-say-previews-"));
  const outfile = path.join(dir, "say-previews.mjs");
  const contents = [
    'export { pinUserLanguageReader } from "./source/shared/user-language.ts";',
    'export { buildNotificationContent } from "./source/shared/os-notification.ts";',
    'export { getLastEntryFromTranscript, getLastMessageFromTranscript } from "./source/host/extensions/session/session-projection.ts";',
    'export { voiceCallLineText } from "./source/shared/voice-call/main-loop-voice.ts";',
    'export { genericSandShellAutoReviewSummary, summarizeSandSubagentAction } from "./source/host/runner/sand-auto-review-summaries.ts";',
    'export { connectorManifests, connectorManifestsForPerson } from "./source/shared/channels.ts";',
    'export { FRENCH } from "./source/shared/words/fr.ts";',
  ].join("\n");
  await build({ stdin: { contents, resolveDir: repoRoot, loader: "ts" }, outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const needsYou = { agentId: "a1", agentName: "Ada", kind: "agent-needs-input", reason: null, notifyEnabled: true, isHiddenFromSidebar: false, lastMessagePreview: null };
const card = (message) => [{ id: "m1", kind: "send-message", message }];

test("unpinned or English, every sentence reads as before", async () => {
  const { module, dispose } = await load();
  try {
    for (const language of [null, "en", "en-GB"]) {
      module.pinUserLanguageReader(language == null ? null : () => language);
      assert.deepEqual(module.buildNotificationContent(needsYou), { title: "Ada needs you", body: "Waiting for your input." });
      assert.equal(module.getLastMessageFromTranscript(card({ type: "widget", widget: {} })).preview, "Has a question for you");
      assert.equal(module.voiceCallLineText({ type: "voice-call", status: "ended", seconds: 109 }), "Voice chat · 01:49");
      assert.equal(module.genericSandShellAutoReviewSummary("host_shell"), "Run a command on your local computer");
      assert.deepEqual(module.connectorManifestsForPerson(language), module.connectorManifests());
    }
  } finally {
    module.pinUserLanguageReader(null);
    await dispose();
  }
});

test("in French: previews, notifications, summaries and the Channels tab", async () => {
  const { module, dispose } = await load();
  try {
    module.pinUserLanguageReader(() => "fr");
    assert.deepEqual(module.buildNotificationContent(needsYou), { title: "Ada a besoin de toi", body: "En attente de ta réponse." });
    assert.equal(module.buildNotificationContent({ ...needsYou, agentName: " ", kind: "agent-done", lastMessagePreview: null }).body, "Ouvre Simeon pour voir ce qu’il a fait.");
    assert.equal(module.getLastMessageFromTranscript(card({ type: "widget", widget: {} })).preview, "A une question pour toi");
    assert.equal(module.getLastMessageFromTranscript(card({ type: "attachment", url: "file:///x/report.pdf", file_name: "report.pdf" })).preview, "Pièce jointe envoyée · pdf");
    assert.equal(module.getLastMessageFromTranscript(card({ type: "connectors", connectors: ["Gmail", "Notion"] })).preview, "Connecter Gmail, Notion");
    assert.deepEqual(module.getLastEntryFromTranscript([{ id: "t1", kind: "message", content: "Done.", toAgent: { id: "b", name: "Theo" } }]), { kind: "text", text: "À Theo : Done." });
    assert.equal(module.voiceCallLineText({ type: "voice-call", status: "ended", seconds: 109 }), "Appel vocal · 01:49");
    assert.equal(module.summarizeSandSubagentAction({ action: "run", prompt: "Sort the inbox" }), "Exécuter une tâche sur l’ordinateur de Simeon : « Sort the inbox »");
    const slack = module.connectorManifestsForPerson("fr").find((manifest) => manifest.platform === "slack");
    assert.match(slack.blurb, /^Échange dans les canaux/);
    assert.equal(slack.credentialLabel, "jeton de l’app et jeton du bot");
    assert.equal(module.connectorManifests().find((manifest) => manifest.platform === "slack").blurb, "Message in Slack channels and DMs through a Socket Mode app the user owns.", "the agent's manifests stay English");
  } finally {
    module.pinUserLanguageReader(null);
    await dispose();
  }
});

test("where an app compares the engine's words, its French is the engine's", async () => {
  const { module, dispose } = await load();
  try {
    const french = (catalog, key) => JSON.parse(catalog).strings[key]?.localizations?.fr?.stringUnit?.value;
    const core = await readFile(path.join(repoRoot, "../ios/SimeonCore/Sources/SimeonCore/Resources/Localizable.xcstrings"), "utf8");
    // Approvals.summarySaysNothing (ios/SimeonCore) hides the two summaries that only say "run a command".
    assert.equal(french(core, "Run a command on your local computer"), module.FRENCH["approval.runOnLocalComputer"]);
    assert.equal(french(core, "Run a command on Simeon's computer"), module.FRENCH["approval.runOnSimeonComputer"]);
    // The iPhone's notification extension swaps its own words in for "Waiting for your input.".
    const extension = await readFile(path.join(repoRoot, "../ios/SimeonNotifications/Localizable.xcstrings"), "utf8");
    assert.equal(french(extension, "Waiting for your input."), module.FRENCH["notify.waiting"]);
  } finally {
    await dispose();
  }
});
