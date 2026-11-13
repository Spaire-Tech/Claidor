/** How git is run for the agents: its environment, its failures told with their codes, and addresses kept free of sign-ins. */
import { chmod, writeFile } from "node:fs/promises";
import path from "node:path";

export const part = "packages/git-core";
export const modules = {
  diagnostics: "source/packages/git-core/diagnostics.ts",
  exec: "source/packages/git-core/git-exec.ts",
  env: "source/packages/git-core/process-env.ts",
  redaction: "source/packages/git-core/redaction.ts",
};

/** The variables git's environment is judged by; the rest is the machine's own. */
const WATCHED = /^(LC_ALL|LANG|GIT_PAGER|VSCODE_GIT_COMMAND|GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)|RECORDED_[A-Z]+)$/;
const watched = (env) => Object.fromEntries(Object.entries(env).filter(([name]) => WATCHED.test(name)).sort(([a], [b]) => a.localeCompare(b)));
/** The machine's own git settings put aside while a scenario runs. */
async function withoutGitEnv(run) {
  const kept = {};
  for (const name of Object.keys(process.env)) if (WATCHED.test(name)) { kept[name] = process.env[name]; delete process.env[name]; }
  try { return await run(); } finally { Object.assign(process.env, kept); }
}

export const scenarios = [
  {
    name: "a failure's code and exit code are added to its message, once",
    run: ({ diagnostics }) => {
      const { appendGitDiagnostics } = diagnostics;
      return [
        appendGitDiagnostics("clone failed", { gitErrorCode: "NotAGitRepository", exitCode: 128 }),
        appendGitDiagnostics("clone failed", { gitErrorCode: "", exitCode: 1 }),
        appendGitDiagnostics("clone failed", { exitCode: Number.NaN, gitErrorCode: 7 }),
        appendGitDiagnostics("clone failed [git: exitCode=1]", { exitCode: 2 }),
        appendGitDiagnostics("clone failed", null),
        appendGitDiagnostics("clone failed", "a string"),
        appendGitDiagnostics("clone failed", { stderr: "only words" }),
        appendGitDiagnostics("clone failed", { exitCode: 128, stderr: "fatal: no" }),
      ];
    },
  },
  {
    name: "git's own words are added when asked, cut at 2,048 and with sign-ins taken out of addresses",
    run: ({ diagnostics }) => {
      const { appendGitDiagnostics } = diagnostics;
      const long = "x".repeat(2_048);
      return [
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: "fatal: unable to access 'https://bot:secret@example.com/a/b.git/': 403" }, { includeStderr: true }),
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: "" }, { includeStderr: true }),
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: 12 }, { includeStderr: true }),
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: long }, { includeStderr: true }).length,
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: `${long}y` }, { includeStderr: true }).slice(-40),
        appendGitDiagnostics("push failed", { exitCode: 1, stderr: "kept out" }, { includeStderr: false }),
      ];
    },
  },
  {
    name: "an address loses its sign-in, its query and its fragment, and keeps what follows it",
    run: ({ redaction }) => {
      const { redactHttpUrlUserinfo } = redaction;
      return [
        "https://user:pass@example.com/repo.git",
        "see https://token@example.com/a?x=1#frag, then (http://a:b@host:8080/p).",
        "HTTPS://Upper:Case@Example.com/Path",
        "http://first@second@host/path",
        "https://example.com/a@b/c",
        "https://example.com?token=abc",
        "https://example.com#top",
        "no address here, ssh://git@example.com/x.git stays",
        "two: https://a@x.test/1 https://b:c@y.test/2\"",
        "https://",
        "https://@host/",
        "",
      ].map((text) => redactHttpUrlUserinfo(text));
    },
  },
  {
    name: "git's environment: the language, no pager, the command named, four settings pinned",
    run: ({ env }) => withoutGitEnv(() => {
      const { createGitProcessEnv } = env;
      return [
        watched(createGitProcessEnv({})),
        watched(createGitProcessEnv({ command: "status" })),
        watched(createGitProcessEnv({ command: undefined, optionsEnv: { VSCODE_GIT_COMMAND: "left over" } })),
        watched(createGitProcessEnv({ spawnerEnv: { LANG: "fr_FR.UTF-8", RECORDED_A: "spawner", RECORDED_B: "spawner" }, optionsEnv: { RECORDED_B: "options", LC_ALL: "C", GIT_PAGER: "less" }, command: "log" })),
      ];
    }),
  },
  {
    name: "settings already given are counted, a pinned one among them is overwritten in place, a bad count starts over",
    run: ({ env }) => withoutGitEnv(() => {
      const { createGitProcessEnv } = env;
      const given = (optionsEnv) => watched(createGitProcessEnv({ optionsEnv }));
      return [
        given({ GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "user.name", GIT_CONFIG_VALUE_0: "Ada" }),
        given({ GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_VALUE_0: "true", GIT_CONFIG_KEY_1: "core.hooksPath", GIT_CONFIG_VALUE_1: "/hooks" }),
        given({ GIT_CONFIG_COUNT: "4", GIT_CONFIG_KEY_0: "safe.bareRepository", GIT_CONFIG_KEY_1: "core.fsmonitor", GIT_CONFIG_KEY_2: "core.hooksPath", GIT_CONFIG_KEY_3: "core.attributesFile" }),
        given({ GIT_CONFIG_COUNT: "2", GIT_CONFIG_KEY_0: "core.fsmonitor", GIT_CONFIG_KEY_1: "core.fsmonitor" }),
        given({ GIT_CONFIG_COUNT: "" }),
        given({ GIT_CONFIG_COUNT: "many" }),
        given({ GIT_CONFIG_COUNT: "-3" }),
        given({ GIT_CONFIG_COUNT: "2.9", GIT_CONFIG_KEY_0: "a.b", GIT_CONFIG_KEY_1: "c.d" }),
        given({ GIT_CONFIG_COUNT: "1" }),
      ];
    }),
  },
  {
    name: "a git command is run with that environment, its command read past git's own options",
    run: async ({ exec }, tools) => withoutGitEnv(async () => {
      const dir = await tools.tmp();
      const git = path.join(dir, "git");
      await writeFile(git, '#!/bin/sh\necho "command=$VSCODE_GIT_COMMAND pager=$GIT_PAGER lang=$LC_ALL count=$GIT_CONFIG_COUNT first=$GIT_CONFIG_KEY_0 mine=$RECORDED_A args=$*"\necho "to stderr" >&2\n[ "$1" = "fail" ] && exit 3\nexit 0\n');
      await chmod(git, 0o755);
      const run = async (args, options) => {
        try { return await exec.gitExecFile(git, args, options); } catch (error) { return { failed: { code: error.code, stdout: String(error.stdout), stderr: String(error.stderr) } }; }
      };
      return [
        await run(["status", "--short"]),
        await run(["-c", "a=b", "-C", "/somewhere", "--git-dir", "x", "--work-tree", "y", "--no-pager", "log", "-1"], { env: { RECORDED_A: "given" } }),
        await run(["--version"]),
        await run([], { cwd: dir, encoding: "utf8", timeout: 10_000 }),
        await run(["fail"]),
      ];
    }),
  },
];
