/**
 * One turn of a cloud agent's coding work, on the person's own computer, in
 * Claude Code on their own Claude plan (11 November 2026; the founder asked
 * for it to work exactly as the upstream app's).
 *
 * The upstream app's cloud agents ran in its maker's virtual machines, which
 * cloned the repository, made a branch (`autoBranch`), coded, and pushed it
 * and opened the pull request (`autoCreatePr`). This does the same here:
 *
 * 1. the repository cloned with GitHub's own command line (`gh repo clone`,
 *    the person's GitHub sign-in on this computer, `coding-github.ts`) into
 *    `/home/box/code/<bcId>/repo`, kept for the agent's next turns;
 * 2. a branch `simeon/<what it is>-<4 hex>` from the base branch, or the
 *    agent's own branch on a follow-up;
 * 3. Claude Code (`claude -p`, unmodified, on the model and the effort the
 *    person chose) in that checkout, told to code, build, test and commit,
 *    and its session resumed on the agent's next turn;
 * 4. the branch pushed and the pull request opened (`gh pr create`), and the
 *    branch, the pull request and the changes reported for the card.
 *
 * Nothing here logs the task, the conversation, the code or a sign-in.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { HOST_LOG_PREFIX, logHostLine } from "../../shared/host-log.js";
import { runClaudeCodeTurn, usageFromEvent, type ClaudeCodeOutcome, type ClaudeCodePlanWindow, type ClaudeCodeTurnInput } from "../claude-code/claude-code-turn.js";
import { gitHubBinary, gitHubEnv, runCommand, withoutTokens, type CommandResult, type GitHubAccount } from "./coding-github.js";

/** Where each agent's checkout is kept (`<root>/<bcId>/repo`). */
export const CODE_ROOT = "/home/box/code";
/** The longest one turn of coding may run. */
export const CODING_TURN_TIMEOUT_MS = 3 * 60 * 60_000;
/** What a turn the person stopped fails with (the server's `RUN_CANCELLED_REASON`). */
export const RUN_CANCELLED_REASON = "Cancelled by the person while it ran.";
/** Claude Code's own tools it may use without asking, in the checkout (reading and searching need no leave). */
export const CODING_TOOLS = ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "WebFetch", "WebSearch", "TodoWrite", "Task"] as const;
/** The most files of one piece of work reported (the card lists that many). */
const FILES_REPORTED = 300;

export interface CodingMessage {
  readonly role: string;
  readonly text: string;
  readonly pending?: boolean;
}

/** A turn as the server hands it (`/desktop/api/cloud-agents/computer/claim`). */
export interface CodingJob {
  readonly id: string;
  readonly bcId: string;
  readonly name: string;
  readonly repoUrl: string;
  readonly baseBranch: string;
  readonly modelId: string;
  readonly conversation: readonly CodingMessage[];
  readonly work: Readonly<Record<string, unknown>>;
  readonly attempts: number;
}

/** What the computer found of the work (`ComputerWork` on the server). */
export interface CodingWork {
  branchName?: string;
  baseBranch?: string;
  prUrl?: string;
  prNumber?: number;
  prState?: "open" | "draft" | "merged" | "closed";
  linesAdded?: number;
  linesRemoved?: number;
  filesChanged?: number;
  commitCount?: number;
  files?: { path: string; added: number; removed: number }[];
  sessionId?: string;
  limitedUntilMs?: number;
}

export type CodingOutcome =
  | { readonly kind: "done"; readonly text: string; readonly work: CodingWork }
  | { readonly kind: "failed"; readonly reason: string; readonly retryable: boolean; readonly work?: CodingWork };

export interface CodingRunDeps {
  /** The model and effort the person chose for Claude; none when Claude isn't their choice. */
  readonly choice: () => { readonly model: string; readonly effort?: string } | undefined;
  /** Who is signed in to GitHub on this computer. */
  readonly account: () => Promise<GitHubAccount>;
  readonly root?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly runClaude?: (input: ClaudeCodeTurnInput) => Promise<ClaudeCodeOutcome>;
  readonly run?: typeof runCommand;
  readonly signal?: AbortSignal;
  /** What was found so far, for the heartbeat. */
  readonly onWork?: (work: CodingWork) => void;
  /** The plan's use, as Claude Code says it. */
  readonly onUsage?: (windows: readonly ClaudeCodePlanWindow[]) => void;
  /** Claude Code isn't signed in any more. */
  readonly onSignedOut?: () => void;
  readonly now?: () => number;
  readonly log?: (line: string) => void;
}

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A branch name `git` takes and an option never starts. */
const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._/-]{1,200}$/;

