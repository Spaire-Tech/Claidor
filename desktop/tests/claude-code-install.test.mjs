/**
 * Claude Code installed by the engine on the person's computer (9 November
 * 2026; docs/your-own-models.md, section 6): the computers run box2's pinned
 * image, not box/Dockerfile, so the engine installs Anthropic's own npm
 * package, pinned (2.1.311), into /var/tmp/simeon-claude-code the first
 * time it's needed. Against a stand-in `npm` that writes what the real
 * package's install leaves (the native program, an ELF file); the real
 * install was measured once by hand (4 s, 281 MB, `2.1.311 (Claude Code)`).
 */
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-install-"));
  const outfile = path.join(dir, "install.mjs");
  await build({ entryPoints: [path.join(repoRoot, "source/host/claude-code/claude-code-install.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent" });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

/** A stand-in `npm install --prefix DIR pkg@ver`: its mode in a file beside it; each call noted. */
const NPM = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const here = path.dirname(process.argv[1]);
const mode = (() => { try { return fs.readFileSync(path.join(here, "mode"), "utf8").trim(); } catch { return "ok"; } })();
const args = process.argv.slice(2);
fs.appendFileSync(path.join(here, "calls.log"), JSON.stringify({ args, env: { apiKey: process.env.ANTHROPIC_API_KEY ?? null, notifier: process.env.npm_config_update_notifier ?? null } }) + "\\n");
const prefix = args[args.indexOf("--prefix") + 1];
const bin = path.join(prefix, "node_modules", "@anthropic-ai", "claude-code", "bin");
const write = (body) => { fs.mkdirSync(bin, { recursive: true }); fs.writeFileSync(path.join(bin, "claude.exe"), body); fs.chmodSync(path.join(bin, "claude.exe"), 0o755); };
setTimeout(() => {
  if (mode === "fail") { process.stderr.write("npm error code E404\\nnpm error 404 Not Found\\n"); process.exit(1); }
  if (mode === "placeholder") { write('echo "Error: claude native binary not installed." >&2\\nexit 1\\n'); process.exit(0); }
  write(Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(4096)]));
  process.exit(0);
}, mode === "slow" ? 1500 : 50);
`;

async function setUp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-npm-"));
  const fakeBin = path.join(dir, "bin");
  await mkdir(fakeBin);
  await writeFile(path.join(fakeBin, "npm"), NPM);
  await chmod(path.join(fakeBin, "npm"), 0o755);
  const installDir = path.join(dir, "install");
  return {
    installDir,
    env: { PATH: `${fakeBin}:${process.env.PATH}`, HOME: dir, SIMEON_CLAUDE_CODE_DIR: installDir, ANTHROPIC_API_KEY: "sk-stand-in" },
    mode: (value) => writeFile(path.join(fakeBin, "mode"), value),
    calls: async () => (await readFile(path.join(fakeBin, "calls.log"), "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}

test("installed once, pinned, in its own folder; asked twice at once, npm runs once", async () => {
  const { module: install, dispose } = await load();
  const box = await setUp();
  try {
    const lines = [];
    assert.equal(install.isClaudeCodeInstalled(box.installDir), false);
    const [a, b] = await Promise.all([install.ensureClaudeCode({ env: box.env, log: (line) => lines.push(line) }), install.ensureClaudeCode({ env: box.env })]);
    assert.deepEqual([a, b], ["ready", "ready"]);
    const calls = await box.calls();
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].args, ["install", "--prefix", box.installDir, "--no-save", "--no-package-lock", "--loglevel=error", "@anthropic-ai/claude-code@2.1.311"]);
    // npm gets none of the engine's keys.
    assert.deepEqual(calls[0].env, { apiKey: null, notifier: "false" });
    assert.equal(install.isClaudeCodeInstalled(box.installDir), true);
    assert.equal((await readFile(path.join(box.installDir, "version"), "utf8")).trim(), "2.1.311");
    assert.match(lines[0], /^claude-code installed version=2\.1\.311 ms=\d+$/);
    // Found the next time, without npm.
    assert.equal(await install.ensureClaudeCode({ env: box.env }), "ready");
    assert.equal((await box.calls()).length, 1);
    // An older version in the folder is installed again.
    await writeFile(path.join(box.installDir, "version"), "2.0.1\n");
    assert.equal(install.isClaudeCodeInstalled(box.installDir), false);
    assert.equal(await install.ensureClaudeCode({ env: box.env }), "ready");
    assert.equal((await box.calls()).length, 2);
  } finally {
    await box.dispose();
    await dispose();
  }
});

test("a failed install is tried again; the package's placeholder isn't the program; a slow one says it's still being set up", async () => {
  const { module: install, dispose } = await load();
  const box = await setUp();
  try {
    const lines = [];
    await box.mode("fail");
    assert.equal(await install.ensureClaudeCode({ env: box.env, log: (line) => lines.push(line) }), "failed");
    assert.match(lines[0], /^claude-code install failed reason=npm exited 1: npm error 404 Not Found ms=\d+$/);
    await box.mode("placeholder");
    assert.equal(await install.ensureClaudeCode({ env: box.env, log: (line) => lines.push(line) }), "failed");
    assert.match(lines[1], /reason=no native program after install/);
    await box.mode("slow");
    assert.equal(await install.ensureClaudeCode({ env: box.env, waitMs: 100 }), "installing");
    // The install goes on; the next ask finds it (and npm ran once for both).
    assert.equal(await install.ensureClaudeCode({ env: box.env }), "ready");
    assert.equal((await box.calls()).length, 3);
    // A stand-in named for tests is always ready.
    assert.equal(await install.ensureClaudeCode({ env: { SIMEON_CLAUDE_CODE_BIN: "/bin/true" } }), "ready");
  } finally {
    await box.dispose();
    await dispose();
  }
});
