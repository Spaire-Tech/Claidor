/**
 * How a shell command line is read before the Shell tool runs it: the
 * commands in it, its redirections, whether those only throw output away,
 * and whether it holds a substitution. The reading is done by a parser
 * package the part finds by itself, differently in each place the engine
 * runs, so the finding is written down here too.
 *
 * Most scenarios hand real command lines to the real parser. The branches no
 * real command line reaches (kinds of node only other grammars have, a
 * parser left out of a build, a packaged run) are reached with a stand-in
 * for the parser package, written into a temporary folder: it turns a tree
 * written as JSON into nodes, so any shape of tree can be handed over.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { desktopRoot, sourceRoot } from "./harness.mjs";

export const part = "packages/shell-exec";
export const modules = { parser: "source/packages/shell-exec/shell-parser.ts" };

// The test builds the parser into a temporary folder, away from the checkout's packages. The part reads this
// setting as "look for the parser's packages here" in a developer or test run, so the real ones are found.
process.env.SAND_TREE_SITTER_NODE_DEPS = path.join(desktopRoot, "node_modules");

const requireHere = createRequire(import.meta.url);

/**
 * `run`, with every list of children the real parser hands out while it goes
 * kept until it ends.
 *
 * The parser's package makes an object for a node when it is first asked
 * for, and keeps it only as long as something else does: once memory has
 * been reclaimed, the same node comes back as a new object. The part tells
 * the redirections it has read by their objects, so a reclaim at the wrong
 * moment makes it read one twice (the scenario "a parser that hands out a new
 * object…" shows what follows). When memory is reclaimed is not the test's to
 * say, so the lists are held here and every answer is the one given when no
 * reclaim comes in between, which is nearly always.
 */
function nodesHeld(run) {
  const kind = requireHere(path.join(desktopRoot, "node_modules", "tree-sitter")).SyntaxNode.prototype;
  const own = Object.getOwnPropertyDescriptor(kind, "children");
  const held = [];
  Object.defineProperty(kind, "children", {
    configurable: true,
    get() {
      const children = own.get.call(this);
      held.push(children);
      return children;
    },
  });
  try {
    return run();
  } finally {
    Object.defineProperty(kind, "children", own);
  }
}

/** The part's reading of a command by the real parser, the parser's nodes held meanwhile. */
const reader = (parser) => (...given) => nodesHeld(() => parser.analyzeShellCommand(...given));

/** Each command line with what the part says of it. */
const read = (parser, commands) => commands.map((command) => ({ command, ...reader(parser)(command) }));

/**
 * The file the test built the part into. A module can only be loaded again by
 * its address, and the test does not hand that over: it is read from where a
 * call into the part comes from (the parser asks a command given as a
 * function for its text, and that call's trail names the file).
 */
function builtFile(parser) {
  let trail = "";
  parser.analyzeShellCommand(() => {
    trail = new Error("where from").stack ?? "";
    return null;
  });
  const found = /(file:\/\/\S*\/parser\.mjs)\?/.exec(trail);
  if (found === null) throw new Error(`the built parser is not in the trail of a call into it:\n${trail}`);
  return fileURLToPath(found[1]);
}

/** The process dressed as one of the places the engine runs, for as long as `run` takes, then put back as it was. */
async function dressedAs({ packaged, deps, electron, resources, dirname }, run) {
  const kept = {
    packaged: process.env.SAND_PACKAGED,
    deps: process.env.SAND_TREE_SITTER_NODE_DEPS,
    electron: Object.getOwnPropertyDescriptor(process.versions, "electron"),
    resources: Object.getOwnPropertyDescriptor(process, "resourcesPath"),
    dirname: Object.getOwnPropertyDescriptor(globalThis, "__dirname"),
  };
  const setEnv = (name, value) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  const setOwn = (holder, name, value) => {
    delete holder[name];
    if (value !== undefined) Object.defineProperty(holder, name, { value, configurable: true, writable: true, enumerable: true });
  };
  const putBack = (holder, name, descriptor) => {
    delete holder[name];
    if (descriptor !== undefined) Object.defineProperty(holder, name, descriptor);
  };
  setEnv("SAND_PACKAGED", packaged);
  setEnv("SAND_TREE_SITTER_NODE_DEPS", deps);
  setOwn(process.versions, "electron", electron);
  setOwn(process, "resourcesPath", resources);
  setOwn(globalThis, "__dirname", dirname);
  try {
    return await run();
  } finally {
    setEnv("SAND_PACKAGED", kept.packaged);
    setEnv("SAND_TREE_SITTER_NODE_DEPS", kept.deps);
    putBack(process.versions, "electron", kept.electron);
    putBack(process, "resourcesPath", kept.resources);
    putBack(globalThis, "__dirname", kept.dirname);
  }
}

let loads = 0;
/** The part loaded once more as a fresh copy, in the place described: what it does while loading depends on where it runs. */
function loadedAgain(parser, where) {
  const built = builtFile(parser);
  loads += 1;
  return dressedAs(where, () => import(`${pathToFileURL(built).href}?again=${Date.now()}-${loads}`));
}

/** The stand-in for the parser package (`tree-sitter`). */
const STAND_IN_PARSER = `"use strict";
// A stand-in for the parser package. A command written as JSON is a tree, handed back as nodes; any other
// command is read as one command named after this copy, with the language's name and the text as its arguments.
const settings = SETTINGS;
const seen = { made: [], languages: [], parsed: [] };

function raise(how) {
  if (how === undefined) return;
  if (how.kind === "error") throw Object.assign(new Error(how.message), how.fields);
  if (how.kind === "object") throw { ...how.fields };
  if (how.kind === "inherited") throw Object.create(how.fields);
  if (how.kind === "null") throw null;
  throw how.value;
}

// A tree as it is written: what each node is, whatever object stands for it.
class Bone {
  constructor(spec, parent) {
    this.type = spec.type;
    this.text = spec.text ?? "";
    this.field = spec.field ?? null;
    this.isNamed = spec.named ?? /^[A-Za-z_]+$/.test(spec.type);
    this.parent = parent;
    // A child written as { again: true } is the child before it, listed a second time: no parser gives such a tree.
    this.children = [];
    for (const child of spec.children ?? []) this.children.push(child.again === true ? this.children[this.children.length - 1] : new Bone(child, this));
  }
}

// The objects handed out for a tree's nodes: one for each node, kept for good, or, for a tree written with
// "forgetful": true, a new one every time a node is asked for (the real package does that for a node whose
// earlier object has been reclaimed).
class Tree {
  constructor(spec) {
    this.forgetful = spec.forgetful === true;
    this.made = new Map();
    this.top = new Bone(spec, null);
  }
  get rootNode() { return this.node(this.top); }
  node(bone) {
    if (bone === null || bone === undefined) return null;
    if (this.forgetful) return new Node(bone, this);
    if (!this.made.has(bone)) this.made.set(bone, new Node(bone, this));
    return this.made.get(bone);
  }
  nodes(bones) { return bones.map((bone) => this.node(bone)); }
}

class Node {
  constructor(bone, tree) {
    this.bone = bone;
    this.tree = tree;
  }
  get type() { return this.bone.type; }
  get text() { return this.bone.text; }
  get isNamed() { return this.bone.isNamed; }
  get parent() { return this.tree.node(this.bone.parent); }
  get children() { return this.tree.nodes(this.bone.children); }
  get namedChildren() { return this.tree.nodes(this.bone.children.filter((child) => child.isNamed)); }
  get childCount() { return this.bone.children.length; }
  get namedChildCount() { return this.namedChildren.length; }
  get firstChild() { return this.child(0); }
  get lastChild() { return this.child(this.bone.children.length - 1); }
  get firstNamedChild() { return this.namedChild(0); }
  get lastNamedChild() { return this.namedChild(this.namedChildCount - 1); }
  get nextSibling() { return this.sibling(this.bone.parent?.children, 1); }
  get previousSibling() { return this.sibling(this.bone.parent?.children, -1); }
  sibling(among, step) { return among === undefined ? null : this.tree.node(among[among.indexOf(this.bone) + step]); }
  child(index) { return this.tree.node(this.bone.children[index]); }
  namedChild(index) { return this.tree.node(this.bone.children.filter((child) => child.isNamed)[index]); }
  childForFieldName(name) { return this.tree.node(this.bone.children.find((child) => child.field === name)); }
  childrenForFieldName(name) { return this.tree.nodes(this.bone.children.filter((child) => child.field === name)); }
  fieldNameForChild(index) { return this.bone.children[index]?.field ?? null; }
  toString() { return this.bone.type; }
}

raise(settings.onLoad);

class Parser {
  constructor(...given) {
    seen.made.push(given);
    raise(settings.onNew);
  }
  setLanguage(...given) {
    seen.languages.push(given);
    raise(settings.onLanguage);
    this.language = given[0];
    return this;
  }
  parse(...given) {
    seen.parsed.push(given);
    const text = given[0];
    if (typeof text === "string" && text.startsWith("{")) return new Tree(JSON.parse(text));
    const word = (value) => ({ type: "word", text: String(value), field: "argument" });
    const name = { type: "command_name", text: settings.label, field: "name" };
    return new Tree({ type: "program", children: [{ type: "command", children: [name, word(this.language?.label), word(text)] }] });
  }
}
Parser.seen = seen;
module.exports = Parser;
`;

