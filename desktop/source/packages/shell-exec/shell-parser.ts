/**
 * How a shell command line is read before the Shell tool runs it: the
 * commands in it, its redirections and whether they only throw output away,
 * and whether it holds a command or process substitution. Whoever decides
 * if a command may run without asking reads this, so it leans to "not
 * safe" whenever it is unsure.
 *
 * The reading is done on the syntax tree a bash grammar gives (the
 * `tree-sitter` and `tree-sitter-bash` packages). Both are compiled for one
 * runtime only, so they are looked for where that runtime's own copies are
 * staged, and never anywhere else.
 */
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type ParserType from "tree-sitter";

type ParserConstructor = typeof ParserType;
type SyntaxNode = ParserType.SyntaxNode;

/** One argument of a command: the grammar's name for its kind, and its text as written. */
export interface ShellCommandArgument {
  readonly type: string;
  readonly value: string;
}

/** One command: its name, its arguments, and both joined by single spaces. */
export interface ShellExecutableCommand {
  readonly name: string;
  readonly args: readonly ShellCommandArgument[];
  readonly fullText: string;
}

/**
 * One redirection: its operator, the descriptors it changes, the kind of
 * thing it points at and, when that is written out plainly, its text. One
 * that could not be read has an empty operator and no descriptors.
 */
export interface ShellRedirect {
  readonly operator: string;
  readonly destinationFds: readonly number[];
  readonly targetNodeType: string;
  readonly targetText?: string;
}

export interface ShellCommandParsingResult {
  readonly parsingFailed: boolean;
  readonly executableCommands: readonly ShellExecutableCommand[];
  readonly hasRedirects: boolean;
  readonly hasCommandSubstitution: boolean;
  /** Only there when the command has a redirection: whether every one of them is harmless. */
  readonly allRedirectsAreDevNull?: boolean;
  readonly redirects: readonly ShellRedirect[];
}

/** The earlier, shorter answer, still sent beside the fuller one. */
export interface LegacyShellCommandAnalysis {
  readonly simpleCommands: readonly string[];
  readonly hasInputRedirect: boolean;
  readonly hasOutputRedirect: boolean;
}

export interface ShellCommandAnalysis {
  readonly legacy: LegacyShellCommandAnalysis;
  readonly structured: ShellCommandParsingResult;
}

/** The code on the error a build without the parser's natives throws when a parser is made. */
export const TREE_SITTER_STUBBED_ERROR_CODE = "SIMEON_TREE_SITTER_STUBBED";

// ---------------------------------------------------------------------------
// Finding the two packages
// ---------------------------------------------------------------------------

/** Where the engine is running, as the error for a missing package names it. */
type Runtime = "electron dist/deps" | "node dist/node-deps" | "developer";

function runtime(): Runtime {
  if (process.env.SAND_PACKAGED !== "1") return "developer";
  return process.versions.electron === undefined ? "node dist/node-deps" : "electron dist/deps";
}

/**
 * This file's address, for a `require` of its own: the module's address where
 * the build keeps one, else the built file's name, else a file in the working
 * folder.
 */
function ownAddress(): string {
  if (typeof import.meta.url === "string") return import.meta.url;
  const file = typeof __filename === "string" ? __filename : path.join(process.cwd(), "package.json");
  return pathToFileURL(file).href;
}

const requireFromHere = createRequire(ownAddress());

/** A folder named for the packages by whoever starts the engine or a test; blanks count as none. */
function folderSet(): string | undefined {
  const set = process.env.SAND_TREE_SITTER_NODE_DEPS?.trim();
  return set ? path.resolve(set) : undefined;
}

/**
 * The folders the packages may be staged in, in the order they are tried.
 * None, in a developer run, means the packages installed beside this code.
 */
