/**
 * Claude Code on the person's computer (9 November 2026;
 * docs/your-own-models.md, section 6): its own sign-in run in a terminal
 * (`script`), the link it prints handed back, the pasted code typed at its
 * prompt, who is signed in, signing out; the environment it gets (none of
 * the engine's variables); its credentials file kept out of Simeon's backup;
 * the image installing the version Anthropic publishes. Against a stand-in
 * `claude` that answers as Claude Code 2.1.311 does (its output read on 9
 * November 2026 with no network); nothing reaches claude.ai or Anthropic.
 */
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load(entry, name) {
  const dir = await mkdtemp(path.join(os.tmpdir(), `simeon-${name}-`));
  const outfile = path.join(dir, `${name}.mjs`);
  await build({ entryPoints: [path.join(repoRoot, entry)], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const LINK = "https://claude.com/cai/oauth/authorize?code=true&client_id=stand-in&response_type=code&redirect_uri=https%3A%2F%2Fplatform.claude.com%2Foauth%2Fcode%2Fcallback&state=s1";
const GOOD_CODE = "stand-in-code#s1";

/** A stand-in `claude`: `auth status`, `auth login --claudeai` (prompt, then the code), `auth logout`. It writes what it saw beside its config. */
const STAND_IN = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const dir = process.env.CLAUDE_CONFIG_DIR;
const file = path.join(dir, "stand-in-state.json");
const read = () => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; } };
const write = (s) => fs.writeFileSync(file, JSON.stringify(s));
const args = process.argv.slice(2).join(" ");
const seen = read();
seen.env = { config: process.env.CLAUDE_CONFIG_DIR ?? null, updater: process.env.DISABLE_AUTOUPDATER ?? null, apiKey: process.env.ANTHROPIC_API_KEY ?? null, oauth: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? null, gateway: process.env.SAND_GATEWAY_TOKEN ?? null, home: process.env.HOME ?? null };
seen.tty = process.stdin.isTTY === true;
write(seen);
if (args === "auth status") {
  const s = read();
  const out = s.signedIn ? { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "ada@example.com", subscriptionType: "max", orgName: "Ada's Organization" } : { loggedIn: false, authMethod: "none", apiProvider: "firstParty" };
  process.stdout.write(JSON.stringify(out, null, 2) + "\\n");
  process.exit(s.signedIn ? 0 : 1);
}
if (args === "auth logout") { const s = read(); s.signedIn = false; write(s); process.stdout.write("Successfully logged out from your Anthropic account.\\n"); process.exit(0); }
if (args === "auth login --claudeai") {
  const link = ${JSON.stringify(LINK)};
  process.stdout.write("Opening browser to sign in\\u2026\\n");
  process.stdout.write("If the browser didn't open, visit: \\u001b]8;;" + link + "\\u0007" + link + "\\u001b]8;;\\u0007\\n");
  process.stdout.write("Paste code here if prompted > ");
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (d) => {
    buf += d;
    const i = buf.search(/[\\r\\n]/);
    if (i < 0) return;
    const code = buf.slice(0, i);
    const s = read();
    s.codes = (s.codes ?? 0) + 1;
    if (code === ${JSON.stringify(GOOD_CODE)}) { s.signedIn = true; write(s); process.stdout.write("\\nLogin successful.\\n"); process.exit(0); }
    write(s); process.stdout.write("\\nOAuth error: Invalid code\\n"); process.exit(1);
  });
  return;
}
process.exit(2);
`;

async function standIn() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-claude-code-"));
  const bin = path.join(dir, "claude");
  // A CommonJS script: its `return` in the login branch is allowed at the top of the file.
  await writeFile(bin, STAND_IN);
  await chmod(bin, 0o755);
  const config = path.join(dir, "config");
  await mkdir(config);
  const env = { PATH: process.env.PATH, HOME: dir, LANG: "C.UTF-8", SIMEON_CLAUDE_CODE_BIN: bin, ANTHROPIC_API_KEY: "should-not-pass", CLAUDE_CODE_OAUTH_TOKEN: "should-not-pass", SAND_GATEWAY_TOKEN: "should-not-pass" };
  const state = async () => JSON.parse(await readFile(path.join(config, "stand-in-state.json"), "utf8"));
  return { dir, bin, config, env, state, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const hasScript = spawnSync("script", ["--version"]).status === 0;

test("Claude Code gets the machine's variables, its config folder and the updater off, never the engine's", async () => {
  const { module, dispose } = await load("source/host/claude-code/claude-code-account.ts", "claude-code-env");
  try {
    const env = module.claudeCodeEnv({ PATH: "/usr/bin", HOME: "/home/box", LANG: "fr_FR.UTF-8", ANTHROPIC_API_KEY: "k", ANTHROPIC_BASE_URL: "https://proxy", CLAUDE_CODE_OAUTH_TOKEN: "t", SAND_GATEWAY_TOKEN: "g", SAND_BACKEND_URL: "https://api", https_proxy: "http://proxy:3128" });
    assert.equal(env.CLAUDE_CONFIG_DIR, "/home/box/.claude");
    assert.equal(env.DISABLE_AUTOUPDATER, "1");
    assert.equal(env.LANG, "fr_FR.UTF-8");
    assert.equal(env.https_proxy, "http://proxy:3128");
    for (const name of ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL", "CLAUDE_CODE_OAUTH_TOKEN", "SAND_GATEWAY_TOKEN", "SAND_BACKEND_URL"]) assert.equal(env[name], undefined, name);
  } finally {
    await dispose();
  }
});

test("the sign-in link is read from Claude Code's terminal output, links' markers and colours removed", async () => {
  const { module, dispose } = await load("source/host/claude-code/claude-code-account.ts", "claude-code-link");
  try {
    const raw = `\u001b[2mOpening browser to sign in…\u001b[22m\r\nIf the browser didn't open, visit: \u001b]8;;${LINK}\u0007${LINK}\u001b]8;;\u0007\r\nPaste code here if prompted > `;
    const plain = module.plainTerminalText(raw);
    assert.ok(plain.includes("Paste code here if prompted"));
    assert.equal(module.signInLink(plain), LINK);
    assert.equal(module.signInLink("visit: http://claude.com/cai/oauth/authorize?x"), undefined, "never a page over http");
    assert.equal(module.signInLink("visit: https://evil.example/oauth/authorize?x"), undefined, "only Anthropic's own page");
    const status = module.parseClaudeCodeStatus({ loggedIn: true, authMethod: "claude.ai", email: "ada@example.com", subscriptionType: "max", orgName: "Ada's Organization" });
    assert.deepEqual(status, { installed: true, signedIn: true, method: "claude.ai", email: "ada@example.com", plan: "max", organization: "Ada's Organization" });
    assert.equal(module.parseClaudeCodeStatus({ loggedIn: false }).signedIn, false);
  } finally {
    await dispose();
  }
});

