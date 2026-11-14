/** Where the person's settings folder is, and the permissions files read from it and from a project: which commands and tools run unasked, and the instructions for what else may. */
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import path from "node:path";

export const part = "packages/simeon-config";

/**
 * The part reads its files with the jsonc-parser package, whose default entry
 * asks for its own files by relative path (`require("./impl/format")`) from
 * inside a wrapper the build cannot see through. Built into the harness's
 * temporary folder, that entry looks for them beside the built file and the
 * part fails to load (MODULE_NOT_FOUND). Such a request from the harness's
 * built files is answered here with the package's own file. The engine's
 * real builds name the package's other entry for the same reason
 * (`scripts/build-simeon.mjs`); were the harness to do so, this would never
 * be asked and can go.
 */
const jsoncParserFiles = path.dirname(createRequire(import.meta.url).resolve("jsonc-parser"));
registerHooks({
  resolve(specifier, context, nextResolve) {
    const fromTheHarness = specifier.startsWith("./impl/") && /[\\/]simeon-recorded-[^\\/]+[\\/][^\\/]+\.mjs(\?.*)?$/.test(context.parentURL ?? "");
    return nextResolve(fromTheHarness ? path.join(jsoncParserFiles, specifier) : specifier, context);
  },
});
export const modules = {
  paths: "source/packages/simeon-config/paths.ts",
  project: "source/packages/simeon-config/project-permissions-file-provider.ts",
  permissions: "source/packages/simeon-config/permissions-file-provider.ts",
};

/** The three settings the folder is found by: the machine's own are put aside while a scenario runs. */
const NO_SETTINGS = { SIMEON_CONFIG_DIR: undefined, XDG_CONFIG_HOME: undefined, HOME: undefined };

/** The process's own environment changed for one scenario, then put back as it was. */
async function withEnv(changes, run) {
  const before = {};
  const set = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  for (const [name, value] of Object.entries({ ...NO_SETTINGS, ...changes })) {
    before[name] = Object.hasOwn(process.env, name) ? process.env[name] : undefined;
    set(name, value);
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of Object.entries(before)) set(name, value);
  }
}

/** What a loaded file gives: its rules and its instructions, or "nothing" when the file gives none. */
async function told(provider) {
  if (provider === undefined) return "nothing";
  return { permissions: await provider.getPermissions(), instructions: provider.getAutoRunInstructions() };
}

/** Each text written as a permissions file of its own and loaded by its path. */
async function loadedEach({ permissions }, tools, texts) {
  const dir = await tools.tmp();
  const out = [];
  for (const [index, text] of texts.entries()) {
    const file = path.join(dir, `permissions-${index}.json`);
    await writeFile(file, text);
    out.push([text, await told(await permissions.PermissionsFileProvider.load(file))]);
  }
  return out;
}

const LISTS = '{"terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"]}';
const FULL_AUTO_RUN = '{"allow_instructions": ["allow from autoRun"], "block_instructions": ["block from autoRun"]}';
const FULL_AUTO_REVIEW = '{"allow_instructions": ["allow from autoReview"], "block_instructions": ["block from autoReview"]}';