/** The stand-in for the language package (`tree-sitter-bash`). */
const STAND_IN_LANGUAGE = `"use strict";
const settings = SETTINGS;
if (settings.onLoad !== undefined) throw Object.assign(new Error(settings.onLoad.message), settings.onLoad.fields);
module.exports = { name: "bash", label: settings.label };
`;

/**
 * The two stand-in packages written into `root`, as a staged folder of the
 * engine holds them. `parser` and `language` are each's settings (`false`:
 * the package is left out): `label` names the copy, `onLoad`, `onNew` and
 * `onLanguage` say what to throw at that moment.
 */
async function stage(root, { parser = {}, language = {} } = {}) {
  const write = async (name, source, settings) => {
    if (settings === false) return;
    const dir = path.join(root, name);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "package.json"), JSON.stringify({ name, version: "0.0.0", main: "index.js" }));
    await writeFile(path.join(dir, "index.js"), source.replace("SETTINGS", JSON.stringify({ label: name, ...settings })));
  };
  await write("tree-sitter", STAND_IN_PARSER, parser);
  await write("tree-sitter-bash", STAND_IN_LANGUAGE, language);
  return root;
}

/** The part loaded afresh onto stand-in packages staged in a temporary folder, with what the stand-in parser saw. */
async function onStandIn(parser, tools, settings = {}) {
  const root = await stage(await tools.tmp(), settings);
  const again = await loadedAgain(parser, { deps: root });
  return { again, root, seen: requireHere(path.join(root, "tree-sitter")).seen, language: requireHere(path.join(root, "tree-sitter-bash")) };
}

/** A node of a tree written by hand: its kind, its text, its children, and the field it fills in its parent. */
const node = (type, text = "", children = [], field = undefined) => ({ type, text, children, ...(field === undefined ? {} : { field }) });
const named = (field, made) => ({ ...made, field });
const program = (...children) => node("program", "", children);
const word = (text) => node("word", text);
/** A command as the bash grammar gives it: a name, then arguments. */
const command = (name, ...args) => node("command", [name, ...args].join(" "), [node("command_name", name, [word(name)], "name"), ...args.map((arg) => named("argument", word(arg)))]);
/** A file redirection: an optional descriptor, an operator, then whatever follows. */
const redirect = (text, ...children) => node("file_redirect", text, children);
const descriptor = (text) => node("file_descriptor", text);
const sign = (text) => ({ type: text, text, named: false });

/** Trees written by hand, each with what the part says of it. */
const readTrees = (again, cases) => cases.map(({ about, tree }) => ({ about, ...again.analyzeShellCommand(JSON.stringify(tree)) }));

/** An error as it is kept: its name, its message and its own fields in their order, this run's folders written as names. */
function told(error, tools, names) {
  const clean = (value) => {
    if (typeof value === "string") return tools.scrub(value, names);
    if (Array.isArray(value)) return value.map(clean);
    return value;
  };
  if (!(error instanceof Error)) return { thrown: clean(error) };
  const fields = {};
  for (const key of Object.keys(error)) fields[key] = key === "cause" && error.cause instanceof Error ? told(error.cause, tools, names) : clean(error[key]);
  return { name: error.name, message: clean(error.message), fields };
}

/** What loading the part gave: which copies of the packages it reads with (the stand-ins name themselves), or the error. */
async function tried(load, tools, names) {
  try {
    const loaded = await load();
    return { readsWith: loaded.analyzeShellCommand("probe").structured.executableCommands.map((found) => found.fullText) };
  } catch (error) {
    return { refused: told(error, tools, names) };
  }
}

/** The part loaded afresh in the place described. */
const loading = (parser, tools, where, names) => tried(() => loadedAgain(parser, where), tools, names);

/**
 * The part built as the engine's own builds are, as CommonJS, where a file
 * knows its name and folder but has no address of the module kind unless
 * the build gives it one (`ownAddress`, as the engine's main build does).
 */
async function builtAsCommonJs({ ownAddress = false } = {}) {
  const { outputFiles } = await build({
    entryPoints: [path.join(sourceRoot(), modules.parser)],
    bundle: true,
    write: false,
    format: "cjs",
    platform: "node",
    target: "node22",
    logLevel: "silent",
    nodePaths: [path.join(desktopRoot, "node_modules")],
    ...(ownAddress ? { banner: { js: 'const __import_meta_url = require("node:url").pathToFileURL(__filename).href;' }, define: { "import.meta.url": "__import_meta_url" } } : {}),
  });
  return outputFiles[0].text;
}

/** What `run` threw, kept as a value, or "nothing thrown". */
function thrownBy(run) {
  try {
    run();
    return "nothing thrown";
  } catch (error) {
    return error instanceof Error ? { name: error.name, message: error.message, fields: { ...error } } : { thrown: error };
  }
}

/** `console.warn` put aside while `run` goes, and what was said to it. */
function warningsDuring(run) {
  const warn = console.warn;
  const said = [];
  console.warn = (...words) => { said.push(words); };
  try {
    return { result: run(), said };
  } finally {
    console.warn = warn;
  }
}

const STUBBED = "SIMEON_TREE_SITTER_STUBBED";