/** `owner` and `name` of a GitHub repository's address (`https://github.com/o/n`, `github.com/o/n.git`, `o/n`); none for anything else. */
export function gitHubRepoOf(url: string): { readonly owner: string; readonly name: string } | undefined {
  const value = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  const match = /^(?:(?:https?:\/\/)?(?:www\.)?github\.com[/:]|git@github\.com:)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(value);
  if (match?.[1] === undefined || match[2] === undefined || match[2] === "." || match[2] === "..") return undefined;
  return { owner: match[1], name: match[2] };
}

/** `simeon/<what it is>-<4 hex>`, as the upstream's `cursor/<what it is>-<4 hex>`. */
export function branchNameFor(title: string, hex: string = randomBytes(2).toString("hex")): string {
  const words = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = words.split("-").filter(Boolean).slice(0, 6).join("-").slice(0, 40).replace(/-+$/, "") || "work";
  return `simeon/${slug}-${hex}`;
}

/** The person's words not yet answered: everything after the last reply. */
export function unansweredWords(conversation: readonly CodingMessage[]): string {
  const lastReply = conversation.map((message) => message.role).lastIndexOf("assistant");
  return conversation.slice(lastReply + 1).filter((message) => message.role === "user").map((message) => message.text.trim()).filter(Boolean).join("\n\n");
}

/** The whole exchange so far, for a turn whose Claude Code session is gone. */
export function wholeExchange(conversation: readonly CodingMessage[]): string {
  const lastReply = conversation.map((message) => message.role).lastIndexOf("assistant");
  if (lastReply < 0) return unansweredWords(conversation);
  const before = conversation.slice(0, lastReply + 1).map((message) => `<message from="${message.role === "assistant" ? "you" : "person"}">\n${message.text.trim()}\n</message>`).join("\n\n");
  return `${before}\n\nThe work so far is on this branch. The person now says:\n\n${unansweredWords(conversation)}`;
}

/** Claude Code's brief for the work, added to its own system prompt. */
export function codingBrief(repo: { readonly owner: string; readonly name: string }, branch: string, base: string): string {
  return [
    `You're working for the person through Simeon, their team of agents, on their own computer. This folder is a checkout of ${repo.owner}/${repo.name} on the branch ${branch}, made from ${base}.`,
    "",
    "- Do the task you're given: read the code you need, make the change, then build it and run its tests or checks, as a developer on this project would.",
    "- Commit your work on this branch as you go, with clear messages (git commit). Don't push, don't change branches and don't open a pull request: Simeon pushes this branch and opens the pull request when you finish.",
    "- If the build or the tests fail and you can't fix them, don't commit the broken part. Stop and say plainly what fails and what you'd need.",
    "- If the task is unclear, or needs a decision only the person can make, stop and ask it as one short question.",
    "- Never print, copy or commit a password, a token or a key.",
    "- End with a short summary for the person: what you changed and how you checked it, in plain words.",
  ].join("\n");
}

/** `git diff --numstat` read: each file's lines added and taken out (a binary file counts none). */
export function numstat(words: string): { path: string; added: number; removed: number }[] {
  const files: { path: string; added: number; removed: number }[] = [];
  for (const line of words.split("\n")) {
    const match = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim());
    if (match?.[3] === undefined) continue;
    files.push({ path: match[3], added: match[1] === "-" ? 0 : Number(match[1]), removed: match[2] === "-" ? 0 : Number(match[2]) });
  }
  return files;
}

/** When the plan's limit ends, as the agent tells the person: "15:40 UTC on 12 November". */
export function limitWords(untilMs: number): string {
  const at = new Date(untilMs);
  const hours = String(at.getUTCHours()).padStart(2, "0");
  const minutes = String(at.getUTCMinutes()).padStart(2, "0");
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][at.getUTCMonth()];
  return `${hours}:${minutes} UTC on ${at.getUTCDate()} ${month}`;
}

const lastLine = (result: CommandResult): string =>
  withoutTokens((result.stderr.trim() || result.stdout.trim()).split("\n").filter((line) => line.trim() !== "").at(-1) ?? `exit ${result.code ?? "on a signal"}`).slice(0, 300);

