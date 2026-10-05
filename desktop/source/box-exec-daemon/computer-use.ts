/**
 * Computer use for the box exec daemon (Track D, piece 3, 5 October 2026).
 *
 * The host's Computer tool sends one `agent.v1.ComputerUseArgs` with a list
 * of actions (mouse, keyboard, wait, screenshot, cursor position) and reads
 * back one `agent.v1.ComputerUseResult`: the last screenshot as base64 WebP
 * (`sand-computer-tool.ts` persists it as `image/webp`), a log, the cursor
 * position. Until now only the upstream's exec daemon answered that message.
 *
 * Everything is done with three programs the cloud computer image ships:
 * `xdotool` for input, ImageMagick's `import` for the screenshot (written as
 * WebP), `xdpyinfo` to know whether a display answers. The display is the
 * daemon's `DISPLAY` (the primary desktop is :1, a fork window is :N).
 */
import { spawn } from "node:child_process";

import {
  ComputerUseError,
  ComputerUseResult,
  ComputerUseSuccess,
  Coordinate,
  MouseButton,
  ScrollDirection,
  type ComputerUseAction,
  type ComputerUseArgs,
} from "../packages/proto/generated/agent/v1/computer_use_tool_pb.js";

export interface ComputerUseTools {
  readonly xdotool: string;
  readonly import: string;
  readonly xdpyinfo: string;
}

export { MouseButton, ScrollDirection };

export const DEFAULT_COMPUTER_USE_TOOLS: ComputerUseTools = { xdotool: "xdotool", import: "import", xdpyinfo: "xdpyinfo" };

/** The longest a single `wait` action sleeps; the host caps its own waits lower. */
export const COMPUTER_USE_MAX_WAIT_MS = 60_000;
/** The most wheel notches one `scroll` action turns. */
export const COMPUTER_USE_MAX_SCROLL_AMOUNT = 50;
/** How long one xdotool or screenshot call may take before it is killed. */
export const COMPUTER_USE_COMMAND_TIMEOUT_MS = 15_000;
/** Milliseconds between the keystrokes of a `type` action (xdotool's default is 12). */
export const COMPUTER_USE_TYPE_DELAY_MS = 12;
/** Milliseconds between the clicks of a double or triple click. */
export const COMPUTER_USE_CLICK_DELAY_MS = 80;
/** WebP quality of the screenshot. */
export const COMPUTER_USE_SCREENSHOT_QUALITY = 80;

const MOUSE_BUTTON_NUMBERS: Record<MouseButton, number> = {
  [MouseButton.UNSPECIFIED]: 1,
  [MouseButton.LEFT]: 1,
  [MouseButton.RIGHT]: 3,
  [MouseButton.MIDDLE]: 2,
  [MouseButton.BACK]: 8,
  [MouseButton.FORWARD]: 9,
};

const SCROLL_BUTTON_NUMBERS: Record<ScrollDirection, number> = {
  [ScrollDirection.UNSPECIFIED]: 5,
  [ScrollDirection.UP]: 4,
  [ScrollDirection.DOWN]: 5,
  [ScrollDirection.LEFT]: 6,
  [ScrollDirection.RIGHT]: 7,
};

/** Names the model uses for keys, mapped to the keysym names xdotool takes. */
const KEY_ALIASES: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl",
  alt: "alt", option: "alt", opt: "alt",
  shift: "shift",
  cmd: "super", command: "super", super: "super", meta: "super", win: "super", windows: "super",
  enter: "Return", return: "Return",
  esc: "Escape", escape: "Escape",
  backspace: "BackSpace",
  delete: "Delete", del: "Delete",
  tab: "Tab",
  space: "space", spacebar: "space",
  up: "Up", down: "Down", left: "Left", right: "Right",
  arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right",
  home: "Home", end: "End",
  pageup: "Page_Up", pagedown: "Page_Down", pgup: "Page_Up", pgdn: "Page_Down",
  insert: "Insert", ins: "Insert",
  capslock: "Caps_Lock",
  printscreen: "Print", prtsc: "Print",
  menu: "Menu",
  numlock: "Num_Lock",
  scrolllock: "Scroll_Lock",
  pause: "Pause",
};

