/**
 * A cloud agent's coding on the person's own computer, in Claude Code on
 * their own Claude plan (11 November 2026, as the upstream app's, at the
 * founder's word). The upstream app's cloud agents cloned the repository,
 * made a branch, coded, pushed it and opened the pull request in their
 * maker's machines; here the computer does each step, and the card reads the
 * branch, the pull request and the changes back.
 *
 * Only stand-ins: a local bare repository is GitHub's copy, a script is `gh`,
 * a function is Claude Code, an object is Simeon Labs' server. Nothing
 * reaches GitHub, claude.ai, Anthropic or the server.
 */
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function load() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-coding-agents-"));
  const outfile = path.join(dir, "coding.mjs");
  await build({ entryPoints: [path.join(repoRoot, "tests/fixtures/coding-agents-entry.ts")], outfile, bundle: true, format: "esm", platform: "node", target: "node22", logLevel: "silent", banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const module = await import(`${pathToFileURL(outfile).href}?${Date.now()}`);
  return { module, dispose: () => rm(dir, { recursive: true, force: true }) };
}

const quiet = () => {};
const SESSION = "5f0e7c3a-9a1b-4c2d-8e3f-0a1b2c3d4e5f";

/** GitHub's copy (a bare repository with one commit on main), a home of its own, and `gh` as a script that speaks to it. */
async function stage() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-coding-stage-"));
  const home = path.join(dir, "home");
  const origin = path.join(dir, "origin.git");
  const seed = path.join(dir, "seed");
  const env = { PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: "1" };
  execFileSync("mkdir", ["-p", home, seed]);
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: { ...env, GIT_AUTHOR_NAME: "Seed", GIT_AUTHOR_EMAIL: "seed@example.com", GIT_COMMITTER_NAME: "Seed", GIT_COMMITTER_EMAIL: "seed@example.com" }, encoding: "utf8" });
  git(dir, "init", "--bare", "-q", "-b", "main", origin);
  git(seed, "init", "-q", "-b", "main");
  await writeFile(path.join(seed, "README.md"), "Demo\n");
  git(seed, "add", ".");
  git(seed, "commit", "-q", "-m", "Seed");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");
  const calls = path.join(dir, "gh-calls.log");
  const prFile = path.join(dir, "pr.json");
  const gh = path.join(dir, "gh");
  await writeFile(gh, `#!/bin/sh
echo "$*" >> ${JSON.stringify(calls)}
case "$1 $2" in
  "repo clone") exec git clone -q ${JSON.stringify(origin)} "$4" ;;
  "pr view") if [ -f ${JSON.stringify(prFile)} ]; then cat ${JSON.stringify(prFile)}; exit 0; else echo "no pull requests found for branch" >&2; exit 1; fi ;;
  "pr create") cat > ${JSON.stringify(path.join(dir, "pr-body.txt"))}; printf '%s' '{"url":"https://github.com/simeonlabs/demo/pull/7","number":7,"state":"OPEN","isDraft":false}' > ${JSON.stringify(prFile)}; echo "https://github.com/simeonlabs/demo/pull/7"; exit 0 ;;
  "auth status") exit 0 ;;
  "api user") echo '{"login":"octo","id":42,"name":"Octo Cat"}'; exit 0 ;;
esac
exit 0
`);
  await chmod(gh, 0o755);
  return {
    dir, home, origin, env: { ...env, SIMEON_GH_BIN: gh, SIMEON_CODE_ROOT: path.join(dir, "code") },
    ghCalls: async () => (await readFile(calls, "utf8").catch(() => "")).trim().split("\n").filter(Boolean),
    originLog: (branch) => execFileSync("git", ["log", "--format=%s%x09%ae", branch], { cwd: origin, encoding: "utf8" }).trim(),
    dispose: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Claude Code as a function: it writes a file and commits it, as it would in the checkout. */
function claudeThatCommits(stageEnv, file = "hello.txt") {
  const seen = [];
  const run = async (input) => {
    seen.push(input);
    await writeFile(path.join(input.cwd, file), "Hello\n");
    execFileSync("git", ["add", file], { cwd: input.cwd, env: stageEnv });
    execFileSync("git", ["commit", "-q", "-m", `Add ${file}`], { cwd: input.cwd, env: stageEnv });
    return { kind: "done", sessionId: SESSION, text: "Added the greeting; the tests pass.", turns: 3 };
  };
  return { run, seen };
}

const job = (extra = {}) => ({
  id: "job-1", bcId: "bc-1", name: "Add a greeting", repoUrl: "https://github.com/simeonlabs/demo", baseBranch: "main", modelId: "",
  conversation: [{ role: "user", text: "Add a greeting file." }], work: {}, attempts: 1, ...extra,
});
const account = async () => ({ connected: true, login: "octo", id: 42, name: "Octo Cat" });
const choice = () => ({ model: "opus", effort: "high" });

test("the small parts: the repository, the branch, the diff, the words still unanswered, the code gh prints, the limit's time", async () => {
  const { module, dispose } = await load();
  try {
    assert.deepEqual(module.gitHubRepoOf("https://github.com/simeonlabs/demo"), { owner: "simeonlabs", name: "demo" });
    assert.deepEqual(module.gitHubRepoOf("github.com/simeonlabs/demo.git"), { owner: "simeonlabs", name: "demo" });
    assert.deepEqual(module.gitHubRepoOf("git@github.com:simeonlabs/demo.git"), { owner: "simeonlabs", name: "demo" });
    assert.deepEqual(module.gitHubRepoOf("simeonlabs/demo"), { owner: "simeonlabs", name: "demo" });
    assert.equal(module.gitHubRepoOf("https://gitlab.com/simeonlabs/demo"), undefined, "only GitHub");
    assert.equal(module.gitHubRepoOf("https://github.com/simeonlabs/demo/tree/main"), undefined);

    assert.equal(module.branchNameFor("Fix the login redirect on Safari!", "3f2a"), "simeon/fix-the-login-redirect-on-safari-3f2a", "as the upstream's cursor/<what it is>-<4 hex>");
    assert.equal(module.branchNameFor("", "0000"), "simeon/work-0000");
    assert.match(module.branchNameFor("Café crème"), /^simeon\/cafe-creme-[0-9a-f]{4}$/);

    assert.deepEqual(module.numstat("40\t5\tsrc/login.ts\n-\t-\tlogo.png\n2\t2\tsrc/login.test.ts\n"), [
      { path: "src/login.ts", added: 40, removed: 5 }, { path: "logo.png", added: 0, removed: 0 }, { path: "src/login.test.ts", added: 2, removed: 2 },
    ]);

    const conversation = [{ role: "user", text: "Fix it." }, { role: "assistant", text: "Fixed." }, { role: "user", text: "Add a test." }, { role: "user", text: "And a note." }];
    assert.equal(module.unansweredWords(conversation), "Add a test.\n\nAnd a note.");
    assert.match(module.wholeExchange(conversation), /<message from="person">\nFix it\.\n<\/message>[\s\S]*<message from="you">\nFixed\.[\s\S]*The person now says:\n\nAdd a test\.\n\nAnd a note\.$/);
    assert.equal(module.wholeExchange([{ role: "user", text: "Fix it." }]), "Fix it.");

    // gh 2.89's own words.
    assert.deepEqual(module.deviceCodeFrom("! First copy your one-time code: ABCD-12EF\nOpen this URL to continue in your web browser: https://github.com/login/device\n"), { code: "ABCD-12EF", url: "https://github.com/login/device" });
    assert.deepEqual(module.deviceCodeFrom("! First copy your one-time code: ab12-cd34\n- Press Enter to open github.com in your browser... "), { code: "AB12-CD34", url: "https://github.com/login/device" });
    assert.equal(module.deviceCodeFrom("Welcome"), undefined);

    assert.equal(module.limitWords(Date.UTC(2026, 10, 12, 15, 40)), "15:40 UTC on 12 November");
    assert.equal(module.withoutTokens("remote: ghp_abcdefghijklmnopqrstuvwx1234 denied"), "remote: *** denied");

    const home = module.buildBoxHomeCategory("/home/box");
    assert.ok(home.excludes.includes("home/box/.config/gh/hosts.yml"), "GitHub's sign-in stays on the computer, as Claude's");
    assert.ok(home.excludes.includes("home/box/code/**"), "the checkouts are never copied into Simeon's backup");
  } finally {
    await dispose();
  }
});

test("a launch's turn: cloned, a branch from main, Claude Code in the checkout on the chosen model and effort, pushed, the pull request opened, the changes counted", async () => {
  const { module, dispose } = await load();
  const s = await stage();
  try {
    const claude = claudeThatCommits(s.env);
    const reported = [];
    const outcome = await module.runCodingJob(job(), { choice, account, env: s.env, runClaude: claude.run, onWork: (work) => reported.push({ ...work }), log: quiet });
    assert.equal(outcome.kind, "done", JSON.stringify(outcome));
    assert.equal(outcome.text, "Added the greeting; the tests pass.");
    const work = outcome.work;
    assert.match(work.branchName, /^simeon\/add-a-greeting-[0-9a-f]{4}$/);
    assert.equal(work.baseBranch, "main");
    assert.equal(reported[0].branchName, work.branchName, "the branch reaches the card before Claude Code starts");
    assert.equal(work.prUrl, "https://github.com/simeonlabs/demo/pull/7");
    assert.equal(work.prNumber, 7);
    assert.equal(work.prState, "open");
    assert.equal(work.commitCount, 1);
    assert.deepEqual(work.files, [{ path: "hello.txt", added: 1, removed: 0 }]);
    assert.deepEqual([work.filesChanged, work.linesAdded, work.linesRemoved], [1, 1, 0]);
    assert.equal(work.sessionId, SESSION);

    // Claude Code: in the checkout, on the person's model and effort, its own tools allowed, a new session, the brief added to its own.
    const input = claude.seen[0];
    assert.equal(input.model, "opus");
    assert.equal(input.effort, "high");
    assert.equal(input.resume, undefined);
    assert.equal(input.cwd, path.join(s.dir, "code", "bc-1", "repo"));
    assert.equal(input.prompt, "Add a greeting file.");
    assert.ok(input.allowedTools.includes("Bash") && input.allowedTools.includes("Edit"));
    assert.match(input.brief, /checkout of simeonlabs\/demo on the branch simeon\/add-a-greeting-[0-9a-f]{4}, made from main/);
    assert.match(input.brief, /Don't push, don't change branches and don't open a pull request/);
    assert.match(input.brief, /tests fail and you can't fix them, don't commit the broken part/);

    // GitHub's copy has the branch, by the person's GitHub identity; the pull request goes from it to main, with Claude Code's summary.
    assert.match(s.originLog(work.branchName), /^Add hello\.txt\t42\+octo@users\.noreply\.github\.com/m);
    const calls = await s.ghCalls();
    assert.ok(calls.some((call) => call.startsWith("repo clone simeonlabs/demo ")));
    assert.ok(calls.some((call) => call === `pr create --repo simeonlabs/demo --base main --head ${work.branchName} --title Add a greeting --body-file -`), calls.join("\n"));
    assert.match(await readFile(path.join(s.dir, "pr-body.txt"), "utf8"), /^Added the greeting; the tests pass\.\n\n---\nMade by Simeon, with Claude Code\.$/);

    // The follow-up: the same checkout and branch, Claude Code's session resumed with only the new words, the pull request updated rather than opened again.
    const claude2 = claudeThatCommits(s.env, "test.txt");
    const next = await module.runCodingJob(job({
      id: "job-2",
      conversation: [{ role: "user", text: "Add a greeting file." }, { role: "assistant", text: "Added the greeting; the tests pass." }, { role: "user", text: "Add a test too." }],
      work: { branchName: work.branchName, baseBranch: "main", sessionId: SESSION, prUrl: work.prUrl },
    }), { choice, account, env: s.env, runClaude: claude2.run, log: quiet });
    assert.equal(next.kind, "done", JSON.stringify(next));
    assert.equal(claude2.seen[0].resume, SESSION);
    assert.equal(claude2.seen[0].prompt, "Add a test too.");
    assert.equal(next.work.branchName, work.branchName);
    assert.equal(next.work.commitCount, 2);
    assert.equal(next.work.filesChanged, 2);
    assert.equal((await s.ghCalls()).filter((call) => call.startsWith("pr create")).length, 1, "one pull request, updated by the push");
    assert.match(s.originLog(work.branchName), /^Add test\.txt/);
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("a turn whose session is gone starts a new one with the whole exchange; one that commits nothing opens no pull request", async () => {
  const { module, dispose } = await load();
  const s = await stage();
  try {
    const seen = [];
    const outcome = await module.runCodingJob(job({
      conversation: [{ role: "user", text: "Look at the login." }, { role: "assistant", text: "It redirects twice." }, { role: "user", text: "Why?" }],
      work: { sessionId: SESSION },
    }), {
      choice, account, env: s.env, log: quiet,
      runClaude: async (input) => { seen.push(input); return input.resume !== undefined ? { kind: "no_session" } : { kind: "done", sessionId: "6f0e7c3a-9a1b-4c2d-8e3f-0a1b2c3d4e5f", text: "The guard runs twice.", turns: 1 }; },
    });
    assert.equal(outcome.kind, "done");
    assert.deepEqual(seen.map((input) => input.resume), [SESSION, undefined]);
    assert.match(seen[1].prompt, /<message from="you">\nIt redirects twice\.[\s\S]*The person now says:\n\nWhy\?$/);
    assert.equal(outcome.work.commitCount, 0);
    assert.equal(outcome.work.prUrl, undefined);
    assert.equal(outcome.work.sessionId, "6f0e7c3a-9a1b-4c2d-8e3f-0a1b2c3d4e5f");
    assert.ok(!(await s.ghCalls()).some((call) => call.startsWith("pr ")), "nothing pushed, no pull request");
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("the stops: Claude not chosen, GitHub not connected, not GitHub, the plan's limit (paused, with when), Claude signed out, the person's Stop", async () => {
  const { module, dispose } = await load();
  const s = await stage();
  try {
    const never = async () => { throw new Error("Claude Code must not run"); };
    let outcome = await module.runCodingJob(job(), { choice: () => undefined, account, env: s.env, runClaude: never, log: quiet });
    assert.deepEqual([outcome.kind, outcome.retryable], ["failed", false]);
    assert.match(outcome.reason, /Claude isn't connected[\s\S]*Settings › AI Models/);

    outcome = await module.runCodingJob(job(), { choice, account: async () => ({ connected: false }), env: s.env, runClaude: never, log: quiet });
    assert.match(outcome.reason, /GitHub isn't connected on the box/);

    outcome = await module.runCodingJob(job({ repoUrl: "https://gitlab.com/simeonlabs/demo" }), { choice, account, env: s.env, runClaude: never, log: quiet });
    assert.match(outcome.reason, /Only GitHub repositories/);

    const until = Date.UTC(2030, 10, 12, 15, 40);
    outcome = await module.runCodingJob(job(), { choice, account, env: s.env, log: quiet, runClaude: async () => ({ kind: "limited", sessionId: SESSION, until, said: "usage limit reached" }) });
    assert.deepEqual([outcome.kind, outcome.retryable], ["failed", false]);
    assert.equal(outcome.reason, "Claude's plan limit was reached, so the work is paused. It resets at 15:40 UTC on 12 November; a reply after that carries on where it stopped.");
    assert.equal(outcome.work.limitedUntilMs, until);
    assert.equal(outcome.work.sessionId, SESSION, "the reply after the limit resumes the same session");

    let signedOut = 0;
    outcome = await module.runCodingJob(job(), { choice, account, env: s.env, log: quiet, onSignedOut: () => { signedOut += 1; }, runClaude: async () => ({ kind: "signed_out", said: "Please run /login" }) });
    assert.match(outcome.reason, /Claude isn't signed in on the computer any more/);
    assert.equal(signedOut, 1, "AI Models is told, as after an agent's turn");

    const stop = new AbortController();
    outcome = await module.runCodingJob(job(), { choice, account, env: s.env, log: quiet, signal: stop.signal, runClaude: async () => { stop.abort(); return { kind: "aborted", sessionId: SESSION }; } });
    assert.equal(outcome.reason, "Cancelled by the person while it ran.");
    assert.equal(outcome.retryable, false);
  } finally {
    await s.dispose();
    await dispose();
  }
});

test("the runner claims a turn, keeps the lease with what it found, stops when the person asks, reports, and asks again right after", async () => {
  const { module, dispose } = await load();
  try {
    const calls = [];
    const queue = [{ ...job(), id: "job-1" }, { ...job(), id: "job-2" }];
    let cancel = false;
    const server = {
      claim: async (runner) => { calls.push(["claim", runner]); return queue.shift() ?? null; },
      heartbeat: async (id, runner, work) => { calls.push(["heartbeat", id, work?.branchName]); return { cancelRequested: cancel }; },
      complete: async (id, runner, body) => { calls.push(["complete", id, body.result, body.messages, body.work.prUrl]); },
      fail: async (id, runner, body) => { calls.push(["fail", id, body.reason, body.retryable]); },
    };
    let busySeen = false;
    const runner = new module.CodingRunner({
      server, runnerName: "computer-test", heartbeatIntervalMs: 5, claimIntervalMs: 60_000, log: quiet,
      run: async (claimed, signal, onWork) => {
        busySeen = runner.isBusy();
        onWork({ branchName: "simeon/x-0000" });
        if (claimed.id === "job-1") return { kind: "done", text: "Done.", work: { prUrl: "https://github.com/o/r/pull/1" } };
        cancel = true;
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
        return { kind: "failed", reason: "Cancelled by the person while it ran.", retryable: false };
      },
    });
    runner.kick();
    for (let i = 0; i < 200 && runner.isBusy(); i += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(runner.isBusy(), false);
    assert.equal(busySeen, true, "the computer counts as busy while a turn runs");
    assert.deepEqual(calls.filter((call) => call[0] !== "heartbeat"), [
      ["claim", "computer-test"],
      ["complete", "job-1", "Done.", [{ role: "assistant", text: "Done." }], "https://github.com/o/r/pull/1"],
      ["claim", "computer-test"],
      ["fail", "job-2", "Cancelled by the person while it ran.", false],
      ["claim", "computer-test"],
    ]);
    assert.ok(calls.some((call) => call[0] === "heartbeat" && call[1] === "job-2" && call[2] === "simeon/x-0000"), "the heartbeat carries what was found so far");
    runner.stop();
  } finally {
    await dispose();
  }
});

test("the computer's server: the person's own credential, the four routes, `{job: null}` read as nothing", async () => {
  const { module, dispose } = await load();
  try {
    const seen = [];
    const server = module.createComputerServer({
      getBackendUrl: () => "https://api.simeonlabs.test",
      getAccessToken: async () => "box-token",
      fetchImpl: async (url, init) => {
        seen.push([url, init.headers.Authorization, JSON.parse(init.body)]);
        const answer = url.endsWith("/claim") ? { job: null } : url.endsWith("/heartbeat") ? { id: "j", status: "running", cancelRequested: true } : { id: "j", status: "done" };
        return new Response(JSON.stringify(answer), { status: 200 });
      },
    });
    assert.equal(await server.claim("computer-1"), null);
    assert.deepEqual(await server.heartbeat("j/1", "computer-1", { branchName: "b" }), { cancelRequested: true });
    await server.complete("j", "computer-1", { result: "ok", messages: [], work: {} });
    await server.fail("j", "computer-1", { reason: "no", retryable: false });
    assert.deepEqual(seen.map(([url, auth]) => [url, auth]), [
      ["https://api.simeonlabs.test/desktop/api/cloud-agents/computer/claim", "Bearer box-token"],
      ["https://api.simeonlabs.test/desktop/api/cloud-agents/computer/jobs/j%2F1/heartbeat", "Bearer box-token"],
      ["https://api.simeonlabs.test/desktop/api/cloud-agents/computer/jobs/j/complete", "Bearer box-token"],
      ["https://api.simeonlabs.test/desktop/api/cloud-agents/computer/jobs/j/fail", "Bearer box-token"],
    ]);
    assert.deepEqual(seen[1][2], { runner: "computer-1", work: { branchName: "b" } });
  } finally {
    await dispose();
  }
});

// The cloud agent's conversation in the apps (13 November 2026): what Claude Code says between its tools is kept as
// the turn's updates, sent to the server apart from the work, and read back as lines.
test("what the cloud agent says along the way: kept per turn without the answer, sent as the report's updates, read back as the conversation's lines", async () => {
  const { module, dispose } = await load();
  const s = await stage();
  try {
    // The small parts: empty and repeated words are left out, the oldest dropped, the answer itself is not an update.
    assert.equal(module.assistantWords({ type: "assistant", message: { content: [{ type: "text", text: "Reading " }, { type: "tool_use", name: "Bash" }, { type: "text", text: "the code." }] } }), "Reading the code.");
    assert.equal(module.assistantWords({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } }), "");
    assert.equal(module.assistantWords({ type: "user", message: { content: [{ type: "text", text: "no" }] } }), "");
    let kept = module.withUpdate([], "  One.  ", 1);
    kept = module.withUpdate(kept, "One.", 2);
    kept = module.withUpdate(kept, "   ", 3);
    assert.deepEqual(kept, [{ text: "One.", atMs: 1 }]);
    let many = [];
    for (let index = 0; index < module.UPDATES_KEPT + 5; index += 1) many = module.withUpdate(many, `line ${index}`, index);
    assert.equal(many.length, module.UPDATES_KEPT);
    assert.equal(many[0].text, "line 5");
    assert.equal(module.withUpdate([], "x".repeat(module.UPDATE_MAX_LENGTH + 50), 1)[0].text.length, module.UPDATE_MAX_LENGTH);
    assert.deepEqual(module.withoutAnswer([{ text: "One.", atMs: 1 }, { text: "Done.", atMs: 2 }], " Done. "), [{ text: "One.", atMs: 1 }]);
    assert.deepEqual(module.withoutAnswer([{ text: "One.", atMs: 1 }], "Done."), [{ text: "One.", atMs: 1 }]);

    // A turn: Claude Code speaks twice between its tools, then answers. The updates reach the card's report as it works; the answer isn't one of them.
    const claude = claudeThatCommits(s.env);
    const speaking = async (input) => {
      input.onEvent({ type: "assistant", message: { content: [{ type: "text", text: "Reading the repository first." }] } });
      input.onEvent({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } });
      input.onEvent({ type: "assistant", message: { content: [{ type: "text", text: "Writing the greeting file." }] } });
      const outcome = await claude.run(input);
      input.onEvent({ type: "assistant", message: { content: [{ type: "text", text: outcome.text }] } });
      return outcome;
    };
    const reported = [], first = [];
    let clock = 1_000;
    const outcome = await module.runCodingJob(job(), { choice, account, env: s.env, runClaude: speaking, onWork: (work) => reported.push(structuredClone(work)), onFirstWords: (words) => first.push(words), log: quiet, now: () => (clock += 1) });
    assert.equal(outcome.kind, "done", JSON.stringify(outcome));
    assert.deepEqual(outcome.work.updates.map((update) => update.text), ["Reading the repository first.", "Writing the greeting file."]);
    assert.ok(outcome.work.updates.every((update) => update.atMs > 1_000));
    assert.ok(reported.some((work) => work.updates?.length === 1 && work.updates[0].text === "Reading the repository first."), "the first words reach the server's next heartbeat before the turn ends");

    // Its first words of the turn are told apart, once (its "on it", the chat's "Message from"), and the brief asks for them.
    assert.deepEqual(first, ["Reading the repository first."]);
    assert.match(module.codingBrief({ owner: "o", name: "r" }, "simeon/x-0000", "main"), /Before anything else, answer in one short sentence, as a teammate who was just handed the task would: that you're on it and what you'll look at first/);

    // The follow-up's turn starts with none of the last turn's updates.
    const quietClaude = claudeThatCommits(s.env, "test.txt");
    const next = await module.runCodingJob(job({
      id: "job-2",
      conversation: [{ role: "user", text: "Add a greeting file." }, { role: "assistant", text: "Added the greeting; the tests pass." }, { role: "user", text: "Add a test too." }],
      work: { branchName: outcome.work.branchName, baseBranch: "main", sessionId: SESSION, prUrl: outcome.work.prUrl, updates: outcome.work.updates },
    }), { choice, account, env: s.env, runClaude: quietClaude.run, log: quiet });
    assert.equal(next.kind, "done", JSON.stringify(next));
    assert.equal(next.work.updates, undefined);

    // The computer's server: the updates travel beside the work, never inside it.
    const seen = [];
    const server = module.createComputerServer({
      getBackendUrl: () => "https://api.simeonlabs.test",
      getAccessToken: async () => "box-token",
      fetchImpl: async (url, init) => { seen.push([url.split("/").at(-1), JSON.parse(init.body)]); return new Response(JSON.stringify({ id: "j", status: "running" }), { status: 200 }); },
    });
    const updates = [{ text: "Reading the repository first.", atMs: 1_001 }];
    await server.heartbeat("j", "computer-1", { branchName: "b", updates });
    await server.complete("j", "computer-1", { result: "ok", messages: [], work: { branchName: "b", updates } });
    await server.fail("j", "computer-1", { reason: "no", retryable: false, work: { branchName: "b", updates } });
    await server.heartbeat("j", "computer-1", { branchName: "b" });
    assert.deepEqual(seen, [
      ["heartbeat", { runner: "computer-1", work: { branchName: "b" }, updates }],
      ["complete", { runner: "computer-1", result: "ok", messages: [], work: { branchName: "b" }, updates }],
      ["fail", { runner: "computer-1", reason: "no", retryable: false, work: { branchName: "b" }, updates }],
      ["heartbeat", { runner: "computer-1", work: { branchName: "b" } }],
    ]);

    // The apps' lines: the asker's prompt, the updates (the server's `update-` rows), each turn's answer; empty rows left out.
    const conversation = [
      { text: "Add a greeting file.", type: 1, bubbleId: "job-1-user", createdAt: "1000" },
      { text: "Reading the repository first.", type: 2, bubbleId: "update-job-1-0", createdAt: 1001 },
      { text: "   ", type: 2, bubbleId: "update-job-1-1" },
      { text: "Added the greeting; the tests pass.", type: "MESSAGE_TYPE_AI", bubbleId: "job-1-0" },
      { text: "Add a test too.", type: "MESSAGE_TYPE_HUMAN" },
      null,
    ];
    assert.deepEqual(module.cloudAgentLines(conversation), [
      { id: "job-1-user", role: "prompt", text: "Add a greeting file.", atMs: 1000 },
      { id: "update-job-1-0", role: "update", text: "Reading the repository first.", atMs: 1001 },
      { id: "job-1-0", role: "answer", text: "Added the greeting; the tests pass.", atMs: 0 },
      { id: "line-4", role: "prompt", text: "Add a test too.", atMs: 0 },
    ]);
    assert.deepEqual(module.cloudAgentLines(undefined), []);
    const asked = [];
    const manager = new module.SandCloudAgentManager({ getAccountAccessToken: async () => "t", getMachineId: async () => "m", completionPolling: { start: () => ({ dispose() {} }) }, clock: { monotonicNow: () => 0 }, convertConversationMessagesToTrace: () => [], clientForTesting: { getBackgroundComposerConversation: async (request) => { asked.push(request); if (request.bcId === "bc-gone") throw Object.assign(new Error("not found"), { name: "ConnectError", code: 5 }); if (request.bcId === "bc-down") throw new Error("the server is away"); return { conversation }; } }, dashboardClientForTesting: { getTeams: async () => ({ teams: [] }) }, modelCatalogForTesting: [] });
    assert.deepEqual(await manager.getConversation(" bc-1 "), { bcId: "bc-1", coder: "claude-code", messages: module.cloudAgentLines(conversation) }, "with the program that coded, whose mascot the apps draw");
    assert.deepEqual(asked, [{ bcId: "bc-1" }]);
    assert.equal(await manager.getConversation("bc-gone"), null, "one the server doesn't know");
    await assert.rejects(manager.getConversation("bc-down"), /the server is away/);
    assert.equal(await manager.getConversation("  "), null);

    // The report that wakes the launching agent carries the cloud agent's own name, for the chat's "Message from" line.
    const watched = module.buildWatchResult("bc-1", "finished", { composer: { name: " Add a greeting ", status: "finished", prUrl: "https://github.com/simeonlabs/demo/pull/7" }, summary: "Added the greeting; the tests pass." });
    assert.equal(watched.name, "Add a greeting");
    assert.equal(watched.coder, "claude-code");
    assert.equal(watched.said, "Added the greeting; the tests pass.\n\nPull request: https://github.com/simeonlabs/demo/pull/7", "its own words, with the pull request's link when they leave it out");
    assert.match(watched.text, /^The cloud agent finished\.\nPull request: https:\/\/github\.com\/simeonlabs\/demo\/pull\/7/);
    assert.equal(module.buildWatchResult("bc-1", "finished", { composer: { status: "finished", prUrl: "https://github.com/simeonlabs/demo/pull/7" }, summary: "See https://github.com/simeonlabs/demo/pull/7." }).said, "See https://github.com/simeonlabs/demo/pull/7.");
    const silent = module.buildWatchResult("bc-1", "error", { composer: { status: "error" } });
    assert.deepEqual([silent.name, silent.said, silent.coder], [undefined, undefined, "claude-code"]);
    assert.equal(module.buildWatchResult("bc-1", "error", { composer: { name: "Add a greeting", status: "error" }, summary: "The tests fail." }).said, "The tests fail.");
  } finally {
    await s.dispose();
    await dispose();
  }
});

/** `gh auth login` as gh 2.89 speaks it: the code, then the wait, then "Authentication complete" once `done` says so. */
function fakeLogin(done) {
  return () => {
    const child = spawn(process.execPath, ["-e", `
      process.stderr.write("! First copy your one-time code: WXYZ-1234\\nOpen this URL to continue in your web browser: https://github.com/login/device\\n");
      process.stdin.resume();
      const timer = setInterval(() => { if (require("node:fs").existsSync(${JSON.stringify(done)})) { process.stderr.write("✓ Authentication complete.\\n"); process.exit(0); } }, 10);
    `], { stdio: ["pipe", "pipe", "pipe"] });
    return child;
  };
}

test("GitHub on the computer: the device code for the card, the same code to a second agent, connected, setup-git, both agents woken", async () => {
  const { module, dispose } = await load();
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-gh-signin-"));
  try {
    const done = path.join(dir, "done");
    let signedIn = false;
    const runs = [];
    const github = new module.GitHubOnComputer({
      log: quiet,
      spawnLogin: fakeLogin(done),
      run: async (bin, args) => {
        runs.push(args.join(" "));
        if (args[0] === "auth" && args[1] === "status") return { code: signedIn ? 0 : 1, stdout: "", stderr: "" };
        if (args[0] === "api") return { code: 0, stdout: '{"login":"octo","id":42}', stderr: "" };
        return { code: 0, stdout: "", stderr: "" };
      },
    });
    const woken = [];
    github.onConnected((agentId, login) => woken.push([agentId, login]));
    const first = await github.startSignIn("agent-nora");
    assert.equal(first.state, "waiting");
    assert.equal(first.code, "WXYZ-1234");
    assert.equal(first.url, "https://github.com/login/device");
    const second = await github.startSignIn("agent-theo");
    assert.equal(second.code, "WXYZ-1234", "one sign-in at a time, the same code");
    assert.equal((await github.signInState()).state, "waiting");

    signedIn = true;
    await writeFile(done, "");
    for (let i = 0; i < 200 && woken.length < 2; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(woken.sort(), [["agent-nora", "octo"], ["agent-theo", "octo"]]);
    assert.deepEqual(await github.signInState(), { state: "connected", login: "octo" });
    assert.ok(runs.includes("auth setup-git --hostname github.com"), "git pushes with the same sign-in");
    assert.deepEqual(await github.startSignIn("agent-nora"), { state: "connected", login: "octo" }, "connected: no new code");
    github.dispose();
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

/**
 * `gh auth login` as gh 2.46.0 takes its options (the computer's image carries Debian trixie's 2.46.0-3): any other
 * option is refused with "unknown flag" and the help, whose last line says nothing, as the real one does. The
 * stand-in of the test above takes any option, which is how `--skip-ssh-key` (not in 2.46) reached a real computer
 * and stopped every launch (13 November 2026).
 */
async function strictGh(dir) {
  const gh = path.join(dir, "gh-2.46");
  await writeFile(gh, `#!/bin/sh
if [ "$1 $2" = "auth status" ]; then echo "You are not logged into any GitHub hosts. To log in, run: gh auth login" >&2; exit 1; fi
if [ "$1 $2" = "auth login" ]; then
  shift 2
  while [ $# -gt 0 ]; do
    case "$1" in
      --hostname|--git-protocol|--scopes|-h|-p|-s) shift 2 ;;
      --web|--insecure-storage|-w) shift ;;
      *) printf 'unknown flag: %s\\n\\nUsage:  gh auth login [flags]\\n\\nFlags:\\n  -p, --git-protocol string   The protocol to use for git operations on this host: {ssh|https}\\n  -w, --web                   Open a browser to authenticate\\n      --with-token            Read token from standard input\\n  \\n' "$1" >&2; exit 1 ;;
    esac
  done
  echo "! First copy your one-time code: ABCD-5678" >&2
  echo "Open this URL to continue in your web browser: https://github.com/login/device" >&2
  exec sleep 30
fi
exit 0
`);
  await chmod(gh, 0o755);
  return gh;
}

test("GitHub's sign-in as the computer's own gh takes it: only the options gh 2.46 knows, the code read from the real program's lines, and an unknown option named", async () => {
  const { module, dispose } = await load();
  const dir = await mkdtemp(path.join(os.tmpdir(), "simeon-gh-strict-"));
  try {
    // The options, each run against Debian's gh 2.46.0-3 itself on 13 November 2026; a new one is run against the image's gh first.
    const known = new Set(["--hostname", "--git-protocol", "--web", "--insecure-storage", "--scopes"]);
    const flags = module.GITHUB_LOGIN_ARGS.filter((word) => word.startsWith("-"));
    assert.deepEqual(flags.filter((flag) => !known.has(flag)), [], "an option gh 2.46 was not seen to take");
    assert.ok(!module.GITHUB_LOGIN_ARGS.includes("--skip-ssh-key"), "gh 2.46 has no --skip-ssh-key");
    assert.deepEqual(module.GITHUB_LOGIN_ARGS.slice(0, 2), ["auth", "login"]);

    // The whole sign-in through a real process that refuses what 2.46 refuses: the code comes, the card can show.
    const gh = await strictGh(dir);
    const env = { PATH: process.env.PATH, HOME: dir, SIMEON_GH_BIN: gh };
    const github = new module.GitHubOnComputer({ env, log: quiet });
    const state = await github.startSignIn("agent-leo");
    assert.equal(state.state, "waiting", JSON.stringify(state));
    assert.equal(state.code, "ABCD-5678");
    assert.equal(state.url, "https://github.com/login/device");
    github.dispose();

    // The option it does not know: the reason is gh's first line, not the last line of its help.
    const refused = await module.runCommand(gh, ["auth", "login", "--web", "--skip-ssh-key"], { env: module.gitHubEnv(env), timeoutMs: 10_000 });
    assert.equal(refused.code, 1);
    assert.equal(module.noCodeReason(`${refused.stdout}${refused.stderr}`), "unknown flag: --skip-ssh-key");
    assert.equal(module.noCodeReason('\nfailed to authenticate via web browser: Post "https://github.com/login/device/code": dial tcp: i/o timeout\n'), 'failed to authenticate via web browser: Post "https://github.com/login/device/code": dial tcp: i/o timeout');
    assert.equal(module.noCodeReason("  \n"), "gh printed no code");

    // git's trust: where the machine's is a bundle of its own (Azure's egress), git is told of it, since it reads no SSL_CERT_FILE.
    assert.equal(module.gitHubEnv({ SSL_CERT_FILE: "/etc/egress/bundle.pem" }).GIT_SSL_CAINFO, "/etc/egress/bundle.pem");
    assert.equal(module.gitHubEnv({ SSL_CERT_FILE: "/etc/egress/bundle.pem", GIT_SSL_CAINFO: "/own.pem" }).GIT_SSL_CAINFO, "/own.pem");
    assert.equal(module.gitHubEnv({ PATH: "/usr/bin" }).GIT_SSL_CAINFO, undefined);
    assert.equal(module.withGitTrust({ SSL_CERT_FILE: "/etc/egress/bundle.pem", KEPT: "1" }).GIT_SSL_CAINFO, "/etc/egress/bundle.pem");
    assert.equal(module.withGitTrust({ SSL_CERT_FILE: "/etc/egress/bundle.pem", KEPT: "1" }).KEPT, "1");
    const plain = { PATH: "/usr/bin" };
    assert.equal(module.withGitTrust(plain), plain, "nothing to add: the same environment");
  } finally {
    await rm(dir, { recursive: true, force: true });
    await dispose();
  }
});

// The machine's own `gh`, when it has one: every option the sign-in passes is in its help. Nothing reaches GitHub (`--help` only).
const machineGh = (() => { try { return execFileSync("gh", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n")[0]; } catch { return undefined; } })();
test("the sign-in's options against this machine's own gh", { skip: machineGh === undefined ? "no gh on this machine" : false }, async () => {
  const { module, dispose } = await load();
  try {
    const help = execFileSync("gh", ["auth", "login", "--help"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: os.tmpdir(), NO_COLOR: "1", GH_NO_UPDATE_NOTIFIER: "1" } });
    for (const flag of module.GITHUB_LOGIN_ARGS.filter((word) => word.startsWith("-"))) {
      assert.ok(help.includes(flag), `${machineGh} has no ${flag}`);
    }
  } finally {
    await dispose();
  }
});

test("the manager: the launch asks for the computer, Claude and GitHub are checked first, Paused reads from the limit, links go to the pull request", async () => {
  const { module, dispose } = await load();
  try {
    const requests = [];
    const client = {
      startBackgroundComposerFromSnapshot: async (request) => { requests.push(request); return { composer: { bcId: request.bcId } }; },
      addAsyncFollowupBackgroundComposer: async () => ({ runId: "job-2" }),
      getBackgroundComposerInfo: async () => ({ composer: { composer: { status: 3, name: "Fix" }, permanentError: { details: { title: "Paused: the Claude plan's limit is reached", detail: "It resets at 15:40 UTC on 12 November.", additionalInfo: { rateLimitReason: "sand_included_limit" } } } } }),
    };
    const manager = new module.SandCloudAgentManager({ getAccountAccessToken: async () => "t", getMachineId: async () => "m", completionPolling: { start: () => ({ dispose() {} }) }, clock: { monotonicNow: () => 0 }, convertConversationMessagesToTrace: () => [], clientForTesting: client, dashboardClientForTesting: { getTeams: async () => ({ teams: [] }) }, modelCatalogForTesting: [] });

    // No coding attached (an engine that can't): the launch is the cloud runner's, as before.
    assert.deepEqual(await manager.codingReady("agent-1"), { ok: true });
    await manager.launch({ prompt: "Fix it.", repoUrl: "simeonlabs/demo" });
    assert.equal(requests[0].usePrivateWorker, undefined);

    let kicks = 0;
    manager.attachCoding({ kick: () => { kicks += 1; }, isBusy: () => true });
    let state = { state: "waiting", code: "WXYZ-1234", url: "https://github.com/login/device", expiresAtMs: 99 };
    manager.attachGitHub({ startSignIn: async () => state, signInState: async () => state });
    assert.equal(manager.isCodingBusy(), true);

    assert.deepEqual(await manager.codingReady("agent-1", () => undefined), { ok: false, text: module.CLAUDE_NOT_CONNECTED_TEXT });
    assert.deepEqual(await manager.codingReady("agent-1", () => ({ model: "opus" })), { ok: false, text: module.GITHUB_CARD_TEXT, card: { type: "github-sign-in", code: "WXYZ-1234", url: "https://github.com/login/device", expiresAtMs: 99 } });
    state = { state: "connected", login: "octo" };
    assert.deepEqual(await manager.codingReady("agent-1", () => ({ model: "opus" })), { ok: true });
    assert.deepEqual(await manager.getGitHubSignIn(), { state: "connected", login: "octo" });

    const launched = await manager.launch({ prompt: "Fix it.", repoUrl: "simeonlabs/demo" });
    assert.deepEqual([requests[1].usePrivateWorker, requests[1].labels], [true, [{ key: "executor", value: "computer" }]]);
    assert.equal(launched.url, "", "no link to a page that was never made");
    await manager.reply({ bcId: launched.bcId, prompt: "Also the test." });
    assert.equal(kicks, 2, "the computer starts at once after a launch and after a follow-up");

    const got = await manager.get(launched.bcId);
    assert.equal(got.status, "paused");
    assert.match(got.error, /Paused: the Claude plan's limit is reached\nIt resets at 15:40 UTC on 12 November\./);
    assert.equal(module.cloudAgentUrl("bc-1", "https://github.com/o/r/pull/1"), "https://github.com/o/r/pull/1");

    const paused = module.buildWatchResult("bc-1", 3, { permanentError: { details: { title: "Paused: the Claude plan's limit is reached", detail: "It resets at 15:40.", additionalInfo: { rateLimitReason: "sand_included_limit" } } } });
    assert.match(paused.text, /^The cloud agent \(bc-1\) was paused before finishing\.\n\nPaused: the Claude plan's limit is reached\nIt resets at 15:40\.$/);
    const done = module.buildWatchResult("bc-1", 2, { composer: { branchName: "simeon/fix-0000", prUrl: "https://github.com/o/r/pull/1", filesChanged: 2, linesAdded: 3, linesRemoved: 1, commitCount: 1 }, summary: "Fixed." });
    assert.match(done.text, /Branch: simeon\/fix-0000\nPull request: https:\/\/github\.com\/o\/r\/pull\/1\nChanges: 1 commit, \+3\/-1 across 2 files\./);
    manager.dispose();
  } finally {
    await dispose();
  }
});

test("the CloudAgent tool: nothing is launched while Claude or GitHub is missing, and the launch says the work opens a pull request", async () => {
  const { module, dispose } = await load();
  try {
    const launched = [];
    const api = { launch: async (args) => { launched.push(args); return { bcId: "bc-9", url: "" }; }, list: async () => [], listModels: async () => [], get: async () => null, reply: async () => ({ runId: "r" }) };
    const ctx = { signal: new AbortController().signal, get: () => undefined };
    const base = { api, launchedIds: new Set(), agentDir: "/tmp/agent", writeBoxFile: async () => {} };
    let ready = { ok: false, text: "GitHub isn't connected on the user's computer yet." };
    const deps = { ...base, codingReady: async () => ready };
    assert.equal(await module.runCloudAgentAction(ctx, { action: "launch", prompt: "Fix it.", repo_url: "simeonlabs/demo" }, deps), "GitHub isn't connected on the user's computer yet.");
    assert.equal(await module.runCloudAgentAction(ctx, { action: "reply", agent_id: "bc-9", prompt: "More." }, deps), "GitHub isn't connected on the user's computer yet.");
    assert.equal(launched.length, 0);

    ready = { ok: true };
    const text = await module.runCloudAgentAction(ctx, { action: "launch", prompt: "Fix it.", repo_url: "simeonlabs/demo" }, deps);
    assert.equal(launched.length, 1);
    assert.match(text, /^Launched cloud agent bc-9\.\nIt runs on your own computer \(the box\), in Claude Code on the user's own Claude plan\. It clones the repository, works on a new branch, builds and tests, then pushes the branch and opens a pull request/);
    assert.doesNotMatch(text, /does not open a pull request/);

    // What the agent asked is handed to the engine before the tool answers (the chat's "Messaged" line, 13 November
    // 2026), with the name it gave; the answer says the chat shows the exchange and the card comes by itself.
    const asked = [];
    const telling = { ...deps, onLaunched: async (event) => { await new Promise((resolve) => setTimeout(resolve, 5)); asked.push(["launch", event]); }, onFollowupSent: (event) => { asked.push(["reply", event]); } };
    const told = await module.runCloudAgentAction(ctx, { action: "launch", prompt: "  Polish the README.  ", title: " Polish the README ", repo_url: "simeonlabs/demo" }, telling);
    assert.deepEqual(asked, [["launch", { bcId: "bc-9", prompt: "Polish the README.", title: "Polish the README" }]], "the line is written before the tool's answer comes back");
    assert.ok(told.includes(module.CLOUD_AGENT_CHAT_NOTE));
    assert.match(module.CLOUD_AGENT_CHAT_NOTE, /don't send a cloud-agent card yourself/);
    assert.doesNotMatch(told, /its card shows/);
    const followed = await module.runCloudAgentAction(ctx, { action: "reply", agent_id: "bc-9", prompt: "Also the docs." }, telling);
    assert.deepEqual(asked[1], ["reply", { bcId: "bc-9", interrupt: false, prompt: "Also the docs." }]);
    assert.match(followed, /The chat already shows your message to it/);
    // A chat that can't take the line never stops a launch.
    const broken = { ...deps, onLaunched: () => { throw new Error("the chat's file is locked"); } };
    assert.match(await module.runCloudAgentAction(ctx, { action: "launch", prompt: "Fix it.", repo_url: "simeonlabs/demo" }, broken), /^Launched cloud agent bc-9\./);
    assert.equal(module.summaryLine({ bcId: "bc-9", name: "Fix", status: "finished", isArchived: false, branchName: "simeon/fix-0000", prUrl: "https://github.com/o/r/pull/1", url: "https://github.com/o/r/pull/1" }), "- bc-9 — Fix [finished, simeon/fix-0000, https://github.com/o/r/pull/1]");
  } finally {
    await dispose();
  }
});