test("status: not installed, signed out, and after signing out", async () => {
  const { module, dispose } = await load("source/host/claude-code/claude-code-account.ts", "claude-code-status");
  const s = await standIn();
  try {
    const missing = await module.claudeCodeStatus({ env: { ...s.env, SIMEON_CLAUDE_CODE_BIN: path.join(s.dir, "nowhere") }, configDir: s.config });
    assert.deepEqual(missing, { installed: false, signedIn: false });
    const out = await module.claudeCodeStatus({ env: s.env, configDir: s.config });
    assert.equal(out.installed, true);
    assert.equal(out.signedIn, false);
    const seen = await s.state();
    assert.equal(seen.env.config, s.config);
    assert.equal(seen.env.updater, "1");
    assert.equal(seen.env.apiKey, null, "no Anthropic key of Simeon's reaches Claude Code");
    assert.equal(seen.env.oauth, null);
    assert.equal(seen.env.gateway, null, "no engine token reaches Claude Code");
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("the sign-in: the link, a wrong code refused, the right one signs in, then signing out", { skip: !hasScript && "no `script` on this machine" }, async () => {
  const { module, dispose } = await load("source/host/claude-code/claude-code-account.ts", "claude-code-sign-in");
  const s = await standIn();
  try {
    const signIn = new module.ClaudeCodeSignIn({ env: s.env, configDir: s.config, linkWaitMs: 10_000, finishWaitMs: 10_000 });
    assert.deepEqual(await signIn.finish(GOOD_CODE), { status: "failed", reason: "no_sign_in" }, "no code before a sign-in is started");

    const first = await signIn.start();
    assert.equal(first.url, LINK);
    assert.equal((await s.state()).tty, true, "Claude Code sees a terminal");
    assert.deepEqual(await signIn.finish("two\nlines"), { status: "failed", reason: "bad_code" });
    const wrong = await signIn.finish("wrong-code");
    assert.deepEqual(wrong, { status: "failed", reason: "refused" });
    assert.equal(signIn.waiting, false);

    await signIn.start();
    const done = await signIn.finish(`  ${GOOD_CODE}  `);
    assert.equal(done.status, "connected");
    assert.equal(done.account.email, "ada@example.com");
    assert.equal(done.account.plan, "max");
    assert.equal((await s.state()).codes, 2, "each code typed once at Claude Code's prompt");

    const after = await module.claudeCodeSignOut({ env: s.env, configDir: s.config });
    assert.equal(after.signedIn, false);
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("a new start ends the sign-in before it; cancel ends it", { skip: !hasScript && "no `script` on this machine" }, async () => {
  const { module, dispose } = await load("source/host/claude-code/claude-code-account.ts", "claude-code-restart");
  const s = await standIn();
  try {
    const signIn = new module.ClaudeCodeSignIn({ env: s.env, configDir: s.config, linkWaitMs: 10_000, finishWaitMs: 10_000 });
    await signIn.start();
    await signIn.start();
    assert.equal(signIn.waiting, true);
    signIn.cancel();
    assert.equal(signIn.waiting, false);
    assert.deepEqual(await signIn.finish(GOOD_CODE), { status: "failed", reason: "no_sign_in" });
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("Claude Code's credentials file is never copied into Simeon's backup", async () => {
  const { module, dispose } = await load("source/host/extensions/box-store-sync/box-store-sync-service.ts", "claude-code-backup");
  try {
    const home = module.buildBoxHomeCategory("/home/box");
    assert.ok(home.excludes.includes("home/box/.claude/.credentials.json"));
    assert.equal(module.BOX_HOME_CLAUDE_CODE_CREDENTIALS, "home/box/.claude/.credentials.json");
  } finally {
    await dispose();
  }
});

test("the image installs the Claude Code Anthropic publishes, at a pinned version, and the gateway answers its commands", async () => {
  const dockerfile = await readFile(path.join(repoRoot, "..", "box", "Dockerfile"), "utf8");
  const version = /ARG CLAUDE_CODE_VERSION=(\S+)/.exec(dockerfile)?.[1];
  assert.match(version ?? "", /^\d+\.\d+\.\d+$/);
  assert.ok(dockerfile.includes('npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"'));
  const protocol = await readFile(path.join(repoRoot, "source", "host", "gateway-protocol.ts"), "utf8");
  for (const command of ["claudeCodeStatus", "claudeCodeSignInStart", "claudeCodeSignInFinish", "claudeCodeSignInCancel", "claudeCodeSignOut"]) assert.ok(protocol.includes(`${command}:`), command);
});
