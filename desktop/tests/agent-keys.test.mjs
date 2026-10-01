/**
 * A key a person gives an agent through the chat's masked input (2 October 2026):
 * for a messaging connector it goes to the connector, as the upstream app did; for
 * any other service it becomes a secret in the computer's environment, named for
 * what it is, which the agent's commands use and the agent never sees; printed
 * values are blanked from what the agent reads.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(temporary, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", external: ["electron"], banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(temporary, { recursive: true, force: true }) };
}

test("a key is named for the service and what it is, and its value is blanked from command output", async () => {
  const { module, dispose } = await load("source/shared/box-secret-redaction.ts", "redaction");
  try {
    assert.equal(module.agentKeyEnvName("render", "api_key"), "RENDER_API_KEY");
    assert.equal(module.agentKeyEnvName("Render", "apiKey"), "RENDER_API_KEY");
    assert.equal(module.agentKeyEnvName("render", "RENDER_API_KEY"), "RENDER_API_KEY", "a field that already names the service is kept");
    assert.equal(module.agentKeyEnvName("open ai", "token"), "OPEN_AI_TOKEN");
    assert.equal(module.agentKeyEnvName("stripe", ""), "STRIPE_API_KEY");
    assert.equal(module.agentKeyEnvName("2fa", "code"), "KEY_2FA_CODE");
    assert.equal(module.agentKeyEnvName("sand", "token"), "USER_SAND_TOKEN", "a reserved prefix is not taken");
    module.setRedactedSecretValues(["rnd_abcdefghijklmnop", "short"]);
    assert.equal(module.redactSecretValues("Authorization: Bearer rnd_abcdefghijklmnop ok"), "Authorization: Bearer [secret] ok");
    assert.equal(module.redactSecretValues("short words stay"), "short words stay", "values under 8 characters are not blanked");
    module.setRedactedSecretValues([]);
    assert.equal(module.redactSecretValues("rnd_abcdefghijklmnop"), "rnd_abcdefghijklmnop");
  } finally { await dispose(); }
});

test("a messaging connector's key goes to the connector; any other becomes a secret on the computer, and the agent is told its name", async () => {
  const tool = await load("source/host/runner/tools/send-message-tool.ts", "send-message-tool");
  const ack = await load("source/host/runner/tools/sand-secret-request.ts", "secret-ack");
  try {
    assert.deepEqual(tool.module.secretTarget("slack", "botToken"), { kind: "channel-credential", platform: "slack", field: "botToken" });
    assert.deepEqual(tool.module.secretTarget("discord", "token"), { kind: "channel-credential", platform: "discord", field: "token" });
    assert.deepEqual(tool.module.secretTarget("render", "api_key"), { kind: "box-secret", name: "RENDER_API_KEY" });
    const said = ack.module.buildSecretProvidedAck({ label: "Render API key", target: { kind: "box-secret", name: "RENDER_API_KEY" } });
    assert.match(said, /stored on your computer as the environment variable RENDER_API_KEY; you never see the value/);
    assert.match(said, /carry on with the task right away: use it in your shell commands as "\$RENDER_API_KEY"/);
    assert.match(said, /Never echo or print it/);
    assert.match(ack.module.buildSecretProvidedAck({ label: "Slack token", target: { kind: "channel-credential" } }), /channel connector reads it/);
  } finally { await tool.dispose(); await ack.dispose(); }
});

test("the computer's environment carries the person's Secrets and the keys from chat, the person's winning a clash, and survives a restart", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-agent-keys-"));
  const { module, dispose } = await load("source/host/extensions/secrets/secrets-service.ts", "secrets-service");
  const redaction = await load("source/shared/box-secret-redaction.ts", "redaction-check");
  const applied = [];
  const make = () => new module.BoxSecretsApplier({
    applyToBox: async (_ctx, update) => { applied.push(update.env); },
    retryPolicy: { schedule: () => ({ elapsed: Promise.resolve(), dispose() {} }) },
    applyDeadline: { run: (fn) => fn(new AbortController().signal) },
    storePath: path.join(dir, "box-secrets.json"),
    log: () => {},
  });
  try {
    const applier = make();
    assert.equal(await applier.setAgentKey({}, "RENDER_API_KEY", "rnd_from_chat_12345"), true);
    assert.equal(applied.at(-1).RENDER_API_KEY, "rnd_from_chat_12345");
    assert.equal(applied.at(-1).CLOUD_AGENT_INJECTED_SECRET_NAMES, "RENDER_API_KEY");
    await applier.setSecrets({}, { GITHUB_TOKEN: "ghp_from_settings_1234", RENDER_API_KEY: "rnd_from_settings_999" });
    assert.deepEqual(applied.at(-1), { GITHUB_TOKEN: "ghp_from_settings_1234", RENDER_API_KEY: "rnd_from_settings_999", CLOUD_AGENT_INJECTED_SECRET_NAMES: "GITHUB_TOKEN,RENDER_API_KEY" }, "the person's Secrets win a clash; a Mac push does not drop the chat's keys");
    assert.deepEqual(applier.getStatus().keys, ["GITHUB_TOKEN", "RENDER_API_KEY"]);
    assert.equal(await applier.setAgentKey({}, "PATH", "x"), false, "a reserved name is refused");
    const file = path.join(dir, "agent-keys.json");
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { version: 1, secrets: { RENDER_API_KEY: "rnd_from_chat_12345" } });

    // A restarted host applies the chat's keys even before the Mac pushes anything.
    applied.length = 0;
    await rm(path.join(dir, "box-secrets.json"), { force: true });
    await make().applyPersisted({});
    assert.deepEqual(applied.at(-1), { RENDER_API_KEY: "rnd_from_chat_12345", CLOUD_AGENT_INJECTED_SECRET_NAMES: "RENDER_API_KEY" });
    // The shared module the shell tool reads blanks the applied values.
    assert.equal(typeof redaction.module.redactSecretValues, "function");
  } finally {
    await dispose(); await redaction.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("the shell tool and the await tool hand the agent blanked output", async () => {
  const shell = await readFile(path.join(repoRoot, "source/packages/agent/tools/core/shell/create-shell-tool.ts"), "utf8");
  assert.match(shell, /const stdout = redactSecretValues\(rawStdout\), stderr = redactSecretValues\(rawStderr\), interleavedOutput = redactSecretValues\(rawInterleavedOutput\);/);
  assert.match(shell, /stdout: redactSecretValues\(stdout\), stderr: redactSecretValues\(stderr\), interleavedOutput: redactSecretValues\(interleavedOutput\)/);
  const awaitTool = await readFile(path.join(repoRoot, "source/packages/agent/tools/core/await.ts"), "utf8");
  assert.match(awaitTool, /const content = redactSecretValues\(/);
  const routing = await readFile(path.join(repoRoot, "source/host/extensions/transcript/widget-responses.ts"), "utf8");
  assert.match(routing, /if \(target\.kind === "box-secret"\) return typeof target\.name === "string" && \(await storeAgentKey\(target\.name, value\)\);/);
  const extension = await readFile(path.join(repoRoot, "source/host/extensions/secrets/extension.ts"), "utf8");
  assert.match(extension, /registerAgentKeySink\(\(name, value\) => service\.setAgentKey\(requestContext, name, value\)\)/);
});