/** ASCII punctuation by keysym name; xdotool refuses the characters themselves ("No such key name ','"). */
const PUNCTUATION_KEYSYMS: Record<string, string> = {
  " ": "space", "!": "exclam", "\"": "quotedbl", "#": "numbersign", "$": "dollar", "%": "percent", "&": "ampersand",
  "'": "apostrophe", "(": "parenleft", ")": "parenright", "*": "asterisk", "+": "plus", ",": "comma", "-": "minus",
  ".": "period", "/": "slash", ":": "colon", ";": "semicolon", "<": "less", "=": "equal", ">": "greater", "?": "question",
  "@": "at", "[": "bracketleft", "\\": "backslash", "]": "bracketright", "^": "asciicircum", "_": "underscore",
  "`": "grave", "{": "braceleft", "|": "bar", "}": "braceright", "~": "asciitilde",
};

/**
 * One key chord ("Ctrl+l", "cmd+shift+T", "Return", "Page_Down", "/") as
 * xdotool spells it ("ctrl+l", "super+shift+T", "Return", "Page_Down", "slash").
 */
export function xdotoolKeyChord(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) throw new Error("A key action needs a key.");
  if (trimmed === "+") return "plus";
  const parts = trimmed.split("+").map(part => part.trim());
  if (parts.some(part => part.length === 0)) {
    // "ctrl++" is ctrl and the plus key.
    const chord = trimmed.replace(/\+\+$/, "+plus").split("+").map(part => part.trim());
    if (chord.some(part => part.length === 0)) throw new Error(`Unreadable key chord: ${key}`);
    return chord.map(xdotoolKeyName).join("+");
  }
  return parts.map(xdotoolKeyName).join("+");
}

function xdotoolKeyName(part: string): string {
  const alias = KEY_ALIASES[part.toLowerCase()];
  if (alias != null) return alias;
  const punctuation = PUNCTUATION_KEYSYMS[part];
  if (punctuation != null) return punctuation;
  const functionKey = /^f([1-9]|1[0-9]|2[0-4])$/i.exec(part);
  if (functionKey != null) return `F${functionKey[1]}`;
  return part;
}

/** The modifier names of a `modifierKeys` string ("ctrl+shift"), as xdotool spells them. */
export function xdotoolModifiers(modifierKeys: string | undefined): string[] {
  if (modifierKeys == null || modifierKeys.trim().length === 0) return [];
  return modifierKeys.split(/[+,\s]+/).filter(part => part.length > 0).map(xdotoolKeyName);
}

export function mouseButtonNumber(button: MouseButton): number {
  return MOUSE_BUTTON_NUMBERS[button] ?? 1;
}

export function scrollButtonNumber(direction: ScrollDirection): number {
  return SCROLL_BUTTON_NUMBERS[direction] ?? 5;
}

export interface BoxComputerUseOptions {
  /** The daemon's environment at call time; `DISPLAY` picks the desktop. */
  readonly environment: () => NodeJS.ProcessEnv;
  readonly tools?: Partial<ComputerUseTools>;
  readonly commandTimeoutMs?: number;
}

interface CommandOutcome {
  readonly code: number;
  readonly stdout: Buffer;
  readonly stderr: string;
}

class ComputerUseActionError extends Error {}

function describeAction(action: ComputerUseAction): string {
  const value = action.action;
  switch (value.case) {
    case "mouseMove": return `move to ${point(value.value.coordinate)}`;
    case "click": return `${value.value.count > 1 ? `${value.value.count}× ` : ""}${MouseButton[value.value.button]?.toLowerCase() ?? "left"} click${value.value.coordinate == null ? "" : ` at ${point(value.value.coordinate)}`}${modifiersNote(value.value.modifierKeys)}`;
    case "mouseDown": return `${MouseButton[value.value.button]?.toLowerCase() ?? "left"} button down`;
    case "mouseUp": return `${MouseButton[value.value.button]?.toLowerCase() ?? "left"} button up`;
    case "drag": return `drag ${value.value.path.map(point).join(" → ")}${modifiersNote(value.value.modifierKeys)}`;
    case "scroll": return `scroll ${ScrollDirection[value.value.direction]?.toLowerCase() ?? "down"} ${value.value.amount || 3}${value.value.coordinate == null ? "" : ` at ${point(value.value.coordinate)}`}${modifiersNote(value.value.modifierKeys)}`;
    case "type": return `type ${value.value.text.length} characters`;
    case "key": return `key ${value.value.key}${value.value.holdDurationMs == null ? "" : ` held ${value.value.holdDurationMs} ms`}`;
    case "wait": return `wait ${value.value.durationMs} ms`;
    case "screenshot": return "screenshot";
    case "cursorPosition": return "cursor position";
    default: return "unset action";
  }
}