/** Runs one turn to its end; never throws. */
export async function runCodingJob(job: CodingJob, deps: CodingRunDeps): Promise<CodingOutcome> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? Date.now;
  const log = (line: string): void => (deps.log ?? logHostLine)(`${HOST_LOG_PREFIX} coding job=${job.id} ${line}`);
  const run = deps.run ?? runCommand;
  const gitEnv = gitHubEnv(env);
  const gh = gitHubBinary(env);
  const failed = (reason: string, retryable = false, work?: CodingWork): CodingOutcome => {
    // The person's stop wins over whatever the step it cut short said.
    const stopped = deps.signal?.aborted === true;
    log(`stopped retryable=${retryable && !stopped}${stopped ? " by the person" : ""}`);
    return { kind: "failed", reason: stopped ? RUN_CANCELLED_REASON : reason, retryable: retryable && !stopped, ...(work === undefined ? {} : { work }) };
  };
  try {
    const choice = deps.choice();
    if (choice === undefined) return failed("Claude isn't connected, so the coding can't run: the person connects Claude in Settings › AI Models, then asks again.");
    const repo = gitHubRepoOf(job.repoUrl);
    if (repo === undefined) return failed(`Only GitHub repositories can be worked on for now, and ${job.repoUrl || "no repository"} isn't one.`);
    const account = await deps.account();
    if (!account.connected) return failed("GitHub isn't connected on the computer, so the repository can't be opened. Launch the work again to show the Connect GitHub card.");

    const folder = path.join(deps.root ?? env.SIMEON_CODE_ROOT?.trim() ?? CODE_ROOT, job.bcId.replace(/[^A-Za-z0-9._-]/g, "_"));
    const checkout = path.join(folder, "repo");
    mkdirSync(folder, { recursive: true });
    const git = (args: readonly string[], timeoutMs = 10 * 60_000): Promise<CommandResult> => run("git", args, { cwd: checkout, env: gitEnv, timeoutMs, ...(deps.signal === undefined ? {} : { signal: deps.signal }) });

    if (!existsSync(path.join(checkout, ".git"))) {
      log("clone");
      const clone = await run(gh, ["repo", "clone", `${repo.owner}/${repo.name}`, checkout], { cwd: folder, env: gitEnv, timeoutMs: 30 * 60_000, ...(deps.signal === undefined ? {} : { signal: deps.signal }) });
      if (clone.code !== 0) return failed(`Couldn't open ${repo.owner}/${repo.name} on GitHub: ${lastLine(clone)}`);
    } else {
      const fetched = await git(["fetch", "origin", "--prune"]);
      if (fetched.code !== 0) return failed(`Couldn't reach ${repo.owner}/${repo.name} on GitHub: ${lastLine(fetched)}`, true);
    }

    const kept = job.work;
    const keptBase = typeof kept.baseBranch === "string" && BRANCH.test(kept.baseBranch) ? kept.baseBranch : undefined;
    let base = BRANCH.test(job.baseBranch) ? job.baseBranch : keptBase;
    if (base === undefined) {
      const head = await git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
      const name = head.stdout.trim().replace(/^origin\//, "");
      base = BRANCH.test(name) ? name : "main";
    }
    if ((await git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${base}`])).code !== 0) return failed(`${repo.owner}/${repo.name} has no branch ${base}.`);

    const keptBranch = typeof kept.branchName === "string" && BRANCH.test(kept.branchName) ? kept.branchName : undefined;
    const branch = keptBranch ?? branchNameFor(job.name || unansweredWords(job.conversation));
    const local = (await git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0;
    const remote = (await git(["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`])).code === 0;
    const checkedOut = local
      ? await git(["checkout", branch])
      : await git(["checkout", "-B", branch, remote ? `origin/${branch}` : `origin/${base}`]);
    if (checkedOut.code !== 0) return failed(`Couldn't make the branch ${branch}: ${lastLine(checkedOut)}`);
    // Commits pushed to the pull request since (the person's, a reviewer's) come in first.
    if (local && remote) await git(["merge", "--ff-only", `origin/${branch}`]);
    const author = account.name ?? account.login ?? "Simeon";
    await git(["config", "user.name", author]);
    if (account.login !== undefined && account.id !== undefined) await git(["config", "user.email", `${account.id}+${account.login}@users.noreply.github.com`]);

    const work: CodingWork = { branchName: branch, baseBranch: base, limitedUntilMs: 0 };
    deps.onWork?.(work);
    if (deps.signal?.aborted === true) return failed(RUN_CANCELLED_REASON, false, work);

    const keptSession = typeof kept.sessionId === "string" && SESSION_ID.test(kept.sessionId) ? kept.sessionId : undefined;
    const runClaude = deps.runClaude ?? runClaudeCodeTurn;
    const turn = (resume: string | undefined): Promise<ClaudeCodeOutcome> => runClaude({
      prompt: (resume === undefined ? wholeExchange(job.conversation) : unansweredWords(job.conversation)) || "Carry on with the task.",
      model: choice.model,
      ...(choice.effort === undefined ? {} : { effort: choice.effort }),
      resume,
      brief: codingBrief(repo, branch, base),
      cwd: checkout,
      allowedTools: CODING_TOOLS,
      timeoutMs: CODING_TURN_TIMEOUT_MS,
      env,
      ...(deps.signal === undefined ? {} : { signal: deps.signal }),
      onEvent: (event) => {
        const windows = usageFromEvent(event);
        if (windows !== undefined) try { deps.onUsage?.(windows); } catch { /* never in the way of the work */ }
      },
    });
    const started = now();
    log(`claude model=${choice.model}${choice.effort === undefined ? "" : ` effort=${choice.effort}`} resume=${keptSession !== undefined}`);
    let outcome = await turn(keptSession);
    if (outcome.kind === "no_session" && keptSession !== undefined) outcome = await turn(undefined);
    log(`claude outcome=${outcome.kind} ms=${now() - started}`);
    if ("sessionId" in outcome && outcome.sessionId !== undefined && SESSION_ID.test(outcome.sessionId)) work.sessionId = outcome.sessionId;

    switch (outcome.kind) {
      case "aborted": return failed(RUN_CANCELLED_REASON, false, work);
      case "limited": {
        const until = outcome.until !== undefined && outcome.until > now() ? outcome.until : now() + 60 * 60_000;
        return failed(`Claude's plan limit was reached, so the work is paused. It resets at ${limitWords(until)}; a reply after that carries on where it stopped.`, false, { ...work, limitedUntilMs: until });
      }
      case "signed_out":
        try { deps.onSignedOut?.(); } catch { /* the caller's own trouble */ }
        return failed("Claude isn't signed in on the computer any more. The person connects Claude again in Settings › AI Models; a reply then carries on.", false, work);
      case "not_installed": return failed("Claude Code isn't installed on the computer yet; it installs by itself.", true, work);
      case "no_session":
      case "failed": return failed(`Claude Code stopped: ${withoutTokens(outcome.kind === "failed" ? outcome.said : "its session is gone").slice(0, 600)}`, false, work);
      case "done": break;
    }
    const text = outcome.text.trim();

    const ahead = await git(["rev-list", "--count", `origin/${base}..HEAD`]);
    const commits = Number(ahead.stdout.trim()) || 0;
    work.commitCount = commits;
    if (commits === 0) {
      log("done, nothing committed");
      return { kind: "done", text, work };
    }
    let pushed = await git(["push", "-u", "origin", `${branch}:${branch}`], 30 * 60_000);
    if (pushed.code !== 0 && /non-fast-forward|fetch first|rejected/i.test(`${pushed.stderr}`)) pushed = await git(["push", "--force-with-lease", "-u", "origin", `${branch}:${branch}`], 30 * 60_000);
    if (pushed.code !== 0) return failed(`The work is committed on the computer (branch ${branch}), but GitHub refused the push: ${lastLine(pushed)}${text === "" ? "" : `\n\nClaude Code's summary:\n${text.slice(0, 2_000)}`}`, false, work);

    const viewPr = (): Promise<CommandResult> => run(gh, ["pr", "view", branch, "--repo", `${repo.owner}/${repo.name}`, "--json", "url,number,state,isDraft"], { cwd: checkout, env: gitEnv, timeoutMs: 60_000 });
    let view = await viewPr();
    if (view.code !== 0) {
      const title = (job.name.trim() || unansweredWords(job.conversation).split("\n")[0] || "Work from Simeon").slice(0, 120);
      const body = `${text || "Work done by Simeon."}\n\n---\nMade by Simeon, with Claude Code.`;
      const created = await run(gh, ["pr", "create", "--repo", `${repo.owner}/${repo.name}`, "--base", base, "--head", branch, "--title", title, "--body-file", "-"], { cwd: checkout, env: gitEnv, input: body, timeoutMs: 120_000 });
      if (created.code !== 0) return failed(`The branch ${branch} is pushed, but GitHub didn't open the pull request: ${lastLine(created)}`, false, work);
      view = await viewPr();
    }
    try {
      const pr = JSON.parse(view.stdout) as { url?: unknown; number?: unknown; state?: unknown; isDraft?: unknown };
      if (typeof pr.url === "string") work.prUrl = pr.url;
      if (typeof pr.number === "number") work.prNumber = pr.number;
      const state = typeof pr.state === "string" ? pr.state.toLowerCase() : "";
      work.prState = state === "merged" ? "merged" : state === "closed" ? "closed" : pr.isDraft === true ? "draft" : "open";
    } catch { /* the pull request is open; its details are read again next turn */ }

    const diff = await git(["diff", "--numstat", `origin/${base}...HEAD`]);
    const files = numstat(diff.stdout);
    work.files = files.slice(0, FILES_REPORTED);
    work.filesChanged = files.length;
    work.linesAdded = files.reduce((sum, file) => sum + file.added, 0);
    work.linesRemoved = files.reduce((sum, file) => sum + file.removed, 0);
    log(`done commits=${commits} files=${files.length} pr=${work.prNumber ?? "-"}`);
    return { kind: "done", text, work };
  } catch (error) {
    return failed(`The coding stopped on the computer: ${withoutTokens(error instanceof Error ? error.message : String(error)).slice(0, 300)}`, true);
  }
}
