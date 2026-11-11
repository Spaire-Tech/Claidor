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
    assert.match(outcome.reason, /GitHub isn't connected on the computer/);

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
    assert.match(text, /^Launched cloud agent bc-9\.\nIt runs on the user's computer, in Claude Code on their own Claude plan\. It clones the repository, works on a new branch, builds and tests, then pushes the branch and opens a pull request/);
    assert.doesNotMatch(text, /does not open a pull request/);
    assert.equal(module.summaryLine({ bcId: "bc-9", name: "Fix", status: "finished", isArchived: false, branchName: "simeon/fix-0000", prUrl: "https://github.com/o/r/pull/1", url: "https://github.com/o/r/pull/1" }), "- bc-9 — Fix [finished, simeon/fix-0000, https://github.com/o/r/pull/1]");
  } finally {
    await dispose();
  }
});