function stagedFolders(where: Runtime): readonly string[] {
  if (where === "electron dist/deps") {
    // The packaged app looks in its own resources only: a folder set from outside never replaces them.
    const resources = (process as NodeJS.Process & { readonly resourcesPath?: string }).resourcesPath;
    if (resources === undefined) return [];
    return [path.join(resources, "app.asar.unpacked", "dist", "deps"), path.join(resources, "dist", "deps")];
  }
  const set = folderSet();
  if (set !== undefined) return [set];
  if (where === "developer") return [];
  // A packaged Node run keeps them in `node-deps`, beside the folder its code is in.
  const codeFolder = typeof __dirname === "string" ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  return [path.resolve(codeFolder, "..", "node-deps")];
}

/** The error for a package that is not staged, or that is staged and would not load. */
function unavailable(name: string, where: Runtime, folders: readonly string[], cause?: unknown): Error {
  const searched = folders.length === 0 ? "<no staged root>" : folders.join(", ");
  const loaderWords = cause instanceof Error ? ` Loader error: ${cause.message}` : "";
  const error = new Error(
    `shell-parser: cannot load ${name} from the ${where} runtime domain (searched ${searched}). `
      + "The ABI-specific tree-sitter packages are missing or incompatible; rebuild and stage the matching runtime, "
      + "and refusing cross-ABI fallback."
      + loaderWords,
  );
  return Object.assign(error, {
    code: "SAND_TREE_SITTER_RUNTIME_UNAVAILABLE",
    dependency: name,
    domain: where,
    roots: [...folders],
    cause,
  });
}

function loadPackage<T>(name: string): T {
  const where = runtime();
  const folders = stagedFolders(where);
  if (where === "developer" && folders.length === 0) {
    return requireFromHere(requireFromHere.resolve(name)) as T;
  }
  const staged = folders.map((folder) => path.join(folder, name)).find((folder) => existsSync(path.join(folder, "package.json")));
  if (staged === undefined) throw unavailable(name, where, folders);
  try {
    return requireFromHere(staged) as T;
  } catch (cause: unknown) {
    // A copy that is there and will not load ends the search: no other folder is tried, and a
    // developer's own install never stands in for a staged one.
    throw unavailable(name, where, folders, cause);
  }
}

const Parser = loadPackage<ParserConstructor>("tree-sitter");
const bashLanguage = loadPackage<unknown>("tree-sitter-bash");

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/** The one parser, made when first needed. `null`: this build has none, and has said so. */
let bashParser: ParserType | null | undefined;

function saysNativesLeftOut(failure: unknown): boolean {
  if (typeof failure !== "object" || failure === null) return false;
  return "code" in failure && failure.code === TREE_SITTER_STUBBED_ERROR_CODE;
}

/** A parser for bash, or `null` in a build whose natives were left out. Any other failure is the caller's. */
function makeParser(): ParserType | null {
  try {
    const made = new Parser();
    made.setLanguage(bashLanguage);
    return made;
  } catch (failure: unknown) {
    if (saysNativesLeftOut(failure)) return null;
    throw failure;
  }
}

function parserForBash(): ParserType | null {
  if (bashParser !== undefined) return bashParser;
  bashParser = makeParser();
  if (bashParser === null) {
    console.warn("shell-parser: tree-sitter natives are unavailable in this artifact; shell command analysis degrades to parsingFailed");
  }
  return bashParser;
}

// ---------------------------------------------------------------------------
// What the tree's nodes say
// ---------------------------------------------------------------------------

/** The kinds of node that are a redirection, in this grammar and in others'. */
const REDIRECTIONS: ReadonlySet<string> = new Set([
  "file_redirect",
  "heredoc_redirect",
  "herestring_redirect",
  "heredoc",
  "here_string",
  "redirect",
  "redirection",
]);

/** The operators a file redirection is read by. Closing a descriptor (`>&-`, `<&-`) is not among them. */
const FILE_OPERATORS: ReadonlySet<string> = new Set(["<", ">", ">>", ">|", "<>", "<&", ">&", "&>", "&>>"]);