export const scenarios = [
  // ── paths.ts ──────────────────────────────────────────────────────────────
  {
    name: "the limits a socket's path is cut to are five fixed numbers",
    run: ({ paths }) => ({
      HASH_LENGTH: paths.HASH_LENGTH,
      MAX_SOCKET_PATH_LENGTH: paths.MAX_SOCKET_PATH_LENGTH,
      WINDOWS_SOCK_LENGTH: paths.WINDOWS_SOCK_LENGTH,
      MAX_PREFIX_LENGTH_BEFORE_HASH: paths.MAX_PREFIX_LENGTH_BEFORE_HASH,
      MAX_FULL_PATH_LENGTH: paths.MAX_FULL_PATH_LENGTH,
    }),
  },
  {
    name: "the settings folder is SIMEON_CONFIG_DIR exactly as written, spaces and dots included",
    run: ({ paths }) => withEnv({ HOME: "/recorded/home" }, () => [
      { SIMEON_CONFIG_DIR: "/custom/dir" },
      { SIMEON_CONFIG_DIR: "  /spaced/dir  " },
      { SIMEON_CONFIG_DIR: "/a/b/../c/" },
      { SIMEON_CONFIG_DIR: "relative/dir" },
      { SIMEON_CONFIG_DIR: "." },
      { SIMEON_CONFIG_DIR: "x" },
      { SIMEON_CONFIG_DIR: "/custom/dir", XDG_CONFIG_HOME: "/xdg" },
      { XDG_CONFIG_HOME: "/xdg", SIMEON_CONFIG_DIR: "/custom/dir" },
    ].map((env) => [env, paths.getConfigDir(env)])),
  },
  {
    name: "without SIMEON_CONFIG_DIR, or with one of spaces only, it is the cursor folder of XDG_CONFIG_HOME, joined as a path",
    run: ({ paths }) => withEnv({ HOME: "/recorded/home" }, () => [
      { XDG_CONFIG_HOME: "/xdg" },
      { SIMEON_CONFIG_DIR: "", XDG_CONFIG_HOME: "/xdg" },
      { SIMEON_CONFIG_DIR: " ", XDG_CONFIG_HOME: "/xdg" },
      { SIMEON_CONFIG_DIR: "\t\n ", XDG_CONFIG_HOME: "/xdg" },
      { SIMEON_CONFIG_DIR: undefined, XDG_CONFIG_HOME: "/xdg" },
      { SIMEON_CONFIG_DIR: null, XDG_CONFIG_HOME: "/xdg" },
      { XDG_CONFIG_HOME: "/xdg/" },
      { XDG_CONFIG_HOME: "/a/b/../c/" },
      { XDG_CONFIG_HOME: " /spaced " },
      { XDG_CONFIG_HOME: "relative/dir" },
      { XDG_CONFIG_HOME: "." },
      { XDG_CONFIG_HOME: "x" },
    ].map((env) => [env, paths.getConfigDir(env)])),
  },
  {
    name: "with neither, or both of spaces only, it is .simeon in the home folder",
    run: async ({ paths }, tools) => {
      const home = await tools.tmp();
      const asked = (env) => tools.scrub(paths.getConfigDir(env), { [home]: "<home>" });
      return [
        await withEnv({ HOME: home }, () => [
          {},
          { SIMEON_CONFIG_DIR: "", XDG_CONFIG_HOME: "" },
          { SIMEON_CONFIG_DIR: "  ", XDG_CONFIG_HOME: "\t" },
          { SIMEON_CONFIG_DIR: undefined, XDG_CONFIG_HOME: undefined },
          { SIMEON_CONFIG_DIR: null, XDG_CONFIG_HOME: null },
          { HOME: "/another/home", SIMEON_CONFIG: "/not/read", CONFIG_DIR: "/not/read", XDG_CONFIG_DIRS: "/not/read" },
        ].map((env) => [env, asked(env)])),
        await withEnv({ HOME: `${home}/` }, () => asked({})),
        await withEnv({ HOME: `${home}/inner/..` }, () => asked({})),
        await withEnv({ HOME: "" }, () => asked({})),
        await withEnv({ HOME: "relative/home" }, () => asked({})),
      ];
    },
  },
  {
    name: "asked with nothing, the settings folder is read from the process's own environment, each time it is asked",
    run: async ({ paths }, tools) => {
      const home = await tools.tmp();
      const asked = () => tools.scrub(paths.getConfigDir(), { [home]: "<home>" });
      return [
        await withEnv({ HOME: home }, asked),
        await withEnv({ HOME: home, XDG_CONFIG_HOME: "/process/xdg" }, asked),
        await withEnv({ HOME: home, XDG_CONFIG_HOME: "/process/xdg", SIMEON_CONFIG_DIR: "/process/own" }, asked),
        await withEnv({ HOME: home, XDG_CONFIG_HOME: "/process/xdg", SIMEON_CONFIG_DIR: "/process/own" }, () => tools.scrub(paths.getConfigDir(undefined), { [home]: "<home>" })),
        await withEnv({ HOME: home, SIMEON_CONFIG_DIR: " " }, asked),
      ];
    },
  },
  {
    name: "each setting is read once and in turn: XDG_CONFIG_HOME only when SIMEON_CONFIG_DIR gives nothing",
    run: ({ paths }) => withEnv({ HOME: "/recorded/home" }, () => {
      const asked = (values) => {
        const reads = [];
        const env = new Proxy(values, {
          get(target, name) {
            reads.push(String(name));
            return target[name];
          },
        });
        return { folder: paths.getConfigDir(env), reads };
      };
      return [
        asked({ SIMEON_CONFIG_DIR: "/own", XDG_CONFIG_HOME: "/xdg" }),
        asked({ SIMEON_CONFIG_DIR: " ", XDG_CONFIG_HOME: "/xdg" }),
        asked({ XDG_CONFIG_HOME: " " }),
        asked({}),
      ];
    }),
  },

  // ── project-permissions-file-provider.ts ──────────────────────────────────
  {
    name: "auto-run settings are read from an object only; anything else gives nothing",
    run: ({ project }) => [
      undefined,
      null,
      true,
      false,
      0,
      12,
      10n,
      "",
      "allow_instructions",
      Symbol("settings"),
      () => ({ allow_instructions: ["from a function"] }),
      [],
      [{ allow_instructions: ["inside a list"] }],
      Object.assign(["a list with fields"], { allow_instructions: ["a"], block_instructions: ["b"] }),
    ].map((value) => project.parsePermissionsAutoRunConfig(value)),
  },
  {
    name: "an object's allow_instructions and block_instructions are each a list or undefined, both always there, other fields not read",
    run: ({ project }) => [
      {},
      { allow_instructions: ["run the tests"] },
      { block_instructions: ["never push"] },
      { allow_instructions: ["run the tests", "read files"], block_instructions: ["never push", "never delete"] },
      { block_instructions: ["block written first"], allow_instructions: ["allow written second"] },
      { allow_instructions: [], block_instructions: [] },
      { allowInstructions: ["camel case"], blockInstructions: ["camel case"] },
      { ALLOW_INSTRUCTIONS: ["capitals"], Block_Instructions: ["capitals"] },
      { "allow_instructions ": ["a space after"], " block_instructions": ["a space before"] },
      { allow_instructions: ["kept"], other: "not read", allow: ["not read"], deny: ["not read"] },
    ].map((value) => project.parsePermissionsAutoRunConfig(value)),
  },
  {
    name: "a list keeps its texts only, in their order, empty and repeated ones too",
    run: ({ project }) => [
      { allow_instructions: ["a", 1, null, "", " ", {}, ["nested"], true, undefined, "b", 2n, "a"] },
      { block_instructions: [0, false, null, undefined, {}, []] },
      { allow_instructions: ["first", , "after a gap"], block_instructions: [new String("a String object"), "a plain text"] },
      { allow_instructions: ["line\nbreak", "  spaces kept  ", "ünïcödé ✓"], block_instructions: ["x".repeat(300)] },
    ].map((value) => project.parsePermissionsAutoRunConfig(value)),
  },
  {
    name: "a field that is not a list is undefined, whatever it holds",
    run: ({ project }) => [
      { allow_instructions: "one text", block_instructions: 5 },
      { allow_instructions: null, block_instructions: undefined },
      { allow_instructions: { 0: "list-like", length: 1 }, block_instructions: new Set(["a set"]) },
      { allow_instructions: true, block_instructions: ["a real list"] },
    ].map((value) => project.parsePermissionsAutoRunConfig(value)),
  },
  {
    name: "any object will do: a map, a date, one whose fields come from the object it was made from",
    run: ({ project }) => [
      new Map([["allow_instructions", ["in a map, not a field"]]]),
      new Date(0),
      Object.assign(new Map(), { allow_instructions: ["a field on a map"] }),
      Object.create({ allow_instructions: ["inherited allow"], block_instructions: ["inherited block"] }),
      Object.assign(Object.create(null), { block_instructions: ["no prototype"] }),
      new (class Settings { allow_instructions = ["from a class"]; })(),
    ].map((value) => project.parsePermissionsAutoRunConfig(value)),
  },
  {
    name: "each field is read once, allow before block, and the lists handed back are new ones",
    run: ({ project }) => {
      const reads = [];
      const allow = ["a"];
      const block = ["b"];
      const given = {
        get block_instructions() { reads.push("block_instructions"); return block; },
        get allow_instructions() { reads.push("allow_instructions"); return allow; },
      };
      const first = project.parsePermissionsAutoRunConfig(given);
      const second = project.parsePermissionsAutoRunConfig(given);
      first.allowInstructions.push("added to what came back");
      return {
        reads,
        first,
        second,
        given: { allow, block },
        sameAllowList: first.allowInstructions === allow,
        sameBlockList: first.blockInstructions === block,
        sameAnswerTwice: first === second,
        fields: Object.keys(first),
      };
    },
  },
  {
    name: "a project's permissions file that is not one JSON object gives nothing",
    run: ({ project }) => [
      "",
      " ",
      "\n\t",
      "// only a comment",
      "/* only a comment */",
      "null",
      "true",
      "false",
      "0",
      "12",
      '""',
      '"autoRun"',
      "[]",
      `[{"autoRun": ${FULL_AUTO_RUN}}]`,
      "undefined",
      "autoRun",
    ].map((raw) => [raw, project.parseProjectPermissionsFileConfig(raw)]),
  },
  {
    name: "a project's permissions file with a mistake in it gives nothing, wherever the mistake is",
    run: ({ project }) => [
      `{"autoRun": ${FULL_AUTO_RUN}`,
      `{"autoRun": ${FULL_AUTO_RUN}}}`,
      `{"autoRun": ${FULL_AUTO_RUN}} {}`,
      `{"autoRun": ${FULL_AUTO_RUN}} trailing words`,
      `{'autoRun': ${FULL_AUTO_RUN}}`,
      `{autoRun: ${FULL_AUTO_RUN}}`,
      `{"autoRun" ${FULL_AUTO_RUN}}`,
      '{"autoRun": {"allow_instructions": ["a",,"b"]}}',
      '{"autoRun": {"allow_instructions": ["a" "b"]}}',
      '{"autoRun": {"allow_instructions": ["a", "b"}}',
      '{"autoRun": {"allow_instructions": ["unfinished text]}}',
      '{,}',
      '{"autoRun": }',
      `{"autoRun": ${FULL_AUTO_RUN},,}`,
      `{"other": 01, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"other": "bad \\q escape", "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoRun": ${FULL_AUTO_RUN}} /* comment never closed`,
      `﻿{"autoRun": ${FULL_AUTO_RUN}}`,
    ].map((raw) => [raw, project.parseProjectPermissionsFileConfig(raw)]),
  },
  {
    name: "a project's permissions file may hold comments, trailing commas and other fields",
    run: ({ project }) => [
      "{}",
      "{ }",
      "{} // after",
      `{"autoRun": ${FULL_AUTO_RUN}}`,
      `  \n{\n  "autoRun": ${FULL_AUTO_RUN}\n}\n`,
      `// the project's rules\n{\n  /* what may run */ "autoRun": ${FULL_AUTO_RUN} // end\n}`,
      `{"autoRun": {"allow_instructions": ["a", "b",], "block_instructions": [],},}`,
      `{"terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"], "version": 2, "autoRun": ${FULL_AUTO_RUN}}`,
      '{"terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"]}',
      '{"autoRun": {"allow_instructions": ["a", 1, null, "", {"b": 1}, ["c"], true, "a"], "block_instructions": "not a list"}}',
      '{"autoRun": {"allow_instructions": ["tab\\there", "\\u00e9crit", "quote \\" kept", "back\\\\slash"]}}',
      '{"autoRun": {"allowInstructions": ["camel case"], "blockInstructions": ["camel case"]}}',
    ].map((raw) => [raw, project.parseProjectPermissionsFileConfig(raw)]),
  },
  {
    name: "autoReview is read before autoRun, which is read only when autoReview is missing or null; the fields' names are exact",
    run: ({ project }) => [
      `{"autoReview": ${FULL_AUTO_REVIEW}}`,
      `{"autoReview": ${FULL_AUTO_REVIEW}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoRun": ${FULL_AUTO_RUN}, "autoReview": ${FULL_AUTO_REVIEW}}`,
      `{"autoReview": null, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": false, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": 0, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": "", "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": [], "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": {}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": {"allow_instructions": ["only allow"]}, "autoRun": ${FULL_AUTO_RUN}}`,
      '{"autoReview": null, "autoRun": null}',
      '{"autoRun": "a text"}',
      '{"autoRun": ["a list"]}',
      '{"autoRun": 3}',
      `{"AutoRun": ${FULL_AUTO_RUN}}`,
      `{"autorun": ${FULL_AUTO_RUN}}`,
      `{"AUTOREVIEW": ${FULL_AUTO_REVIEW}, "auto_run": ${FULL_AUTO_RUN}, "auto-run": ${FULL_AUTO_RUN}}`,
      `{"autoRun": {"allow_instructions": ["written first"]}, "autoRun": {"allow_instructions": ["written last"]}}`,
      `{"__proto__": {"autoRun": ${FULL_AUTO_RUN}}}`,
      `{"settings": {"autoRun": ${FULL_AUTO_RUN}}}`,
    ].map((raw) => [raw, project.parseProjectPermissionsFileConfig(raw)]),
  },
  {
    name: "what a project's file gives has one field, autoRun, and is made anew each time",
    run: ({ project }) => {
      const raw = `{"autoRun": ${FULL_AUTO_RUN}}`;
      const first = project.parseProjectPermissionsFileConfig(raw);
      const second = project.parseProjectPermissionsFileConfig(raw);
      return {
        fields: Object.keys(first),
        emptyFields: Object.keys(project.parseProjectPermissionsFileConfig("{}")),
        autoRunFields: Object.keys(first.autoRun),
        sameAnswerTwice: first === second,
        sameAutoRunTwice: first.autoRun === second.autoRun,
      };
    },
  },

  // ── permissions-file-provider.ts ──────────────────────────────────────────
  {
    name: "the person's permissions file is permissions.json in the settings folder of the process's environment",
    run: async ({ permissions }, tools) => {
      const home = await tools.tmp();
      const asked = () => tools.scrub(permissions.PermissionsFileProvider.getPermissionsFilePath(), { [home]: "<home>" });
      const { getPermissionsFilePath } = permissions.PermissionsFileProvider;
      return [
        await withEnv({ HOME: home }, asked),
        await withEnv({ HOME: home, XDG_CONFIG_HOME: "/process/xdg" }, asked),
        await withEnv({ HOME: home, XDG_CONFIG_HOME: "/process/xdg", SIMEON_CONFIG_DIR: "/process/own" }, asked),
        await withEnv({ HOME: home, SIMEON_CONFIG_DIR: "/process/own/" }, asked),
        await withEnv({ HOME: home, SIMEON_CONFIG_DIR: "/a/b/../own" }, asked),
        await withEnv({ HOME: home, SIMEON_CONFIG_DIR: "relative" }, asked),
        await withEnv({ HOME: home, SIMEON_CONFIG_DIR: "/process/own" }, () => getPermissionsFilePath("/an/argument/not/read")),
      ];
    },
  },
  {
    name: "a path with no file, a folder, a link to nowhere: nothing is loaded and nothing is thrown",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const { PermissionsFileProvider } = permissions;
      await mkdir(path.join(dir, "a-folder.json"));
      await writeFile(path.join(dir, "real.json"), LISTS);
      await symlink(path.join(dir, "gone.json"), path.join(dir, "link-to-nowhere.json"));
      await symlink(path.join(dir, "real.json"), path.join(dir, "link-to-real.json"));
      return {
        missing: await told(await PermissionsFileProvider.load(path.join(dir, "missing.json"))),
        missingFolder: await told(await PermissionsFileProvider.load(path.join(dir, "no-such-folder", "permissions.json"))),
        folder: await told(await PermissionsFileProvider.load(path.join(dir, "a-folder.json"))),
        fileUsedAsFolder: await told(await PermissionsFileProvider.load(path.join(dir, "real.json", "permissions.json"))),
        linkToNowhere: await told(await PermissionsFileProvider.load(path.join(dir, "link-to-nowhere.json"))),
        linkToFile: await told(await PermissionsFileProvider.load(path.join(dir, "link-to-real.json"))),
        file: await told(await PermissionsFileProvider.load(path.join(dir, "real.json"))),
        anyName: await (async () => {
          await writeFile(path.join(dir, "rules.txt"), LISTS);
          return told(await PermissionsFileProvider.load(path.join(dir, "rules.txt")));
        })(),
      };
    },
  },
  {
    name: "with no path, an undefined or a null one, the file of the settings folder is loaded; an empty path loads nothing",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const { PermissionsFileProvider } = permissions;
      const { load } = PermissionsFileProvider;
      await mkdir(path.join(dir, "own"));
      await mkdir(path.join(dir, "xdg", "cursor"), { recursive: true });
      await mkdir(path.join(dir, "home", ".simeon"), { recursive: true });
      await writeFile(path.join(dir, "own", "permissions.json"), '{"terminalAllowlist": ["from SIMEON_CONFIG_DIR"]}');
      await writeFile(path.join(dir, "xdg", "cursor", "permissions.json"), '{"terminalAllowlist": ["from XDG_CONFIG_HOME"]}');
      await writeFile(path.join(dir, "home", ".simeon", "permissions.json"), '{"terminalAllowlist": ["from the home folder"]}');
      await writeFile(path.join(dir, "other.json"), '{"terminalAllowlist": ["from the path given"]}');
      const all = { HOME: path.join(dir, "home"), XDG_CONFIG_HOME: path.join(dir, "xdg"), SIMEON_CONFIG_DIR: path.join(dir, "own") };
      return {
        noPath: await withEnv(all, async () => told(await PermissionsFileProvider.load())),
        undefinedPath: await withEnv(all, async () => told(await PermissionsFileProvider.load(undefined))),
        nullPath: await withEnv(all, async () => told(await PermissionsFileProvider.load(null))),
        emptyPath: await withEnv(all, async () => told(await PermissionsFileProvider.load(""))),
        pathGiven: await withEnv(all, async () => told(await PermissionsFileProvider.load(path.join(dir, "other.json")))),
        takenOffTheClass: await withEnv(all, async () => told(await load())),
        fromXdg: await withEnv({ ...all, SIMEON_CONFIG_DIR: undefined }, async () => told(await PermissionsFileProvider.load())),
        fromHome: await withEnv({ HOME: all.HOME }, async () => told(await PermissionsFileProvider.load())),
        settingsFolderWithoutFile: await withEnv({ HOME: path.join(dir, "xdg") }, async () => told(await PermissionsFileProvider.load())),
      };
    },
  },
  {
    name: "a file that is empty, or holds something that is not an object, loads nothing",
    run: (modules, tools) => loadedEach(modules, tools, [
      "",
      " \n",
      "// only a comment",
      "null",
      "false",
      "true",
      "0",
      "12",
      '""',
      '"terminalAllowlist"',
      "not json at all",
      "[]",
      '["ls"]',
      `[${LISTS}]`,
      "{}",
      '{"version": 1, "other": ["ls"]}',
    ]),
  },
  {
    name: "terminalAllowlist becomes Shell(…) rules and mcpAllowlist Mcp(…) rules, the terminal's first, with nothing denied",
    run: (modules, tools) => loadedEach(modules, tools, [
      '{"terminalAllowlist": ["ls", "git status"], "mcpAllowlist": ["files:read", "search:*"]}',
      '{"mcpAllowlist": ["files:read"], "terminalAllowlist": ["ls"]}',
      '{"terminalAllowlist": ["ls"]}',
      '{"mcpAllowlist": ["files:read"]}',
      '{"terminalAllowlist": ["ls", "ls", "", " ", "rm -rf (x)", "Shell(ls)", "naïve ✓", "two\\nlines"]}',
      '{"mcpAllowlist": ["", "a:b", "a:b", "Mcp(a)", "*"]}',
      '{"terminalAllowlist": ["ls", 1, null, true, {"command": "pwd"}, ["cd"], 2.5, "pwd"], "mcpAllowlist": [null, "files:read", 0, false, {}, []]}',
      '{"terminalAllowlist": ["ls"], "mcpAllowlist": [], "deny": ["Shell(rm)"], "terminalDenylist": ["rm"], "allow": ["Read(*)"]}',
    ]),
  },
  {
    name: "a list that is not a list, or holds no text, counts as empty",
    run: (modules, tools) => loadedEach(modules, tools, [
      '{"terminalAllowlist": [], "mcpAllowlist": []}',
      '{"terminalAllowlist": "ls", "mcpAllowlist": "files:read"}',
      '{"terminalAllowlist": {"0": "ls", "length": 1}, "mcpAllowlist": null}',
      '{"terminalAllowlist": [1, null, true, {}, []], "mcpAllowlist": [[["deep"]]]}',
      '{"terminalAllowlist": true, "mcpAllowlist": ["files:read"]}',
      '{"terminalAllowlist": ["ls"], "mcpAllowlist": 7}',
    ]),
  },
  {
    name: "instructions come from autoReview, else autoRun, and alone are enough for the file to count",
    run: (modules, tools) => loadedEach(modules, tools, [
      `{"autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": ${FULL_AUTO_REVIEW}}`,
      `{"autoReview": ${FULL_AUTO_REVIEW}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoRun": ${FULL_AUTO_RUN}, "autoReview": ${FULL_AUTO_REVIEW}}`,
      '{"autoRun": {"allow_instructions": ["only allow"]}}',
      '{"autoRun": {"block_instructions": ["only block"]}}',
      '{"autoRun": {"block_instructions": ["block written first"], "allow_instructions": ["allow written second"]}}',
      '{"autoRun": {"allow_instructions": ["a", 1, null, "", "a", {"b": 1}], "block_instructions": "not a list"}}',
      '{"autoRun": {"allow_instructions": [""]}}',
      `{"autoRun": ${FULL_AUTO_RUN}, "terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"]}`,
    ]),
  },
  {
    name: "autoRun is read only when autoReview is missing or null; instructions that come to nothing do not make the file count",
    run: (modules, tools) => loadedEach(modules, tools, [
      `{"autoReview": null, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": false, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": 0, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": "", "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": [], "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": {}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": {"allow_instructions": [], "block_instructions": []}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"autoReview": false, "autoRun": ${FULL_AUTO_RUN}, "terminalAllowlist": ["ls"]}`,
      `{"autoReview": {"block_instructions": ["only block from autoReview"]}, "autoRun": ${FULL_AUTO_RUN}}`,
      '{"autoRun": {}}',
      '{"autoRun": {"allow_instructions": [], "block_instructions": []}}',
      '{"autoRun": {"allow_instructions": [1, null], "block_instructions": [{}]}}',
      '{"autoRun": ["allow_instructions"]}',
      '{"autoRun": "allow_instructions"}',
      '{"autoRun": {"allowInstructions": ["camel case"], "blockInstructions": ["camel case"]}}',
      '{"autoRun": {"ALLOW_INSTRUCTIONS": ["capitals"], "Block_Instructions": ["capitals"]}}',
      '{"autoRun": {"allow_instructions": [], "block_instructions": []}, "terminalAllowlist": ["ls"]}',
    ]),
  },
  {
    name: "the four fields are found whatever their capitals, the first so named in the file winning even when it holds no list",
    run: (modules, tools) => loadedEach(modules, tools, [
      '{"TERMINALALLOWLIST": ["capitals"], "MCPALLOWLIST": ["capitals"]}',
      '{"terminalallowlist": ["small letters"], "mcpallowlist": ["small letters"]}',
      '{"TerminalAllowList": ["mixed"], "McpAllowList": ["mixed"]}',
      `{"AUTORUN": ${FULL_AUTO_RUN}}`,
      `{"AutoReview": ${FULL_AUTO_REVIEW}, "autorun": ${FULL_AUTO_RUN}}`,
      '{"TerminalAllowlist": ["written first"], "terminalAllowlist": ["written second"]}',
      '{"terminalAllowlist": ["written first"], "TERMINALALLOWLIST": ["written second"]}',
      '{"MCPAllowlist": "written first, not a list", "mcpAllowlist": ["written second"]}',
      '{"TerminalAllowlist": null, "terminalAllowlist": ["written second"], "mcpAllowlist": ["files:read"]}',
      `{"AUTOREVIEW": null, "autoReview": ${FULL_AUTO_REVIEW}, "autoRun": ${FULL_AUTO_RUN}}`,
      `{"AUTOREVIEW": null, "autoReview": ${FULL_AUTO_REVIEW}}`,
      `{"AutoRun": 5, "autoRun": ${FULL_AUTO_RUN}}`,
      '{"terminalAllowlist": ["written first"], "terminalAllowlist": ["same name, written last"]}',
      '{"1": ["a number as a name"], "terminalAllowlist": ["ls"]}',
    ]),
  },
  {
    name: "a name that is close but not the same is not read",
    run: (modules, tools) => loadedEach(modules, tools, [
      '{"terminalAllowlist ": ["a space after"]}',
      '{" mcpAllowlist": ["a space before"]}',
      '{"terminal_allowlist": ["with a line"], "mcp_allowlist": ["with a line"]}',
      '{"terminalAllowList2": ["one more letter"], "mcpAllowlists": ["one more letter"]}',
      '{"terminalAllowliſt": ["a long s"], "mcpAllowlıst": ["a dotless i"]}',
      '{"TERMİNALALLOWLİST": ["a dotted capital I"]}',
      `{"auto_run": ${FULL_AUTO_RUN}, "auto-review": ${FULL_AUTO_REVIEW}, "autoRuns": ${FULL_AUTO_RUN}}`,
      `{"permissions": ${LISTS}}`,
      `{"__proto__": ${LISTS}}`,
      `{"__proto__": {"autoRun": ${FULL_AUTO_RUN}}}`,
    ]),
  },
  {
    name: "a file with mistakes in it is still read as far as it can be",
    run: (modules, tools) => loadedEach(modules, tools, [
      `// the person's rules\n{\n  /* commands */ "terminalAllowlist": ["ls"], // run unasked\n  "mcpAllowlist": ["files:read"]\n}\n`,
      '{"terminalAllowlist": ["ls",], "mcpAllowlist": ["files:read",],}',
      '{"terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"]',
      '{"terminalAllowlist": ["ls"',
      '{"terminalAllowlist": ["ls", "unfinished',
      '{"terminalAllowlist": ["ls"]}}} trailing words',
      `${LISTS} {"terminalAllowlist": ["a second object"]}`,
      "{'terminalAllowlist': ['single quotes']}",
      '{terminalAllowlist: ["no quotes around the name"]}',
      '{"terminalAllowlist" ["no colon"]}',
      '{"terminalAllowlist": ["a" "b"], "mcpAllowlist": ["c",,"d"]}',
      '{"terminalAllowlist": [ls, "pwd"]}',
      `﻿${LISTS}`,
      `\n\n   ${LISTS}   \n`,
    ]),
  },
  {
    name: "a file is read again each time it is loaded, and a provider keeps what it read",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "permissions.json");
      await writeFile(file, '{"terminalAllowlist": ["as first written"]}');
      const first = await permissions.PermissionsFileProvider.load(file);
      await writeFile(file, '{"terminalAllowlist": ["as written again"], "autoRun": {"allow_instructions": ["added later"]}}');
      const second = await permissions.PermissionsFileProvider.load(file);
      await writeFile(file, "{}");
      const third = await permissions.PermissionsFileProvider.load(file);
      return { first: await told(first), second: await told(second), third: await told(third) };
    },
  },
  {
    name: "a file's rules are handed out as the same lists each time, in an answer made anew",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "permissions.json");
      await writeFile(file, `{"terminalAllowlist": ["ls"], "mcpAllowlist": ["files:read"], "autoRun": ${FULL_AUTO_RUN}}`);
      const provider = await permissions.PermissionsFileProvider.load(file);
      const other = await permissions.PermissionsFileProvider.load(file);
      const first = await provider.getPermissions();
      const second = await provider.getPermissions();
      const asItCame = structuredClone(first);
      first.allow.push("Shell(added to what came back)");
      first.deny.push("Shell(denied in what came back)");
      return {
        isProvider: provider instanceof permissions.PermissionsFileProvider,
        className: provider.constructor.name,
        first: asItCame,
        fields: Object.keys(first),
        policyFields: Object.keys(first.userConfiguredPolicy),
        sameAnswerTwice: first === second,
        sameAllowTwice: first.allow === second.allow,
        sameDenyTwice: first.deny === second.deny,
        samePolicyTwice: first.userConfiguredPolicy === second.userConfiguredPolicy,
        afterTheChange: await provider.getPermissions(),
        loadedTwiceIsTwoProviders: provider !== other,
        theOtherIsUntouched: await other.getPermissions(),
      };
    },
  },
  {
    name: "a file's instructions are handed out as copies: changing what came back changes nothing",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "permissions.json");
      await writeFile(file, `{"autoRun": ${FULL_AUTO_RUN}}`);
      const provider = await permissions.PermissionsFileProvider.load(file);
      const first = provider.getAutoRunInstructions();
      const second = provider.getAutoRunInstructions();
      const asItCame = structuredClone(first);
      first.allowInstructions.push("added to what came back");
      first.blockInstructions.length = 0;
      return {
        first: asItCame,
        second,
        fields: Object.keys(second),
        sameAnswerTwice: first === second,
        sameAllowTwice: first.allowInstructions === second.allowInstructions,
        sameBlockTwice: first.blockInstructions === second.blockInstructions,
        afterTheChange: provider.getAutoRunInstructions(),
      };
    },
  },
  {
    name: "a provider made by hand keeps the very objects it was given, and reads them when asked",
    run: async ({ permissions }) => {
      const rules = { allow: ["Shell(ls)"], deny: ["Shell(rm)"], extra: "not handed out" };
      const instructions = { allowInstructions: ["allow"], blockInstructions: ["block"], extra: "not handed out" };
      const provider = new permissions.PermissionsFileProvider(rules, instructions);
      const asked = async () => ({ permissions: await provider.getPermissions(), instructions: provider.getAutoRunInstructions() });
      const first = await asked();
      const atFirst = structuredClone(first);
      const sameLists = { allow: first.permissions.allow === rules.allow, deny: first.permissions.deny === rules.deny, allowInstructions: first.instructions.allowInstructions === instructions.allowInstructions, blockInstructions: first.instructions.blockInstructions === instructions.blockInstructions };
      rules.allow.push("Mcp(added to the list given)");
      instructions.blockInstructions.push("added to the list given");
      const afterAdding = structuredClone(await asked());
      rules.allow = ["Shell(a new list in the object given)"];
      rules.deny = [];
      instructions.allowInstructions = ["a new list in the object given"];
      instructions.blockInstructions = [];
      const afterReplacing = await asked();
      const empty = new permissions.PermissionsFileProvider({ allow: [], deny: [] }, { allowInstructions: [], blockInstructions: [] });
      return {
        atFirst,
        sameLists,
        afterAdding,
        afterReplacing,
        empty: { permissions: await empty.getPermissions(), instructions: empty.getAutoRunInstructions() },
      };
    },
  },
  {
    name: "asked to change the rules, a provider does nothing: the change is never called and the file stays as it was",
    run: async ({ permissions }, tools) => {
      const dir = await tools.tmp();
      const file = path.join(dir, "permissions.json");
      await writeFile(file, LISTS);
      const provider = await permissions.PermissionsFileProvider.load(file);
      const calls = [];
      const change = (rules) => {
        calls.push(rules);
        return { allow: ["Shell(everything)"], deny: [] };
      };
      const answers = [
        await provider.updatePermissions(change),
        await provider.updatePermissions(() => { calls.push("threw"); throw new Error("never thrown"); }),
        await provider.updatePermissions(),
        await provider.updatePermissions("not a function"),
      ];
      return {
        answers,
        calls,
        after: await told(provider),
        fileAfter: await readFile(file, "utf8"),
      };
    },
  },
  {
    name: "what is asked of a provider and what answers later: loading, the rules and a change are promises, the paths and instructions are not",
    run: async ({ paths, project, permissions }, tools) => {
      const { PermissionsFileProvider } = permissions;
      const dir = await tools.tmp();
      const provider = new PermissionsFileProvider({ allow: [], deny: [] }, { allowInstructions: [], blockInstructions: [] });
      const later = (value) => value instanceof Promise;
      const loading = PermissionsFileProvider.load(path.join(dir, "missing.json"));
      const rules = provider.getPermissions();
      const change = provider.updatePermissions(() => {});
      await Promise.all([loading, rules, change]);
      return {
        later: {
          load: later(loading),
          getPermissions: later(rules),
          updatePermissions: later(change),
          getAutoRunInstructions: later(provider.getAutoRunInstructions()),
          getPermissionsFilePath: later(await withEnv({ SIMEON_CONFIG_DIR: dir }, () => PermissionsFileProvider.getPermissionsFilePath())),
        },
        parameters: {
          getConfigDir: paths.getConfigDir.length,
          parsePermissionsAutoRunConfig: project.parsePermissionsAutoRunConfig.length,
          parseProjectPermissionsFileConfig: project.parseProjectPermissionsFileConfig.length,
          PermissionsFileProvider: PermissionsFileProvider.length,
          load: PermissionsFileProvider.load.length,
          getPermissionsFilePath: PermissionsFileProvider.getPermissionsFilePath.length,
          getPermissions: PermissionsFileProvider.prototype.getPermissions.length,
          getAutoRunInstructions: PermissionsFileProvider.prototype.getAutoRunInstructions.length,
          updatePermissions: PermissionsFileProvider.prototype.updatePermissions.length,
        },
        ofTheClass: Object.getOwnPropertyNames(PermissionsFileProvider).filter((name) => !["length", "name", "prototype"].includes(name)).sort(),
        ofAProvider: Object.getOwnPropertyNames(PermissionsFileProvider.prototype).sort(),
      };
    },
  },
];