function point(coordinate: Coordinate | undefined): string {
  return coordinate == null ? "(current)" : `(${coordinate.x}, ${coordinate.y})`;
}

function modifiersNote(modifierKeys: string | undefined): string {
  return modifierKeys == null || modifierKeys.length === 0 ? "" : ` with ${modifierKeys}`;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new ComputerUseActionError("Aborted")); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(new ComputerUseActionError("Aborted")); };
    signal.addEventListener("abort", abort, { once: true });
  });
}

/**
 * Runs the actions of one ComputerUseArgs on the daemon's display, one call
 * at a time. A failure stops the batch; the result then carries the error,
 * how many actions ran, the log, and a last screenshot when one can be taken.
 */
export class BoxComputerUse {
  readonly #environment: () => NodeJS.ProcessEnv;
  readonly #tools: ComputerUseTools;
  readonly #commandTimeoutMs: number;
  #queue: Promise<unknown> = Promise.resolve();

  constructor(options: BoxComputerUseOptions) {
    this.#environment = options.environment;
    this.#tools = { ...DEFAULT_COMPUTER_USE_TOOLS, ...options.tools };
    this.#commandTimeoutMs = options.commandTimeoutMs ?? COMPUTER_USE_COMMAND_TIMEOUT_MS;
  }

  get display(): string | undefined {
    const display = this.#environment().DISPLAY;
    return display == null || display.trim().length === 0 ? undefined : display.trim();
  }