/** A `<` that starts the text or follows a blank, digits before it or not. */
const INPUT_SIGN = /(?:^|\s)\d*</;
/** The same for `>`, which an `&` may come before in place of digits. */
const OUTPUT_SIGN = /(?:^|\s)(?:\d*|&)>/;
const ALL_DIGITS = /^\d+$/;

/** The number a node spells, when it is digits and nothing else. */
function numberWritten(node: SyntaxNode | undefined): number | undefined {
  if (node === undefined || !ALL_DIGITS.test(node.text)) return undefined;
  return Number.parseInt(node.text, 10);
}

/** A file redirection's operator and what it points at: the first thing after the operator that is no comment. */
function operatorAndTarget(redirection: SyntaxNode): { operator: string; target: SyntaxNode | undefined } | undefined {
  let operator: string | undefined;
  for (const piece of redirection.children) {
    if (operator === undefined) {
      if (FILE_OPERATORS.has(piece.type)) operator = piece.type;
    } else if (piece.type !== "comment") {
      return { operator, target: piece };
    }
  }
  return operator === undefined ? undefined : { operator, target: undefined };
}

/** The descriptors a file redirection changes: both outputs, the one written before it, or its operator's own. */
function descriptorsChanged(redirection: SyntaxNode, operator: string): number[] {
  if (operator === "&>" || operator === "&>>") return [1, 2];
  const written = numberWritten(redirection.children.find((piece) => piece.type === "file_descriptor"));
  if (written !== undefined) return [written];
  return [operator.startsWith("<") ? 0 : 1];
}

/** A target's text when it is written out plainly, with nothing in it the shell would work out when it runs. */
function plainText(target: SyntaxNode | undefined): string | undefined {
  if (target === undefined) return undefined;
  switch (target.type) {
    case "word":
      return target.namedChildren.length === 0 ? target.text : undefined;
    case "number":
      return target.text;
    case "raw_string":
      // Without its two quotes.
      return target.text.length < 2 ? undefined : target.text.slice(1, -1);
    case "string": {
      const pieces = target.namedChildren;
      if (pieces.length === 0 || pieces.some((piece) => piece.type !== "string_content")) return undefined;
      return pieces.map((piece) => piece.text).join("");
    }
    default:
      return undefined;
  }
}

/** Whether a target is `/dev/null` and nothing else: bare, in single quotes, or as the one piece of a double-quoted text. */
function isDevNull(target: SyntaxNode | undefined): boolean {
  if (target === undefined) return false;
  switch (target.type) {
    case "word":
      return target.text === "/dev/null";
    case "raw_string":
      return target.text === "'/dev/null'";
    case "string": {
      const pieces = target.namedChildren;
      const only = pieces[0];
      return pieces.length === 1 && only !== undefined && only.type === "string_content" && only.text === "/dev/null";
    }
    default:
      return false;
  }
}

/** The name of the plain command a here-document feeds: the first command of the redirected statement it sits right under. */
function commandFed(hereDocument: SyntaxNode): string | undefined {
  const statement = hereDocument.parent;
  if (statement?.type !== "redirected_statement") return undefined;
  const command = statement.children.find((piece) => piece.type === "command");
  return command?.childForFieldName("name")?.text;
}