export const scenarios = [
  {
    name: "an empty line, blanks and comments hold no command",
    run: ({ parser }) => read(parser, ["", " ", "\t", "\n\n", "   \n  ", "# only a comment", "ls # a comment > x", "#!/bin/sh\nls", "# one\n# two"]),
  },
  {
    name: "a command is its name and its arguments, each argument with its kind, joined by single spaces",
    run: ({ parser }) => read(parser, [
      "ls",
      "ls -la",
      "  ls   -la  ",
      "ls\t-la",
      "ls -la\r\n",
      "echo hi;",
      "ls &",
      "git commit -m 'a b'",
      "./script.sh --flag=value -x 'a b' \"c d\" e\\ f",
      "/usr/bin/env FOO=1 node -e 'console.log(1)'",
      "echo 1 2.5 -3 0x1f",
      "time ls",
      "sudo -u root ls",
      "command -v ls",
      "xargs -I{} sh -c 'echo {}'",
      "C:\\Users\\a\\b.exe /c dir",
      "cmd.exe /c \"dir > out\"",
    ]),
  },
  {
    name: "quotes and escapes stay in the text of a name or an argument",
    run: ({ parser }) => read(parser, [
      "echo 'single quoted $x > y'",
      "echo \"double $x ${y:-z}\"",
      "echo \"\" ''",
      "echo \"a\"'b'c",
      "echo \"it's\" 'say \"hi\"'",
      "echo \"a\tb\"",
      "echo $'ansi\\n'",
      "echo $\"translated\"",
      "echo a\\ b c\\>d",
      "echo \\\"",
      "echo a\\\nb",
      "\\ls",
      "'ls' -l",
      "l's' -l",
      "\"$cmd\" arg",
      "\"my tool\" --x",
      "bash -c 'ls > out'",
      "eval \"rm -rf $x\"",
    ]),
  },
  {
    name: "variables, arithmetic, braces and globs are arguments of their own kinds",
    run: ({ parser }) => read(parser, [
      "$cmd arg",
      "${cmd} arg",
      "echo ${x} ${x:-d} ${#x} ${x[@]} ${!x} $1 $@ $? $$",
      "echo $((1+2)) $[3]",
      "(( x = 1 + 2 ))",
      "echo {a,b}{1..3} ~/x *.txt",
      "echo ?(a|b)",
      "a=(1 2); echo ${a[0]}",
      "echo a{b,c}d [abc]* file?.txt",
    ]),
  },
  {
    name: "pipes, lists and lines give every command in the order written, a repeated name each time",
    run: ({ parser }) => read(parser, [
      "ls | grep x | wc -l",
      "ls |& grep x",
      "a && b || c; d & e",
      "ls; ls; ls",
      "ls\nls -l\npwd",
      "( a; b ) | c",
      "{ a; b; }",
      "! grep -q x file",
      "a | b | a",
    ]),
  },
  {
    name: "an assignment or a declaration is no command, a command after assignments is",
    run: ({ parser }) => read(parser, [
      "FOO=bar",
      "a=b c=d",
      "FOO=bar BAZ=1 env",
      "a=1 b",
      "export FOO=bar",
      "declare -a arr=(1 2 3)",
      "local x=1",
      "readonly y",
      "typeset -i n=1",
      "unset x",
      "unsetenv x",
      "FOO=$(date) env",
      "x=`date`",
      "x=1 > out",
    ]),
  },
  {
    name: "the commands inside if, loops, case, functions, groups and tests are listed",
    run: ({ parser }) => read(parser, [
      "if a; then b; elif c; then d; else e; fi",
      "for i in 1 2 3; do echo $i; done",
      "for ((i=0;i<3;i++)); do echo $i; done > /dev/null",
      "while true; do sleep 1; done",
      "until false; do :; done",
      "case $x in a) echo a;; b|c) echo bc;; *) ;; esac",
      "select x in a b; do echo $x; done",
      "f() { echo hi; }",
      "function g { echo hi > out; }",
      "[ -f x ] && echo y",
      "[[ $a == b* ]] || exit 1",
      "[[ -n $(ls) ]]",
    ]),
  },
  {
    name: "a command or process substitution is noticed wherever it sits, and its commands follow the outer one",
    run: ({ parser }) => read(parser, [
      "echo $(date)",
      "echo `date`",
      "echo \"$(date)\"",
      "echo \"double `id` $(date)\"",
      "$(which ls) -l",
      "`which ls` -l",
      "echo $(echo $(echo deep))",
      "x=$(date)",
      "echo ${x:-$(date)}",
      "for f in $(ls); do echo $f; done",
      "diff <(ls a) <(ls b)",
      "tee >(cat)",
      "echo '$(not run)'",
      "echo \\$(date)",
      "echo $((1 + 2))",
    ]),
  },
  {
    name: "an output redirection gives its operator, the descriptors it changes, and its target's kind and plain text",
    run: ({ parser }) => read(parser, [
      "echo hi > out",
      "echo hi >out",
      "echo hi >> out",
      "echo hi >| out",
      "echo hi &> out",
      "echo hi &>> out",
      "echo hi 2> err",
      "echo hi 2>> err",
      "echo hi 0> out",
      "echo hi 10> out",
      "echo hi 99999999999999999999> out",
      "echo a>b",
      "echo a2>b",
      "echo a 2 > b",
      "echo hi > \"a b\"",
      "echo hi > 'a b'",
      "echo hi > ''",
      "echo hi > \"\"",
      "echo hi > \"a\\\"b\"",
      "echo hi > \"line1\nline2\"",
      "echo hi > \"a$\"",
      "echo hi > 123",
      "echo hi > a\\ b",
      "echo hi > ~/out",
      "echo hi > $out",
      "echo hi > ${out}",
      "echo hi > \"$out\"",
      "echo hi > \"/tmp/$x\"",
      "echo hi > /tmp/\"x\"",
      "echo hi >$'a\\tb'",
      "echo hi > $(mktemp)",
      "echo hi > >(tee log)",
      "echo \"a > b\" > \"c > d\"",
    ]),
  },
  {
    name: "an input redirection gives the same, on descriptor 0 unless another is written",
    run: ({ parser }) => read(parser, [
      "cat < in",
      "cat <in",
      "cat 3< in",
      "wc -l < \"$f\"",
      "cat < <(ls)",
      "cat <> file",
      "exec 3<> file",
      "sort < in > out",
      "echo x > 'a <b'",
    ]),
  },
  {
    name: "only /dev/null written plainly, bare or in quotes, counts as throwing output away",
    run: ({ parser }) => read(parser, [
      "echo hi > /dev/null",
      "echo hi >/dev/null",
      "echo hi >> /dev/null",
      "echo hi >| /dev/null",
      "echo hi &> /dev/null",
      "echo hi &>> /dev/null",
      "ls 2>/dev/null",
      "cat < /dev/null",
      "echo hi > '/dev/null'",
      "echo hi > \"/dev/null\"",
      "echo hi > \"/dev/null$x\"",
      "echo hi > \"/dev/null \"",
      "echo hi > \"/dev/\nnull\"",
      "echo hi > /dev/\"null\"",
      "echo hi > $'/dev/null'",
      "echo hi > /dev/null/",
      "echo hi > /dev/nul",
      "echo hi > //dev/null",
      "echo hi > /dev/null.txt",
      "echo hi > /DEV/NULL",
      "echo hi > NUL",
    ]),
  },
  {
    name: "a descriptor copied from another is as safe as where that one points at that moment",
    run: ({ parser }) => read(parser, [
      "echo hi 2>&1",
      "echo hi >&2",
      "echo hi 1>&2",
      "echo hi 1>&0",
      "echo hi >&3",
      "echo hi >&file",
      "echo hi >& \"2\"",
      "echo hi 2>&1-",
      "echo hi 10>&1",
      "echo hi 2>&1 2>&1",
      "echo hi > /dev/null 2>&1",
      "echo hi > file 2>&1",
      "echo hi 2>&1 > file",
      "echo hi 2>&1 >/dev/null",
      "echo hi 2> /dev/null 1>&2",
      "echo hi 2>/dev/null 1>&2 3>&1",
      "echo hi 3>&1 1>&2 2>&3",
      "echo hi &>/dev/null 3>&2",
      "echo hi > out 2>&1 3>&2",
      "echo hi > out > /dev/null 2>&1",
      "echo hi > /dev/null > out",
      "echo hi > /dev/null > /dev/null",
    ]),
  },
  {
    name: "input copied from a descriptor is safe only when that descriptor was pointed at /dev/null",
    run: ({ parser }) => read(parser, [
      "cat <&0",
      "cat <&1",
      "cat <&3",
      "cat 0<&3",
      "cat 3</dev/null <&3",
      "cat 3>/dev/null <&3",
      "cat 3< file <&3",
      "cat 3</dev/null 4<&3 <&4",
      "cat <&file",
    ]),
  },
  {
    name: "closing a descriptor counts as a redirection that is not safe, and is not listed",
    run: ({ parser }) => read(parser, ["exec 3>&-", "exec 3<&-", "cat <&-", "echo hi >&-", "echo hi > /dev/null 2>&-"]),
  },
  {
    name: "each statement starts from the standard descriptors, and what sits before a command's name is judged apart",
    run: ({ parser }) => read(parser, [
      "a > /dev/null; b 2>&1",
      "a > file; b 2>&1",
      ">/dev/null echo hi 2>&1",
      "> file echo hi 2>&1",
      "2>&1 > file echo hi",
      "{ a > x; } > y",
      "a > x; b > y",
      "{ a; b; } > /dev/null 2>&1",
      "(a > /dev/null) > out",
      "echo hi > /dev/null | cat",
      "cmd 2>&1 | tee log",
      "cmd |& tee log 2>/dev/null",
      "a=1 b=2 c > /dev/null",
      "if a > /dev/null; then b; fi 2>&1",
    ]),
  },
  {
    name: "a redirection with no command, a comment inside one, and pieces the grammar cannot place",
    run: ({ parser }) => read(parser, [
      "> out",
      "2>&1",
      "< in",
      "echo >",
      "echo hi > #c\nfile",
      "?1>",
      "done ?1>| ]",
      "exec {fd}>file",
      "cat 3<<< hello",
      "FOO=bar 2<(''",
      "> while>& &b\"\"",
    ]),
  },
  {
    name: "a here-document is input for the plain command it follows, named after that command's first word",
    run: ({ parser }) => read(parser, [
      "cat <<EOF\nhello\nEOF",
      "cat << EOF\nhello\nEOF",
      "cat <<-EOF\n\thello\n\tEOF",
      "cat <<'EOF'\nhello\nEOF",
      "cat <<\"EOF\"\nhello\nEOF",
      "cat <<\\EOF\nhello\nEOF",
      "cat 3<<EOF\nhello\nEOF",
      "FOO=bar cat <<EOF\nhello\nEOF",
      "sudo tee /etc/x <<EOF\nhello\nEOF",
      "$tool <<EOF\nhello\nEOF",
      "cat <<EOF\n${x} $y\nEOF",
      "cat <<EOF\n$(date) and `id`\nEOF",
      "python3 - <<'PY'\nprint(1)\nPY",
    ]),
  },
  {
    name: "a here-document's own text is searched for redirection signs, as every redirection's text is",
    run: ({ parser }) => read(parser, [
      "cat <<EOF\na > b\nEOF",
      "cat <<EOF\n> quoted line\nEOF",
      "cat <<EOF\na>b c<d\nEOF",
      "cat <<EOF\nif x < y\nEOF",
      "cat <<EOF\nsee 2>&1 and &> x\nEOF",
      "cat <<EOF\nsee &>x\nEOF",
      "cat <<'EOF'\n$x > y\nEOF",
      "cat <<< \"a > b\"",
      "cat <<< 'a<b'",
    ]),
  },
  {
    name: "what follows a here-document on its line belongs to it: a redirection, a pipe, a second command",
    run: ({ parser }) => read(parser, [
      "cat <<EOF > out\nhello\nEOF",
      "cat <<EOF >/dev/null\nhello\nEOF",
      "cat <<EOF 2>&1\nhello\nEOF",
      "cat <<EOF > out 2>&1\nhello\nEOF",
      "cat <<EOF > /dev/null 2>&1\nhello\nEOF",
      "cat > out <<EOF\nhello\nEOF",
      "cat > /dev/null <<EOF\nhello\nEOF",
      "cat <<EOF | grep h\nhello\nEOF",
      "cat <<EOF |& tee x\nhello\nEOF",
      "cat <<EOF && echo ok\nhello\nEOF",
      "cat <<EOF || echo no\nhello\nEOF",
      "cat <<EOF; echo next\nhello\nEOF",
      "cat <<A <<B\none\nA\ntwo\nB",
    ]),
  },
  {
    name: "a here-document for anything but a plain command, or inside a substitution that is not in double quotes, is not safe",
    run: ({ parser }) => read(parser, [
      "{ cat; } <<EOF\nhello\nEOF",
      "(cat) <<EOF\nhello\nEOF",
      "while read l; do echo $l; done <<EOF\nhello\nEOF",
      "if true; then cat; fi <<EOF\nhello\nEOF",
      "a | b <<EOF\nhello\nEOF",
      "! cat <<EOF\nhello\nEOF",
      "echo $(cat <<EOF\nhello\nEOF\n)",
      "echo \"$(cat <<EOF\nhello\nEOF\n)\"",
      "echo \"$(echo $(cat <<EOF\nhello\nEOF\n))\"",
      "echo $(echo \"$(cat <<EOF\nhello\nEOF\n)\")",
      "x=$(cat <<EOF\nhello\nEOF\n)",
      "x=\"$(cat <<EOF\nhello\nEOF\n)\"",
      "echo `cat <<EOF\nhello\nEOF\n`",
      "echo \"`cat <<EOF\nhello\nEOF\n`\"",
      "cat <(cat <<EOF\nhello\nEOF\n)",
    ]),
  },
  {
    name: "a here-document cut short is not seen as a redirection; one whose last line only starts with its end word is",
    run: ({ parser }) => read(parser, ["cat <<EOF\nhello", "cat <<EOF", "cat <<", "cat <<EOF\nhello\nEOF2", "cat <<-"]),
  },
  {
    name: "a here-string is input and never safe",
    run: ({ parser }) => read(parser, [
      "cat <<< hello",
      "cat <<<hello",
      "cat <<< $x",
      "cat <<< \"$(date)\"",
      "cat <<< hi > /dev/null",
      "cat <<< a <<< b",
      "x=1<<< *",
    ]),
  },
  {
    name: "unbalanced and cut-off input still gives what could be read, a missing name as an empty one",
    run: ({ parser }) => read(parser, [
      "echo \"unterminated",
      "echo 'unterminated",
      "echo $(unterminated",
      "echo `unterminated",
      "echo ${unterminated",
      "echo )",
      "(",
      ")",
      "{",
      "}",
      ";",
      "&&",
      "| grep",
      "ls |",
      "ls &&",
      "echo \\",
      "echo <(",
      "if true; then",
      "for",
      "case x in",
      "|a \" ",
      "{\"\" if ] $\" ",
      "f() !",
    ]),
  },
  {
    name: "other alphabets, control characters and half a character pass through as they are",
    run: ({ parser }) => read(parser, [
      "echo héllo wörld 日本語 🙂 > /dev/null",
      "🙂 --flag",
      "echo a\u0000b",
      "echo \ud83d",
      "echo\u00a0hi",
      "echo hi\u2028ls",
      "ls\fpwd",
      "Get-ChildItem | Where-Object { $_.Length -gt 1 } > out.txt",
    ]),
  },
  {
    name: "a long line, many statements and deep nesting are read whole",
    run: ({ parser }) => {
      const analyze = reader(parser);
      const long = analyze(`echo ${Array.from({ length: 2_000 }, (_, at) => `arg${at}`).join(" ")}`);
      const many = analyze("ls > /dev/null;".repeat(500));
      const deep = analyze(`${"echo $(".repeat(60)}date${")".repeat(60)}`);
      const longest = long.structured.executableCommands[0];
      return {
        long: { names: long.legacy.simpleCommands, args: longest.args.length, lastArg: longest.args.at(-1), fullTextLength: longest.fullText.length },
        many: { names: many.legacy.simpleCommands.length, redirects: many.structured.redirects.length, allRedirectsAreDevNull: many.structured.allRedirectsAreDevNull, hasOutputRedirect: many.legacy.hasOutputRedirect },
        deep: { names: deep.legacy.simpleCommands.length, commands: deep.structured.executableCommands.length, innermost: deep.structured.executableCommands.at(-1), hasCommandSubstitution: deep.structured.hasCommandSubstitution },
      };
    },
  },
  {
    name: "a command that is not text is handed to the parser as it is: anything but a function is refused there",
    run: ({ parser }) => {
      const analyze = reader(parser);
      return {
        refused: [undefined, null, 42, true, {}, ["ls"], new String("ls"), Buffer.from("ls")].map((given) => thrownBy(() => analyze(given))),
        nothingGiven: thrownBy(() => analyze()),
        aFunctionGivingText: analyze((index) => "echo hi > out".slice(index)),
        moreThanOneArgument: analyze("ls", "pwd", 3),
      };
    },
  },
  {
    name: "every reading is a new answer: changing one changes neither the next nor the one before",
    run: ({ parser }) => {
      /** Everything in an answer that can be changed, changed. */
      const spoil = (answer) => {
        answer.legacy.simpleCommands.push("changed");
        for (const found of answer.structured.executableCommands) found.args.push({ type: "word", value: "changed" });
        for (const found of answer.structured.redirects) found.destinationFds.push(9);
        answer.structured.executableCommands.push({ name: "changed", args: [], fullText: "changed" });
        answer.structured.redirects.length = 0;
      };
      return ["echo hi > out", "echo hi &> out", "echo hi &>> out 2>&1", "cat < in", "cat <<EOF\nhi\nEOF", "{ cat; } <<EOF\nhi\nEOF", "cat <<< hi", "exec 3>&-", "ls -la"].map((line) => {
        const analyze = reader(parser);
        const first = analyze(line);
        const second = analyze(line);
        spoil(first);
        const third = analyze(line);
        return {
          line,
          sameObjects: [first === second, first.legacy === second.legacy, first.structured === second.structured, first.legacy.simpleCommands === second.legacy.simpleCommands, first.structured.executableCommands === second.structured.executableCommands, first.structured.redirects === second.structured.redirects],
          madeBeforeTheChange: second,
          madeAfterTheChange: third,
          keys: [Object.keys(third), Object.keys(third.legacy), Object.keys(third.structured), third.structured.redirects.map((found) => Object.keys(found)), third.structured.executableCommands.map((found) => [Object.keys(found), found.args.map((arg) => Object.keys(arg))])],
        };
      });
    },
  },
  {
    name: "the code an error carries when a build left the parser's natives out",
    run: ({ parser }) => parser.TREE_SITTER_STUBBED_ERROR_CODE,
  },
  {
    name: "one parser is made on the first reading, given the language once, and asked for each command with the command alone",
    run: async ({ parser }, tools) => {
      const { again, seen, language } = await onStandIn(parser, tools);
      const before = { made: seen.made.length, languages: seen.languages.length, parsed: seen.parsed.length };
      const answers = [again.analyzeShellCommand("one"), again.analyzeShellCommand("two", "ignored"), again.analyzeShellCommand("")];
      return {
        before,
        made: seen.made,
        languages: seen.languages.map((given) => given.map((value) => (value === language ? "the language package's export" : value))),
        parsed: seen.parsed,
        answers,
      };
    },
  },
  {
    name: "a parser that says its natives were left out is told once on the console, and every reading then says parsing failed",
    run: async ({ parser }, tools) => {
      const left = { kind: "error", message: "natives left out of this build", fields: { code: STUBBED } };
      const cases = {
        "making the parser throws an error with the code": { onNew: left },
        "giving it the language throws an error with the code": { onLanguage: left },
        "what is thrown is a plain object with the code": { onNew: { kind: "object", fields: { code: STUBBED } } },
        "what is thrown inherits the code": { onNew: { kind: "inherited", fields: { code: STUBBED } } },
      };
      const out = {};
      for (const [about, settings] of Object.entries(cases)) {
        const { again, seen } = await onStandIn(parser, tools, { parser: settings });
        const first = warningsDuring(() => again.analyzeShellCommand("ls > out"));
        const second = warningsDuring(() => again.analyzeShellCommand("echo $(date)"));
        const [one, two] = [first.result, second.result];
        const sameObjects = [one === two, one.legacy === two.legacy, one.structured === two.structured, one.legacy.simpleCommands === two.legacy.simpleCommands, one.structured.executableCommands === two.structured.executableCommands, one.structured.redirects === two.structured.redirects];
        // The first answer changed after the second was made, and before a third is.
        one.legacy.simpleCommands.push("changed");
        one.structured.executableCommands.push({ name: "changed", args: [], fullText: "changed" });
        one.structured.redirects.push({ operator: ">", destinationFds: [1], targetNodeType: "word" });
        const third = warningsDuring(() => again.analyzeShellCommand("ls"));
        out[about] = { first, second, third, keys: [Object.keys(two), Object.keys(two.legacy), Object.keys(two.structured)], sameObjects, made: seen.made.length, languages: seen.languages.length, parsed: seen.parsed.length };
      }
      return out;
    },
  },
  {
    name: "any other failure to make the parser is thrown as it is, each time, with nothing said and nothing kept",
    run: async ({ parser }, tools) => {
      const cases = {
        "an error with no code": { onNew: { kind: "error", message: "the binding would not load", fields: {} } },
        "an error with another code": { onNew: { kind: "error", message: "the binding would not load", fields: { code: "ERR_DLOPEN_FAILED" } } },
        "an error whose code is the right one in small letters": { onNew: { kind: "error", message: "close but not it", fields: { code: STUBBED.toLowerCase() } } },
        "a plain object with no code": { onNew: { kind: "object", fields: { reason: "no code here" } } },
        "a text": { onNew: { kind: "value", value: STUBBED } },
        "nothing at all": { onNew: { kind: "null" } },
        "a failure when the language is given": { onLanguage: { kind: "error", message: "wrong language version", fields: { code: "ERR_LANGUAGE" } } },
      };
      const out = {};
      for (const [about, settings] of Object.entries(cases)) {
        const { again, seen } = await onStandIn(parser, tools, { parser: settings });
        const tries = warningsDuring(() => [thrownBy(() => again.analyzeShellCommand("ls")), thrownBy(() => again.analyzeShellCommand("ls"))]);
        out[about] = { thrown: tries.result, said: tries.said, made: seen.made.length, languages: seen.languages.length, parsed: seen.parsed.length };
      }
      return out;
    },
  },
  {
    name: "a command with no name marks the reading as failed, and the commands around it are still listed",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      return readTrees(again, [
        { about: "a command holding only an argument, then a whole one", tree: program(node("command", "orphan", [named("argument", word("orphan"))]), command("ls", "-la")) },
        { about: "a command with nothing in it", tree: program(node("command")) },
        { about: "a whole command, then one whose name sits in no field", tree: program(command("pwd"), node("command", "ls", [node("command_name", "ls", [word("ls")])])) },
        { about: "a command with a name and no argument field: other children are not arguments", tree: program(node("command", "env A=1 x", [node("variable_assignment", "A=1"), node("command_name", "env", [], "name"), word("x")])) },
        { about: "a name that is not a command_name is still the name", tree: program(node("command", "odd", [named("name", word("odd")), named("argument", node("string", "\"a b\"")), named("argument", sign("$"))])) },
      ]);
    },
  },
  {
    name: "a command name outside a command, and an older grammar's simple_command, are added to the names only",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const name = (text) => node("command_name", text);
      const simple = (text, ...children) => node("simple_command", text, children);
      return readTrees(again, [
        { about: "a stray name is added once however often it comes", tree: program(name("pwd"), name("pwd"), name("ls")) },
        { about: "a stray name already given by a command is not added, a command after a stray name is", tree: program(command("ls"), name("ls"), name("pwd"), command("pwd")) },
        { about: "a simple_command gives its command_name, once", tree: program(simple("git status", name("git"), word("status")), simple("git log", name("git"), word("log"))) },
        { about: "a simple_command whose first named child is something else gives its whole text, each time", tree: program(simple("A=1 git status", node("variable_assignment", "A=1"), name("git")), simple("A=1 git status", node("variable_assignment", "A=1"), name("git"))) },
        { about: "a simple_command with no named child gives its whole text", tree: program(simple("!!", sign("!"), sign("!")), simple("")) },
        { about: "signs before the command_name are passed over", tree: program(simple("! make", sign("!"), name("make"))) },
        { about: "a simple_command inside a command, and a command inside a simple_command", tree: program(node("command", "outer", [named("name", name("outer")), simple("inner x", name("inner"))]), simple("wrap", name("wrap"), command("held", "arg"))) },
      ]);
    },
  },
  {
    name: "a redirection is read once, where it is first met, even in a tree that lists it twice",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const twice = { again: true };
      const toFile = redirect("> out", sign(">"), word("out"));
      const toNowhere = redirect("> /dev/null", sign(">"), word("/dev/null"));
      const statement = (...children) => node("redirected_statement", "", children);
      return readTrees(again, [
        { about: "a file redirection listed twice under its statement", tree: program(statement(command("cat"), toFile, twice)) },
        { about: "a here-document listed twice", tree: program(statement(command("cat"), node("heredoc_redirect", "<<EOF\nhi\nEOF"), twice)) },
        { about: "a here-string listed twice, between two others", tree: program(statement(command("cat"), toNowhere, node("herestring_redirect", "<<< hi"), twice, toFile)) },
        { about: "two redirections that only look the same are two", tree: program(statement(command("cat"), toFile, toFile)) },
        { about: "a command listed twice is counted twice", tree: program(command("ls", "-la"), twice) },
        { about: "a statement listed twice: its commands twice, its redirection once", tree: program(statement(command("cat"), toNowhere), twice) },
        { about: "a top that is a redirection and lists another twice", tree: redirect("> /dev/null", sign(">"), word("/dev/null"), redirect("2>&1", descriptor("2"), sign(">&"), node("number", "1")), twice) },
      ]);
    },
  },
  {
    name: "a parser that hands out a new object for a node each time it is asked makes every redirection be read a second time, on its own",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const statement = (...children) => node("redirected_statement", "", children);
      const toNowhere = redirect("> /dev/null", sign(">"), word("/dev/null"));
      const errorToOutput = redirect("2>&1", descriptor("2"), sign(">&"), node("number", "1"));
      const threeFromNowhere = redirect("3< /dev/null", descriptor("3"), sign("<"), word("/dev/null"));
      const inputFromThree = redirect("<&3", sign("<&"), node("number", "3"));
      const hereString = node("herestring_redirect", "<<< hi", [sign("<<<"), word("hi")]);
      const cases = [
        { about: "no redirection: nothing differs", tree: program(command("ls", "-la"), node("pipeline", "", [command("a"), command("b")])) },
        { about: "two redirections of a statement, safe together and safe apart", tree: program(statement(command("echo", "hi"), toNowhere, errorToOutput)) },
        { about: "two redirections safe only together: read apart, the second is not", tree: program(statement(command("cat"), threeFromNowhere, inputFromThree)) },
        { about: "a here-string inside its command", tree: program(node("command", "cat <<< hi", [node("command_name", "cat", [word("cat")], "name"), hereString])) },
        { about: "a here-document holding a file redirection", tree: program(statement(command("cat"), node("heredoc_redirect", "<<EOF > out\nhi\nEOF", [redirect("> out", sign(">"), word("out"))]))) },
        { about: "a statement inside a group that is itself redirected", tree: program(statement(node("compound_statement", "", [statement(command("a"), redirect("> x", sign(">"), word("x")))]), redirect("> y", sign(">"), word("y")))) },
        { about: "a redirection listed twice is then read four times", tree: program(statement(command("cat"), toNowhere, { again: true })) },
        { about: "a top that is a redirection is read once: nothing asks for it again", tree: toNowhere },
      ];
      return cases.map(({ about, tree }) => {
        const asWritten = again.analyzeShellCommand(JSON.stringify(tree)).structured;
        const forgetful = again.analyzeShellCommand(JSON.stringify({ ...tree, forgetful: true }));
        return { about, redirectsWhenEachNodeKeepsItsObject: asWritten.redirects.length, allRedirectsAreDevNullThen: asWritten.allRedirectsAreDevNull, ...forgetful };
      });
    },
  },
  {
    name: "kinds of redirection only other grammars have are counted, never safe, and their text is searched for signs",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const under = (...children) => program(node("redirected_statement", "", [named("body", command("cat")), ...children]));
      return readTrees(again, [
        { about: "heredoc", tree: under(node("heredoc", "<<EOF\nhi\nEOF")) },
        { about: "here_string", tree: under(node("here_string", "<<< hi")) },
        { about: "redirect", tree: under(node("redirect", "> /dev/null")) },
        { about: "redirection", tree: under(node("redirection", "2>&1")) },
        { about: "herestring_redirect with no sign in its text is input all the same", tree: under(node("herestring_redirect", "hello")) },
        { about: "heredoc_redirect with no sign in its text is input all the same", tree: under(node("heredoc_redirect", "hello")) },
        { about: "a kind that is not a redirection is not counted, whatever its text", tree: under(node("file_redirection", "> out"), node("word", "< in")) },
        { about: "one safe and one of these: not all safe", tree: under(redirect("> /dev/null", sign(">"), word("/dev/null")), node("redirect", "")) },
      ]);
    },
  },
  {
    name: "which texts count as an input redirection and which as an output one",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const texts = [
        "", "abc", "<", "<<", "<<<", "<<<<", "3<", "33<<", " <", "\t<", "\n<", "\u00a0<", "a<", "a <b", "a3<b", "a 3<b", "-<", "3 <", "<3", "x<<y", "x <<y", "<&3", "<>",
        ">", ">>", ">>>", "2>", "2>>", "22>>", " >", "\t>", "\n>", "\u00a0>", "a>", "a >b", "a2>b", "a 2>b", "->", "2 >", ">2", ">|", ">&", ">&-", "2>&1", "a2>&1", "a 2>&1", "12>&34",
        "&>", "&>>", " &>", "x&>", "x &>", "1&>", "&&>", "& >", "|>", "<>x", "< >", "> <", "a<b >c", "a <b>c", "a\r>b", "a\u2028<b", "=>", "<=", "1<2>3", "1 <2 >3",
      ];
      return texts.map((text) => {
        const { legacy } = again.analyzeShellCommand(JSON.stringify(program(node("redirect", text))));
        return { text, input: legacy.hasInputRedirect, output: legacy.hasOutputRedirect };
      });
    },
  },
  {
    name: "a tree whose top is itself a redirection is read too, from the standard descriptors",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      return readTrees(again, [
        { about: "a file redirection to /dev/null", tree: redirect("> /dev/null", sign(">"), word("/dev/null")) },
        { about: "a copy of standard output", tree: redirect("2>&1", descriptor("2"), sign(">&"), node("number", "1")) },
        { about: "a here-document: it follows no command", tree: node("heredoc_redirect", "<<EOF\nhi\nEOF") },
        { about: "a here-string", tree: node("herestring_redirect", "<<< hi") },
        { about: "a kind from another grammar holding a file redirection: both are counted, the inner one first", tree: node("redirection", "> out", [redirect("> out", sign(">"), word("out"))]) },
        { about: "a file redirection holding another: the inner one is counted first", tree: redirect("> /dev/null", sign(">"), word("/dev/null"), redirect("2>&1", descriptor("2"), sign(">&"), node("number", "1"))) },
      ]);
    },
  },
  {
    name: "every operator of a file redirection, with and without a descriptor, and signs that are not operators",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const signs = ["<", ">", ">>", ">|", "<>", "<&", ">&", "&>", "&>>", ">&-", "<&-", "<<", "<<<", "|", "&", ">>>", "1>"];
      const one = (...children) => {
        const { redirects, hasRedirects, allRedirectsAreDevNull } = again.analyzeShellCommand(JSON.stringify(program(redirect("", ...children)))).structured;
        return { redirects, hasRedirects, allRedirectsAreDevNull };
      };
      return signs.map((operator) => ({
        operator,
        toDevNull: one(sign(operator), word("/dev/null")),
        toAFile: one(sign(operator), word("out")),
        fromDescriptor1: one(sign(operator), node("number", "1")),
        withDescriptor5: one(descriptor("5"), sign(operator), word("/dev/null")),
      }));
    },
  },
  {
    name: "a redirection's target is the first thing after the operator that is no comment, whatever it is",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const to = (...after) => program(redirect("> x", sign(">"), ...after));
      const comment = node("comment", "# c");
      return readTrees(again, [
        { about: "nothing after the operator", tree: to() },
        { about: "only comments after the operator", tree: to(comment, comment) },
        { about: "comments, then the target", tree: to(comment, comment, word("/dev/null"), word("ignored")) },
        { about: "a sign as the target", tree: to(sign(">>"), word("/dev/null")) },
        { about: "two operators: the first is the operator, the second the target", tree: program(redirect(">> > x", sign(">>"), sign(">"), word("x"))) },
        { about: "what sits before the operator is not the target", tree: program(redirect("x > y", word("/dev/null"), sign(">"), word("y"))) },
        { about: "a copy with nothing after the operator", tree: program(redirect(">&", sign(">&"))) },
        { about: "an input copy with only a comment after the operator", tree: program(redirect("<&", sign("<&"), comment)) },
        { about: "no operator at all", tree: program(redirect("out", word("out"))) },
        { about: "no children at all", tree: program(redirect("> out")) },
      ]);
    },
  },
  {
    name: "a target's plain text by its kind: words, numbers, both kinds of quotes, and everything else has none",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const to = (target) => program(redirect("> x", sign(">"), target));
      const content = (text) => node("string_content", text);
      const quote = sign("\"");
      return readTrees(again, [
        { about: "a word", tree: to(word("out")) },
        { about: "an empty word", tree: to(word("")) },
        { about: "a word with a named child has no plain text", tree: to(node("word", "out", [node("expansion", "")])) },
        { about: "a word with only signs as children keeps its text", tree: to(node("word", "out", [sign("$")])) },
        { about: "/dev/null as a word with a named child is safe and has no plain text", tree: to(node("word", "/dev/null", [node("expansion", "")])) },
        { about: "a number", tree: to(node("number", "7")) },
        { about: "a number holding an expansion keeps its text", tree: to(node("number", "10#${x}", [node("expansion", "${x}")])) },
        { about: "single quotes around nothing", tree: to(node("raw_string", "''")) },
        { about: "single quotes around text", tree: to(node("raw_string", "'a b'")) },
        { about: "a single-quoted target of one character has no plain text", tree: to(node("raw_string", "'")) },
        { about: "a single-quoted target of no character has no plain text", tree: to(node("raw_string", "")) },
        { about: "a single-quoted target loses its first and last character whatever they are", tree: to(node("raw_string", "abc")) },
        { about: "/dev/null in single quotes", tree: to(node("raw_string", "'/dev/null'")) },
        { about: "/dev/null in double quotes held as a single-quoted target is not /dev/null", tree: to(node("raw_string", "\"/dev/null\"")) },
        { about: "double quotes around nothing have no plain text", tree: to(node("string", "\"\"", [quote, quote])) },
        { about: "double quotes around one piece", tree: to(node("string", "\"a b\"", [quote, content("a b"), quote])) },
        { about: "double quotes around several pieces are joined with nothing between", tree: to(node("string", "\"a\nb\"", [quote, content("a"), content("b"), quote])) },
        { about: "double quotes holding anything but text have no plain text", tree: to(node("string", "\"a$x\"", [quote, content("a"), node("simple_expansion", "$x"), quote])) },
        { about: "/dev/null in double quotes", tree: to(node("string", "\"/dev/null\"", [quote, content("/dev/null"), quote])) },
        { about: "/dev/null in two pieces reads /dev/null and is not safe", tree: to(node("string", "\"/dev/null\"", [quote, content("/dev/"), content("null"), quote])) },
        { about: "one piece that is not text, though it reads /dev/null, is not safe", tree: to(node("string", "\"/dev/null\"", [quote, node("simple_expansion", "/dev/null"), quote])) },
        { about: "a double-quoted target whose own text is /dev/null, with no pieces, is not safe", tree: to(node("string", "/dev/null")) },
        { about: "a joined target", tree: to(node("concatenation", "/dev/null", [word("/dev/"), word("null")])) },
        { about: "a variable", tree: to(node("simple_expansion", "$out")) },
        { about: "an ansi-c string", tree: to(node("ansi_c_string", "$'/dev/null'")) },
        { about: "a kind nobody knows", tree: to(node("mystery", "/dev/null")) },
      ]);
    },
  },
  {
    name: "a descriptor is read from the first file_descriptor that is all digits; anything else falls back to the operator's own",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const out = (...before) => program(redirect("", ...before, sign(">"), word("out")));
      const into = (...before) => program(redirect("", ...before, sign("<"), word("in")));
      return readTrees(again, [
        { about: "3", tree: out(descriptor("3")) },
        { about: "0", tree: out(descriptor("0")) },
        { about: "007", tree: out(descriptor("007")) },
        { about: "twenty digits", tree: out(descriptor("12345678901234567890")) },
        { about: "no text", tree: out(descriptor("")) },
        { about: "a letter", tree: out(descriptor("x")) },
        { about: "a minus sign", tree: out(descriptor("-1")) },
        { about: "digits and a space", tree: out(descriptor("3 ")) },
        { about: "digits from another alphabet", tree: out(descriptor("\uff13")) },
        { about: "two descriptors: the first counts", tree: out(descriptor("4"), descriptor("5")) },
        { about: "two descriptors, the first not digits: the second is not looked at", tree: out(descriptor("x"), descriptor("5")) },
        { about: "a descriptor after the operator still counts", tree: program(redirect("", sign(">"), word("out"), descriptor("6"))) },
        { about: "input with no descriptor", tree: into() },
        { about: "input with a descriptor", tree: into(descriptor("3")) },
        { about: "input with a descriptor that is not digits", tree: into(descriptor("x")) },
        { about: "both outputs at once ignore a descriptor", tree: program(redirect("", descriptor("5"), sign("&>"), word("out")), redirect("", descriptor("5"), sign("&>>"), word("out"))) },
      ]);
    },
  },
  {
    name: "copies between descriptors follow what each one points at, one redirection after the other",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const copy = (from, to, operator = ">&", kind = "number") => redirect("", ...(from === undefined ? [] : [descriptor(from)]), sign(operator), node(kind, to));
      const file = (from, target, operator = ">") => redirect("", ...(from === undefined ? [] : [descriptor(from)]), sign(operator), word(target));
      const under = (...redirects) => program(node("redirected_statement", "", [named("body", command("cmd")), ...redirects]));
      const verdicts = (tree) => {
        const { redirects, allRedirectsAreDevNull } = again.analyzeShellCommand(JSON.stringify(tree)).structured;
        return { allRedirectsAreDevNull, redirects: redirects.map((found) => `${found.destinationFds.join(",")}${found.operator}${found.targetText ?? `(${found.targetNodeType})`}`) };
      };
      return [
        { about: "from standard output", tree: under(copy("2", "1")) },
        { about: "from standard error", tree: under(copy(undefined, "2")) },
        { about: "from standard input", tree: under(copy("1", "0")) },
        { about: "from a descriptor nothing set", tree: under(copy(undefined, "3")) },
        { about: "the source written with zeros in front", tree: under(copy("2", "01")) },
        { about: "the source as a word of digits", tree: under(copy("2", "1", ">&", "word")) },
        { about: "the source not digits", tree: under(copy("2", "1-")) },
        { about: "the source empty", tree: under(copy("2", "")) },
        { about: "from a descriptor pointed at /dev/null", tree: under(file("3", "/dev/null"), copy(undefined, "3")) },
        { about: "from a descriptor pointed at a file", tree: under(file("3", "out"), copy(undefined, "3")) },
        { about: "from a descriptor pointed at a file, then pointed at /dev/null", tree: under(file("3", "out"), file("3", "/dev/null"), copy(undefined, "3")) },
        { about: "from a copy of a copy of standard error", tree: under(copy("3", "2"), copy("4", "3"), copy("1", "4")) },
        { about: "from a descriptor that copied something unsafe", tree: under(copy("3", "0"), copy("1", "3")) },
        { about: "an unsafe copy makes its descriptor unsafe for a later copy", tree: under(copy("1", "9"), copy("2", "1")) },
        { about: "both outputs to /dev/null, then copies of each", tree: under(file(undefined, "/dev/null", "&>"), copy("3", "1"), copy("4", "2")) },
        { about: "both outputs to a file, then a copy of standard error", tree: under(file(undefined, "out", "&>>"), copy("3", "2")) },
        { about: "input copied from standard input", tree: under(copy(undefined, "0", "<&")) },
        { about: "input copied from standard output", tree: under(copy(undefined, "1", "<&")) },
        { about: "input copied from a descriptor nothing set", tree: under(copy(undefined, "7", "<&")) },
        { about: "input copied from a descriptor read from /dev/null", tree: under(file("3", "/dev/null", "<"), copy(undefined, "3", "<&")) },
        { about: "input copied from a descriptor written to /dev/null", tree: under(file("3", "/dev/null"), copy("0", "3", "<&")) },
        { about: "input copied from an input copy of /dev/null", tree: under(file("3", "/dev/null", "<"), copy("4", "3", "<&"), copy(undefined, "4", "<&")) },
        { about: "an input copy that is not safe makes its descriptor unsafe", tree: under(file(undefined, "/dev/null", "<"), copy("0", "5", "<&"), copy("3", "0", "<&")) },
        { about: "input copied from a source that is not digits", tree: under(copy(undefined, "x", "<&")) },
        { about: "standard input read from /dev/null, then standard output copied from it", tree: under(file(undefined, "/dev/null", "<"), copy("1", "0")) },
        { about: "the redirections of another statement start again", tree: program(node("redirected_statement", "", [file("3", "/dev/null")]), node("redirected_statement", "", [copy(undefined, "3")])) },
      ].map(({ about, tree }) => ({ about, ...verdicts(tree) }));
    },
  },
  {
    name: "a here-document is safe only under a redirected statement whose first command has a name, and outside any bare substitution",
    run: async ({ parser }, tools) => {
      const { again } = await onStandIn(parser, tools);
      const doc = node("heredoc_redirect", "<<EOF\nhi\nEOF");
      const statement = (...children) => node("redirected_statement", "", children);
      const substitution = (...children) => node("command_substitution", "$(...)", children);
      return readTrees(again, [
        { about: "under a redirected statement with a command", tree: program(statement(command("cat"), doc)) },
        { about: "the command after the here-document is still found", tree: program(statement(doc, command("cat"))) },
        { about: "two commands: the first names it", tree: program(statement(command("first"), command("second"), doc)) },
        { about: "a command with no name does not name it", tree: program(statement(node("command", "x", [named("argument", word("x"))]), command("second"), doc)) },
        { about: "a command with an empty name names it with nothing", tree: program(statement(node("command", "", [node("command_name", "", [], "name")]), doc)) },
        { about: "no command, only a group", tree: program(statement(node("compound_statement", "{ cat; }", [command("cat")]), doc)) },
        { about: "straight under a command", tree: program(node("command", "cat", [node("command_name", "cat", [], "name"), doc])) },
        { about: "straight under the program", tree: program(doc) },
        { about: "inside a substitution in double quotes", tree: program(node("string", "", [substitution(statement(command("cat"), doc))])) },
        { about: "inside a substitution that is not in double quotes", tree: program(node("word", "", [substitution(statement(command("cat"), doc))])) },
        { about: "inside a quoted substitution that sits in a bare one", tree: program(substitution(node("string", "", [substitution(statement(command("cat"), doc))]))) },
        { about: "inside a bare substitution that sits in a quoted one", tree: program(node("string", "", [substitution(substitution(statement(command("cat"), doc)))])) },
        { about: "inside a substitution that is the top of the tree", tree: substitution(statement(command("cat"), doc)) },
        { about: "inside a process substitution", tree: program(node("process_substitution", "<(...)", [statement(command("cat"), doc)])) },
      ]);
    },
  },
  {
    name: "in a developer run the parser's packages are looked for the way Node looks from the part's own file",
    run: async ({ parser }, tools) => {
      const built = builtFile(parser);
      const beside = path.join(path.dirname(built), "node_modules");
      const names = { [built]: "<the built part>" };
      // Beside the built part is the first place Node looks from it. The same two stand-ins are put there each time:
      // Node remembers what it found at a path, so anything else would answer differently the second time it is asked.
      await stage(beside, { parser: { label: "parser-beside-the-built-part" }, language: { label: "language-beside-the-built-part" } });
      try {
        return {
          "nothing set": await loading(parser, tools, {}, names),
          "the packages' folder set to blanks": await loading(parser, tools, { deps: "   " }, names),
          "packaged set to something other than 1": await loading(parser, tools, { packaged: "true" }, names),
          "packaged set to 0, on Electron": await loading(parser, tools, { packaged: "0", electron: "42.1.0", resources: path.join(await tools.tmp(), "resources") }, names),
        };
      } finally {
        await rm(beside, { recursive: true, force: true });
      }
    },
  },
  {
    name: "a packages' folder that is set is the only place looked in, in a developer run and in a packaged Node one",
    run: async ({ parser }, tools) => {
      const tmp = await tools.tmp();
      const names = { [tmp]: "<tmp>", [path.resolve("no-such-folder/deps")]: "<the working folder>/no-such-folder/deps" };
      const whole = await stage(path.join(tmp, "whole"), { parser: { label: "parser-in-whole" }, language: { label: "language-in-whole" } });
      const empty = path.join(tmp, "empty");
      await mkdir(empty);
      const noLanguage = await stage(path.join(tmp, "no-language"), { language: false });
      const noParser = await stage(path.join(tmp, "no-parser"), { parser: false });
      const noDescription = await stage(path.join(tmp, "no-description"));
      await rm(path.join(noDescription, "tree-sitter", "package.json"));
      const out = {};
      for (const [place, packaged] of [["developer", undefined], ["packaged Node", "1"]]) {
        out[place] = {
          "both packages there": await loading(parser, tools, { packaged, deps: whole }, names),
          "blanks around the folder's name": await loading(parser, tools, { packaged, deps: `  ${whole}\t` }, names),
          "a folder that is not there": await loading(parser, tools, { packaged, deps: path.join(tmp, "absent") }, names),
          "an empty folder": await loading(parser, tools, { packaged, deps: empty }, names),
          "the language package missing": await loading(parser, tools, { packaged, deps: noLanguage }, names),
          "the parser package missing": await loading(parser, tools, { packaged, deps: noParser }, names),
          "the parser package's folder there without its package.json": await loading(parser, tools, { packaged, deps: noDescription }, names),
          "a name that is not a whole path is read from the working folder": await loading(parser, tools, { packaged, deps: "no-such-folder/deps" }, names),
        };
      }
      out["developer, on Electron"] = await loading(parser, tools, { electron: "42.1.0", resources: path.join(tmp, "resources"), deps: whole }, names);
      return out;
    },
  },
  {
    name: "a package that is there and fails to load ends the search, with what it threw kept as the cause",
    run: async ({ parser }, tools) => {
      const tmp = await tools.tmp();
      const names = { [tmp]: "<tmp>" };
      const broken = { message: "compiled against a different Node.js version", fields: { code: "ERR_DLOPEN_FAILED", marker: "thrown by the stand-in" } };
      const cases = {
        "the parser package throws an error": { parser: { onLoad: { kind: "error", ...broken } } },
        "the parser package throws a text": { parser: { onLoad: { kind: "value", value: "not an error" } } },
        "the parser package throws nothing at all": { parser: { onLoad: { kind: "null" } } },
        "the parser package throws a plain object": { parser: { onLoad: { kind: "object", fields: { message: "looks like an error" } } } },
        "the language package throws an error": { language: { onLoad: broken } },
      };
      const out = {};
      for (const [about, settings] of Object.entries(cases)) {
        const root = await stage(path.join(tmp, `case-${Object.keys(out).length + 1}`), settings);
        out[about] = {
          developer: await loading(parser, tools, { deps: root }, names),
          "packaged Node": await loading(parser, tools, { packaged: "1", deps: root }, names),
        };
      }
      return out;
    },
  },
  {
    name: "a packaged Node run with no folder set looks in node-deps beside the folder its code is in",
    run: async ({ parser }, tools) => {
      const tmp = await tools.tmp();
      const built = builtFile(parser);
      const names = { [tmp]: "<tmp>", [path.dirname(path.dirname(built))]: "<above the built part's folder>" };
      await stage(path.join(tmp, "node-deps"), { parser: { label: "parser-in-node-deps" }, language: { label: "language-in-node-deps" } });
      return {
        "the code's folder is known to it (as in the built engine)": await loading(parser, tools, { packaged: "1", dirname: path.join(tmp, "dist") }, names),
        "the code's folder is deeper": await loading(parser, tools, { packaged: "1", dirname: path.join(tmp, "dist", "inner") }, names),
        "blanks for the folder count as not set": await loading(parser, tools, { packaged: "1", deps: " ", dirname: path.join(tmp, "dist") }, names),
        "the code's folder is read from the file's own address": await loading(parser, tools, { packaged: "1" }, names),
      };
    },
  },
  {
    name: "a packaged Electron run looks in the app's two staged folders, in order, and nowhere else",
    run: async ({ parser }, tools) => {
      const tmp = await tools.tmp();
      const names = { [tmp]: "<tmp>" };
      const electron = "42.1.0";
      const elsewhere = await stage(path.join(tmp, "elsewhere"), { parser: { label: "parser-elsewhere" }, language: { label: "language-elsewhere" } });
      const resources = async (name, { unpacked, plain }) => {
        const root = path.join(tmp, name);
        await mkdir(root, { recursive: true });
        if (unpacked !== undefined) await stage(path.join(root, "app.asar.unpacked", "dist", "deps"), unpacked);
        if (plain !== undefined) await stage(path.join(root, "dist", "deps"), plain);
        return root;
      };
      const labelled = (where) => ({ parser: { label: `parser-${where}` }, language: { label: `language-${where}` } });
      const failing = { parser: { onLoad: { kind: "error", message: "wrong ABI", fields: { code: "ERR_DLOPEN_FAILED" } } } };
      return {
        "both folders hold both packages: the unpacked one is read": await loading(parser, tools, { packaged: "1", electron, resources: await resources("both", { unpacked: labelled("unpacked"), plain: labelled("plain") }) }, names),
        "only the second folder holds them": await loading(parser, tools, { packaged: "1", electron, resources: await resources("second", { plain: labelled("plain") }) }, names),
        "the parser in the first, the language in the second": await loading(parser, tools, { packaged: "1", electron, resources: await resources("split", { unpacked: { ...labelled("unpacked"), language: false }, plain: { ...labelled("plain"), parser: false } }) }, names),
        "neither folder is there": await loading(parser, tools, { packaged: "1", electron, resources: await resources("neither", {}) }, names),
        "the first folder's parser fails to load: the second is not tried": await loading(parser, tools, { packaged: "1", electron, resources: await resources("failing", { unpacked: failing, plain: labelled("plain") }) }, names),
        "a packages' folder that is set is not looked in": await loading(parser, tools, { packaged: "1", electron, resources: await resources("set", {}), deps: elsewhere }, names),
        "the app does not say where its resources are": await loading(parser, tools, { packaged: "1", electron }, names),
        "the app does not say where its resources are, and a folder is set": await loading(parser, tools, { packaged: "1", electron, deps: elsewhere }, names),
        "an Electron version that is an empty text is Electron still": await loading(parser, tools, { packaged: "1", electron: "", deps: elsewhere }, names),
      };
    },
  },
  {
    name: "built as CommonJS, the part finds its packages from its file's own name and folder, and a missing one gives Node's own error",
    run: async (_modules, tools) => {
      const tmp = await tools.tmp();
      const bare = await tools.tmp();
      const names = { [tmp]: "<tmp>", [bare]: "<a folder with no packages>" };
      const labelled = (where) => ({ parser: { label: `parser-${where}` }, language: { label: `language-${where}` } });
      await stage(path.join(tmp, "node_modules"), labelled("above-the-file"));
      await stage(path.join(tmp, "node-deps"), labelled("in-node-deps"));
      await stage(path.join(tmp, "set"), labelled("in-the-set-folder"));
      await mkdir(path.join(tmp, "dist"));
      const copies = { "with no address of its own": await builtAsCommonJs(), "with the address the engine's build gives it": await builtAsCommonJs({ ownAddress: true }) };
      const out = {};
      for (const [about, text] of Object.entries(copies)) {
        const at = Object.keys(out).length;
        const load = async (where, folder = path.join(tmp, "dist")) => {
          const file = path.join(folder, `copy-${at}-${Object.keys(where).join("-") || "plain"}.cjs`);
          await writeFile(file, text);
          return tried(() => dressedAs(where, () => requireHere(file)), tools, names);
        };
        out[about] = {
          "developer run": await load({}),
          // Nothing is staged in or above this folder: the packages must be nowhere Node looks from a temporary folder.
          "developer run with the packages nowhere above the file": await load({}, bare),
          "packaged Node run": await load({ packaged: "1" }),
          "packaged Node run with a folder set": await load({ packaged: "1", deps: path.join(tmp, "set") }),
        };
      }
      return out;
    },
  },
  {
    name: "run with no file of its own, the part looks for its packages from the working folder, and a packaged Node run cannot start",
    run: async (_modules, tools) => {
      const tmp = await tools.tmp();
      const names = { [tmp]: "<tmp>" };
      const work = path.join(tmp, "work");
      await stage(path.join(work, "node_modules"), { parser: { label: "parser-in-working-folder" }, language: { label: "language-in-working-folder" } });
      await stage(path.join(tmp, "set"), { parser: { label: "parser-in-the-set-folder" }, language: { label: "language-in-the-set-folder" } });
      const text = await builtAsCommonJs();
      // The built text run as a function's body: `require` is handed over, and nothing says which file or folder it is in.
      const run = (where) => tried(() => dressedAs(where, () => {
        const here = process.cwd();
        const module = { exports: {} };
        process.chdir(work);
        try {
          new Function("require", "module", "exports", text)(requireHere, module, module.exports);
        } finally {
          process.chdir(here);
        }
        return module.exports;
      }), tools, names);
      const cannotStart = (await run({ packaged: "1" })).refused;
      return {
        "developer run": await run({}),
        "packaged Node run with a folder set": await run({ packaged: "1", deps: path.join(tmp, "set") }),
        "packaged Node run with no folder set": { name: cannotStart?.name, code: cannotStart?.fields.code, message: cannotStart?.message },
      };
    },
  },
];