  /** True when `DISPLAY` is set and an X server answers on it. */
  async available(): Promise<boolean> {
    const display = this.display;
    if (display == null) return false;
    try {
      const outcome = await this.command(this.#tools.xdpyinfo, ["-display", display], { timeoutMs: 3_000 });
      return outcome.code === 0;
    } catch {
      return false;
    }
  }

  execute(args: ComputerUseArgs, signal: AbortSignal): Promise<ComputerUseResult> {
    const run = this.#queue.then(() => this.run(args, signal), () => this.run(args, signal));
    this.#queue = run.catch(() => {});
    return run;
  }

  private async run(args: ComputerUseArgs, signal: AbortSignal): Promise<ComputerUseResult> {
    const startedAt = Date.now();
    const log: string[] = [];
    let actionCount = 0;
    let screenshot: Buffer | undefined;
    let cursorPosition: Coordinate | undefined;
    const display = this.display;
    try {
      if (display == null) throw new ComputerUseActionError("No display: the daemon has no DISPLAY, so there is no desktop to act on.");
      for (const action of args.actions) {
        if (signal.aborted) throw new ComputerUseActionError("Aborted");
        const label = describeAction(action);
        const outcome = await this.perform(action, display, signal, args.bindUnmappedCharacters === true);
        if (outcome?.screenshot != null) screenshot = outcome.screenshot;
        if (outcome?.cursorPosition != null) cursorPosition = outcome.cursorPosition;
        actionCount += 1;
        log.push(`${actionCount}. ${label}${outcome?.note == null ? "" : ` — ${outcome.note}`}`);
      }
      return new ComputerUseResult({ result: { case: "success", value: new ComputerUseSuccess({
        actionCount,
        durationMs: Date.now() - startedAt,
        ...(screenshot == null ? {} : { screenshot: screenshot.toString("base64") }),
        log: log.join("\n"),
        ...(cursorPosition == null ? {} : { cursorPosition }),
      }) } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.push(`${actionCount + 1}. failed: ${message}`);
      let lastLook = screenshot;
      if (display != null && !signal.aborted) {
        try { lastLook = await this.screenshot(display, signal); } catch {}
      }
      return new ComputerUseResult({ result: { case: "error", value: new ComputerUseError({
        error: message,
        actionCount,
        durationMs: Date.now() - startedAt,
        log: log.join("\n"),
        ...(lastLook == null ? {} : { screenshot: lastLook.toString("base64") }),
      }) } });
    }
  }

  private async perform(action: ComputerUseAction, display: string, signal: AbortSignal, bindUnmapped: boolean): Promise<{ screenshot?: Buffer; cursorPosition?: Coordinate; note?: string } | undefined> {
    const value = action.action;
    switch (value.case) {
      case "mouseMove": {
        if (value.value.coordinate == null) throw new ComputerUseActionError("A move needs coordinates.");
        await this.xdotool(display, ["mousemove", "--sync", String(value.value.coordinate.x), String(value.value.coordinate.y)], signal);
        return undefined;
      }
      case "click": {
        const button = mouseButtonNumber(value.value.button);
        const count = Math.min(Math.max(value.value.count, 1), 3);
        const commands: string[] = [];
        if (value.value.coordinate != null) commands.push("mousemove", "--sync", String(value.value.coordinate.x), String(value.value.coordinate.y));
        commands.push("click", "--repeat", String(count), "--delay", String(COMPUTER_USE_CLICK_DELAY_MS), String(button));
        await this.withModifiers(display, xdotoolModifiers(value.value.modifierKeys), signal, () => this.xdotool(display, commands, signal));
        return undefined;
      }
      case "mouseDown":
        await this.xdotool(display, ["mousedown", String(mouseButtonNumber(value.value.button))], signal);
        return undefined;
      case "mouseUp":
        await this.xdotool(display, ["mouseup", String(mouseButtonNumber(value.value.button))], signal);
        return undefined;
      case "drag": {
        const path = value.value.path;
        if (path.length < 2) throw new ComputerUseActionError("A drag needs at least two points.");
        const button = String(mouseButtonNumber(value.value.button));
        const [start, ...rest] = path;
        const commands = ["mousemove", "--sync", String(start!.x), String(start!.y), "mousedown", button];
        for (const step of rest) commands.push("mousemove", "--sync", String(step.x), String(step.y), "sleep", "0.05");
        commands.push("mouseup", button);
        await this.withModifiers(display, xdotoolModifiers(value.value.modifierKeys), signal, () => this.xdotool(display, commands, signal));
        return undefined;
      }
      case "scroll": {
        const amount = Math.min(Math.max(value.value.amount, 0) || 3, COMPUTER_USE_MAX_SCROLL_AMOUNT);
        const commands: string[] = [];
        if (value.value.coordinate != null) commands.push("mousemove", "--sync", String(value.value.coordinate.x), String(value.value.coordinate.y));
        commands.push("click", "--repeat", String(amount), "--delay", "30", String(scrollButtonNumber(value.value.direction)));
        await this.withModifiers(display, xdotoolModifiers(value.value.modifierKeys), signal, () => this.xdotool(display, commands, signal));
        return undefined;
      }
      case "type": {
        if (value.value.text.length === 0) return { note: "nothing to type" };
        await this.xdotool(display, ["type", "--delay", String(COMPUTER_USE_TYPE_DELAY_MS), "--file", "-"], signal, value.value.text);
        return bindUnmapped ? { note: "unmapped characters bound" } : undefined;
      }
      case "key": {
        const chord = xdotoolKeyChord(value.value.key);
        const hold = value.value.holdDurationMs;
        if (hold != null && hold > 0) {
          await this.xdotool(display, ["keydown", chord], signal);
          try {
            await sleep(Math.min(hold, COMPUTER_USE_MAX_WAIT_MS), signal);
          } finally {
            await this.xdotool(display, ["keyup", chord], signal).catch(() => {});
          }
        } else {
          await this.xdotool(display, ["key", chord], signal);
        }
        return chord === value.value.key ? undefined : { note: `sent as ${chord}` };
      }
      case "wait":
        await sleep(Math.min(Math.max(value.value.durationMs, 0), COMPUTER_USE_MAX_WAIT_MS), signal);
        return undefined;
      case "screenshot":
        return { screenshot: await this.screenshot(display, signal) };
      case "cursorPosition":
        return { cursorPosition: await this.cursorPosition(display, signal) };
      default:
        throw new ComputerUseActionError("An action without a kind cannot run.");
    }
  }

  private async withModifiers(display: string, modifiers: string[], signal: AbortSignal, body: () => Promise<void>): Promise<void> {
    if (modifiers.length === 0) { await body(); return; }
    await this.xdotool(display, ["keydown", modifiers.join("+")], signal);
    try {
      await body();
    } finally {
      await this.xdotool(display, ["keyup", modifiers.join("+")], signal).catch(() => {});
    }
  }

  async screenshot(display: string, signal: AbortSignal): Promise<Buffer> {
    const outcome = await this.command(this.#tools.import, ["-display", display, "-window", "root", "-silent", "-quality", String(COMPUTER_USE_SCREENSHOT_QUALITY), "webp:-"], { signal, display });
    if (outcome.code !== 0) throw new ComputerUseActionError(`Screenshot failed (import exited ${outcome.code}): ${outcome.stderr.trim()}`);
    if (outcome.stdout.length < 12 || outcome.stdout.toString("latin1", 0, 4) !== "RIFF" || outcome.stdout.toString("latin1", 8, 12) !== "WEBP") {
      throw new ComputerUseActionError("Screenshot failed: import did not write a WebP image.");
    }
    return outcome.stdout;
  }

  async cursorPosition(display: string, signal: AbortSignal): Promise<Coordinate> {
    const outcome = await this.command(this.#tools.xdotool, ["getmouselocation", "--shell"], { signal, display });
    if (outcome.code !== 0) throw new ComputerUseActionError(`Pointer position failed (xdotool exited ${outcome.code}): ${outcome.stderr.trim()}`);
    const text = outcome.stdout.toString("utf8");
    const x = /^X=(-?\d+)$/m.exec(text);
    const y = /^Y=(-?\d+)$/m.exec(text);
    if (x == null || y == null) throw new ComputerUseActionError(`Pointer position unreadable: ${text.trim()}`);
    return new Coordinate({ x: Number.parseInt(x[1]!, 10), y: Number.parseInt(y[1]!, 10) });
  }

  private async xdotool(display: string, commands: string[], signal: AbortSignal, stdin?: string): Promise<void> {
    const outcome = await this.command(this.#tools.xdotool, commands, { signal, display, ...(stdin == null ? {} : { stdin }) });
    if (outcome.code !== 0) throw new ComputerUseActionError(`xdotool ${commands[0]} exited ${outcome.code}: ${outcome.stderr.trim() || "no detail"}`);
  }

  private command(file: string, args: string[], options: { signal?: AbortSignal; display?: string; stdin?: string; timeoutMs?: number }): Promise<CommandOutcome> {
    const base = this.#environment();
    const env: NodeJS.ProcessEnv = {
      ...base,
      ...(options.display == null ? {} : { DISPLAY: options.display }),
      // xdotool reads multi-byte text through the locale; without a UTF-8
      // one it stops at the first accent ("Invalid multi-byte sequence").
      LANG: base.LANG?.toUpperCase().includes("UTF-8") ? base.LANG : "C.UTF-8",
      LC_ALL: base.LC_ALL?.toUpperCase().includes("UTF-8") ? base.LC_ALL : "C.UTF-8",
    };
    return new Promise<CommandOutcome>((resolve, reject) => {
      const child = spawn(file, args, { env, stdio: ["pipe", "pipe", "pipe"] });
      const stdout: Buffer[] = [];
      let stderr = "";
      let settled = false;
      const finish = (outcome: CommandOutcome | Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abort);
        if (outcome instanceof Error) reject(outcome); else resolve(outcome);
      };
      const abort = () => { child.kill("SIGKILL"); finish(new ComputerUseActionError("Aborted")); };
      const timer = setTimeout(() => { child.kill("SIGKILL"); finish(new ComputerUseActionError(`${file} ${args[0] ?? ""} took longer than ${options.timeoutMs ?? this.#commandTimeoutMs} ms`)); }, options.timeoutMs ?? this.#commandTimeoutMs);
      options.signal?.addEventListener("abort", abort, { once: true });
      child.stdout.on("data", (chunk: Buffer) => { stdout.push(chunk); });
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.once("error", error => finish(new ComputerUseActionError(`${file} could not start: ${error.message}`)));
      child.once("close", code => finish({ code: code ?? 1, stdout: Buffer.concat(stdout), stderr }));
      if (options.stdin != null) child.stdin.end(options.stdin, "utf8"); else child.stdin.end();
    });
  }
}