/** Whether a node sits, at any depth, in a command substitution that is not straight inside double quotes. */
function inBareSubstitution(node: SyntaxNode): boolean {
  for (let above = node.parent; above; above = above.parent) {
    if (above.type === "command_substitution" && above.parent?.type !== "string") return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Where descriptors point
// ---------------------------------------------------------------------------

/** What a descriptor is connected to, as far as harm goes. */
type Connection = "standard input" | "standard output" | "standard error" | "/dev/null" | "somewhere else";

/** For the two operators that copy a descriptor: the connections a copy may be taken from and stay harmless. */
const HARMLESS_TO_COPY: ReadonlyMap<string, ReadonlySet<Connection>> = new Map([
  [">&", new Set<Connection>(["standard output", "standard error", "/dev/null"])],
  ["<&", new Set<Connection>(["/dev/null"])],
]);

/** The descriptors of one statement while its redirections are read, left to right. */
class Descriptors {
  private readonly connections = new Map<number, Connection>([
    [0, "standard input"],
    [1, "standard output"],
    [2, "standard error"],
  ]);

  connectionOf(descriptor: number | undefined): Connection | undefined {
    return descriptor === undefined ? undefined : this.connections.get(descriptor);
  }

  connect(descriptors: readonly number[], to: Connection): void {
    for (const descriptor of descriptors) this.connections.set(descriptor, to);
  }

  /** What a file redirection connects its descriptors to. Anything but `/dev/null` or a harmless copy is somewhere else. */
  connectionMadeBy(operator: string, target: SyntaxNode | undefined): Connection {
    const harmless = HARMLESS_TO_COPY.get(operator);
    if (harmless === undefined) return isDevNull(target) ? "/dev/null" : "somewhere else";
    const source = this.connectionOf(numberWritten(target));
    return source !== undefined && harmless.has(source) ? source : "somewhere else";
  }
}

// ---------------------------------------------------------------------------
// Reading a command
// ---------------------------------------------------------------------------

interface Findings {
  legacy: { simpleCommands: string[]; hasInputRedirect: boolean; hasOutputRedirect: boolean };
  structured: {
    parsingFailed: boolean;
    executableCommands: ShellExecutableCommand[];
    hasRedirects: boolean;
    hasCommandSubstitution: boolean;
    allRedirectsAreDevNull?: boolean;
    redirects: ShellRedirect[];
  };
}

/** An answer with nothing found in it, new each time: callers may change what they are given. */
function nothingFound(parsingFailed: boolean): Findings {
  return {
    legacy: { simpleCommands: [], hasInputRedirect: false, hasOutputRedirect: false },
    structured: { parsingFailed, executableCommands: [], hasRedirects: false, hasCommandSubstitution: false, redirects: [] },
  };
}

/** A redirection that could not be read, or that is not known to be harmless. */
function unread(redirection: SyntaxNode): ShellRedirect {
  return { operator: "", destinationFds: [], targetNodeType: redirection.type };
}

/** One command line being read: what has been found so far, and how the tree is gone through. */
class Reading {
  readonly found = nothingFound(false);
  private everyRedirectionHarmless = true;
  /**
   * The redirections already read, told by the objects the parser hands out for them.
   *
   * Known fault, kept as it was: the parser's package keeps a node's object only while something else
   * holds it, and nothing here does. If memory is reclaimed between the two times a node's children are
   * asked for in `visit`, a redirection comes back as a new object, is not found here, and is read a
   * second time on its own: it is listed twice, and judged from the standard descriptors.
   */
  private readonly redirectionsRead = new WeakSet<SyntaxNode>();

  /** Reads the whole tree and gives the answer. */
  finish(top: SyntaxNode): Findings {
    this.visit(top);
    const { structured } = this.found;
    if (structured.hasRedirects) structured.allRedirectsAreDevNull = this.everyRedirectionHarmless;
    return this.found;
  }

  /** A node, then everything under it, in the order written. */
  private visit(node: SyntaxNode): void {
    // A node's redirections come before anything under it, so the redirections of a whole group are listed before those inside it.
    this.redirectionsUnder(node);
    // A redirection not read by now is the top of the tree: nothing above it could read it. It is read on its own.
    if (REDIRECTIONS.has(node.type) && !this.redirectionsRead.has(node)) this.redirection(node, new Descriptors());
    switch (node.type) {
      case "command":
        this.command(node);
        break;
      case "command_name":
        this.nameOnce(node.text);
        break;
      case "simple_command":
        this.simpleCommand(node);
        break;
      case "command_substitution":
      case "process_substitution":
        this.found.structured.hasCommandSubstitution = true;
        break;
    }
    for (const child of node.children) this.visit(child);
  }

  /** The redirections straight under one node are read together: each may copy what the ones before it set. */
  private redirectionsUnder(node: SyntaxNode): void {
    const descriptors = new Descriptors();
    for (const child of node.children) {
      if (REDIRECTIONS.has(child.type)) this.redirection(child, descriptors);
    }
  }

  private redirection(node: SyntaxNode, descriptors: Descriptors): void {
    if (this.redirectionsRead.has(node)) return;
    this.redirectionsRead.add(node);
    this.noteSigns(node);
    if (node.type === "file_redirect") {
      this.count(this.fileRedirection(node, descriptors));
    } else if (node.type === "heredoc_redirect") {
      this.count(this.hereDocument(node));
    } else {
      // A here-string, or a kind only another grammar has: counted, and never known to be harmless.
      this.list(unread(node));
      this.count(false);
    }
  }

  /** The shorter answer's two flags, from the redirection's own text: a here-document's whole text is searched too. */
  private noteSigns(redirection: SyntaxNode): void {
    const { legacy } = this.found;
    const text = redirection.text;
    if (INPUT_SIGN.test(text) || redirection.type === "heredoc_redirect" || redirection.type === "herestring_redirect") legacy.hasInputRedirect = true;
    if (OUTPUT_SIGN.test(text)) legacy.hasOutputRedirect = true;
  }

  /** Lists a file redirection and says whether it is harmless. One with no operator the grammar names is not listed. */
  private fileRedirection(node: SyntaxNode, descriptors: Descriptors): boolean {
    const parts = operatorAndTarget(node);
    if (parts === undefined) return false;
    const { operator, target } = parts;
    const changed = descriptorsChanged(node, operator);
    const text = plainText(target);
    this.list({
      operator,
      destinationFds: changed,
      targetNodeType: target?.type ?? "",
      ...(text === undefined ? {} : { targetText: text }),
    });
    const connection = descriptors.connectionMadeBy(operator, target);
    descriptors.connect(changed, connection);
    return connection !== "somewhere else";
  }

  /** Lists a here-document and says whether it is harmless: input for a plain command, outside any bare substitution. */
  private hereDocument(node: SyntaxNode): boolean {
    const fed = commandFed(node);
    if (fed === undefined || inBareSubstitution(node)) {
      this.list(unread(node));
      return false;
    }
    this.list({ operator: "<<", destinationFds: [0], targetNodeType: node.type, targetText: fed });
    return true;
  }

  private list(redirection: ShellRedirect): void {
    this.found.structured.redirects.push(redirection);
  }

  private count(harmless: boolean): void {
    this.found.structured.hasRedirects = true;
    if (!harmless) this.everyRedirectionHarmless = false;
  }

  /** A command with no name is one the grammar could not make sense of: the whole reading is marked as failed. */
  private command(node: SyntaxNode): void {
    const nameNode = node.childForFieldName("name");
    if (nameNode === null) {
      this.found.structured.parsingFailed = true;
      return;
    }
    const name = nameNode.text;
    const args = node.childrenForFieldName("argument").map((arg): ShellCommandArgument => ({ type: arg.type, value: arg.text }));
    // A command's name is listed every time it comes, unlike a name met on its own.
    this.found.legacy.simpleCommands.push(name);
    this.found.structured.executableCommands.push({
      name,
      args,
      fullText: [name, ...args.map((arg) => arg.value)].join(" "),
    });
  }

  /** A name met outside a command (the grammar gives one for input it could not place) is listed once. */
  private nameOnce(name: string): void {
    const names = this.found.legacy.simpleCommands;
    if (!names.includes(name)) names.push(name);
  }

  /** Another grammar's name for a command: its name once, or its whole text when it does not start with one. */
  private simpleCommand(node: SyntaxNode): void {
    const first = node.firstNamedChild;
    if (first?.type === "command_name") this.nameOnce(first.text);
    else this.found.legacy.simpleCommands.push(node.text);
  }
}

export function analyzeShellCommand(cmd: string): ShellCommandAnalysis {
  const bash = parserForBash();
  if (bash === null) return nothingFound(true);
  const tree = bash.parse(cmd);
  return new Reading().finish(tree.rootNode);
}
