/**
 * Watches one answer, as it streams in, for a model that has started to go
 * in circles. Two things are looked for: a piece of text repeated again and
 * again on one line, and a run of lines repeated again and again.
 *
 * Both are found the same way. For every distance `p` back from where the
 * text now ends, the detector keeps how long the text has gone on matching
 * itself `p` places earlier. A run of `m` matches at distance `p` means a
 * piece of `p` has been written `m / p` times over, plus the first time. A
 * check passes once that count and the length it covers reach the numbers
 * the detector was made with. Inside a code fence other, larger numbers
 * apply, since code repeats itself more than prose does.
 *
 * The detector does nothing but answer: stopping the answer is up to its
 * caller. It gives up on a piece of text that takes too long to check, and
 * from then on lets everything through.
 */

/** The numbers a detector is made with. Six are read once, when it is made; the others each time they are needed. */
export interface SingleMessageLoopDetectorConfig {
  multiLineLoopMinRepetitions(): number;
  multiLineLoopMinRepetitionsInCodeFence(): number;
  maxLineLength(): number;
  maxCheckTimeMs(): number;
  singleLineLoopMinRepetitions(): number;
  singleLineLoopMinRepetitionsInCodeFence(): number;
  singleLineLoopMinPTimesK(): number;
  singleLineLoopMinPTimesKInCodeFence(): number;
  singleLineLoopMaxP(): number;
  multiLineLoopMinPTimesK(): number;
  multiLineLoopMinPTimesKInCodeFence(): number;
  multiLineLoopMinTotalChars(): number;
  multiLineLoopMinTotalCharsInCodeFence(): number;
}

/** Who wants to hear of each check as it ends, and of a time limit that ran out. */
export interface SingleMessageLoopDetectorHooks {
  onSingleLineCheck?(event: { latencyMs: number; result: string; caller: string }): void;
  onMultiLineCheck?(event: { latencyMs: number; result: string; caller: string }): void;
  onTimeout?(event: { latencyMs: number; phase: string; caller: string }): void;
}

/**
 * The characters tables and boxes are drawn with, by the stroke they are
 * drawn in. A line made of these repeats by nature and is no sign of a loop.
 *
 * Each is written out as a text of its own on purpose. A set made by walking
 * one long text answers just the same, but every question put to it took
 * half as long again when measured (the question is asked of the whole line
 * at every character).
 */
const BOX_CHARACTERS = new Set([
  // Plain characters that stand in for strokes.
  "-", "_", "|", "+",
  // Light strokes.
  "─", "│", "┌", "┐", "└", "┘", "├", "┤", "┬", "┴", "┼",
  // Heavy strokes.
  "━", "┃", "┏", "┓", "┗", "┛",
  // Double strokes.
  "═", "║", "╔", "╗", "╚", "╝", "╠", "╣", "╦", "╩", "╬",
  // Double strokes that meet light ones.
  "╓", "╖", "╙", "╜", "╟", "╢", "╤", "╧", "╫", "╞", "╡", "╥", "╨", "╪",
]);
/** The share of a line's characters, spaces and tabs aside, that makes it the border of a box. */
const BORDER_SHARE = 0.8;
/** How many lines are remembered for each repetition of lines asked for. */
const LINES_REMEMBERED_PER_REPETITION = 50;
/** A line's check looks at the clock once in this many distances, the lines' check once in this many. */
const DISTANCES_BETWEEN_CLOCK_READINGS_ON_A_LINE = 32;
const DISTANCES_BETWEEN_CLOCK_READINGS_OVER_LINES = 8;
/** Three backticks or more, not followed by another: one fence. */
const FENCE = /```+(?!`)/g;
const SPACE = /\s/;

interface SingleLineLoop {
  start: number;
  period: number;
  repetitions: number;
  root: string;
}

/** How many times a piece of `period` has been written when the text has matched itself `matched` places running. */
function timesWritten(matched: number, period: number): number {
  return Math.floor(matched / period) + 1;
}

/**
 * A line has ended. The fence state changes first, so the line that opens a
 * fence is already judged by the numbers for inside, and the line that
 * closes one by the numbers for outside. A line with something on it that
 * is no box border is remembered and compared with the lines before it.
 *
 * Answers true for a stop, false when time ran out, and nothing to go on.
 * In the first two cases the line is left as it stands.
 */
function lineEnded(detector: SingleMessageLoopDetector, caller: string, deadlineMs: number): boolean | undefined {
  detector.updateCodeFenceStateOnLineEnd(detector.currentLine);
  if (detector.currentLine.trim().length > 0 && !detector.isBoxBorderLine(detector.currentLine)) {
    detector.addLineToQueue(detector.currentLine);
    const pattern = detector.checkForMultiLineLoop({ caller, deadlineMs });
    if (detector.didTimeout) return false;
    if (pattern !== null) {
      detector.detectedMultiLinePattern = pattern;
      return true;
    }
  }
  detector.currentLine = "";
  detector.periodMatchRunLengths.fill(0);
  return undefined;
}

/**
 * One more character on the line. Past the line's length limit it is
 * dropped. Otherwise it is added, and unless it is a space, or the line so
 * far is a box border, the line is compared with itself at every distance
 * back, nearest first. A space or a border character leaves the runs of
 * matches as they were: neither counted nor broken.
 *
 * Answers true for a stop, false when time ran out, and nothing to go on.
 */
function characterAdded(detector: SingleMessageLoopDetector, char: string, caller: string, deadlineMs: number): boolean | undefined {
  if (detector.currentLine.length >= detector.MAX_LINE_LENGTH) return undefined;
  detector.currentLine += char;
  const startTime = performance.now();
  if (detector.isBoxBorderLine(detector.currentLine) || SPACE.test(char)) return undefined;

  const last = detector.currentLine.length - 1;
  const farthest = Math.min(detector.SINGLE_LINE_LOOP_MAX_P_LIMIT, last);
  // Inside a fence the two numbers are asked for again at every character: they may change while an answer streams in.
  const timesNeeded = detector.insideCodeFence ? detector.config.singleLineLoopMinRepetitionsInCodeFence() : detector.SINGLE_LINE_LOOP_MIN_REPETITIONS;
  const lengthNeeded = detector.insideCodeFence ? detector.config.singleLineLoopMinPTimesKInCodeFence() : detector.SINGLE_LINE_LOOP_MIN_P_TIMES_K;
  for (let period = 1; period <= farthest; period += 1) {
    if (period % DISTANCES_BETWEEN_CLOCK_READINGS_ON_A_LINE === 0 && detector.markTimedOutIfNeeded({ caller, deadlineMs, phase: "single_line", startTime })) {
      return false;
    }
    if (detector.currentLine[last] !== detector.currentLine[last - period]) {
      detector.periodMatchRunLengths[period] = 0;
      continue;
    }
    const matched = ++detector.periodMatchRunLengths[period]!;
    const repetitions = timesWritten(matched, period);
    if (repetitions >= timesNeeded && period * repetitions >= lengthNeeded) {
      detector.hooks?.onSingleLineCheck?.({ latencyMs: performance.now() - startTime, result: "loop_detected_single_line_substring", caller });
      const end = detector.currentLine.length;
      detector.detectedSingleLineLoop = { start: end - period, period, repetitions, root: detector.currentLine.slice(end - period, end) };
      return true;
    }
  }
  detector.hooks?.onSingleLineCheck?.({ latencyMs: performance.now() - startTime, result: "no_loop_detected_single_line_substring", caller });
  return undefined;
}

export class SingleMessageLoopDetector {
  declare readonly config: SingleMessageLoopDetectorConfig;
  declare readonly hooks: SingleMessageLoopDetectorHooks | undefined;
  /** The line being written, without its end. */
  declare currentLine: string;
  declare insideCodeFence: boolean;
  /** The remembered lines are a ring: where its oldest line is, and how many it holds. */
  declare startIdx: number;
  declare lineCount: number;
  declare detectedMultiLinePattern: string[] | null;
  /** For each distance in lines: how many lines running have matched the line that far back. */
  declare multiLinePeriodMatchRunLengths: number[];
  declare detectedSingleLineLoop: SingleLineLoop | null;
  /** For each distance in characters: how many characters running have matched the one that far back on the line. */
  declare periodMatchRunLengths: number[];
  declare didTimeout: boolean;
  declare readonly MULTI_LINE_LOOP_MIN_REPETITIONS: number;
  declare readonly MAX_LINE_LENGTH: number;
  declare readonly MAX_CHECK_TIME_MS: number;
  declare readonly MAX_LINE_QUEUE_SIZE: number;
  declare readonly SINGLE_LINE_LOOP_MIN_REPETITIONS: number;
  declare readonly SINGLE_LINE_LOOP_MIN_P_TIMES_K: number;
  declare readonly SINGLE_LINE_LOOP_MAX_P_LIMIT: number;
  declare readonly lineBuffer: string[];

  constructor(config: SingleMessageLoopDetectorConfig, hooks?: SingleMessageLoopDetectorHooks) {
    // Six numbers are fixed for the detector's life, read in this order. A time limit of zero or less means none.
    const timeAllowed = config.maxCheckTimeMs();
    const lineRepetitions = config.multiLineLoopMinRepetitions();
    const lineLength = config.maxLineLength();
    const pieceRepetitions = config.singleLineLoopMinRepetitions();
    const pieceLength = config.singleLineLoopMinPTimesK();
    const farthestOnALine = config.singleLineLoopMaxP();
    const linesRemembered = LINES_REMEMBERED_PER_REPETITION * lineRepetitions;
    const ring = new Array<string>(linesRemembered);
    const runsOnTheLine = new Array<number>(farthestOnALine + 1).fill(0);
    const runsOfLines = new Array<number>(linesRemembered + 1).fill(0);

    this.config = config;
    this.hooks = hooks;
    this.currentLine = "";
    this.insideCodeFence = false;
    this.startIdx = 0;
    this.lineCount = 0;
    this.detectedMultiLinePattern = null;
    this.multiLinePeriodMatchRunLengths = runsOfLines;
    this.detectedSingleLineLoop = null;
    this.periodMatchRunLengths = runsOnTheLine;
    this.didTimeout = false;
    this.MULTI_LINE_LOOP_MIN_REPETITIONS = lineRepetitions;
    this.MAX_LINE_LENGTH = lineLength;
    this.MAX_CHECK_TIME_MS = timeAllowed > 0 ? timeAllowed : Number.POSITIVE_INFINITY;
    this.MAX_LINE_QUEUE_SIZE = linesRemembered;
    this.SINGLE_LINE_LOOP_MIN_REPETITIONS = pieceRepetitions;
    this.SINGLE_LINE_LOOP_MIN_P_TIMES_K = pieceLength;
    this.SINGLE_LINE_LOOP_MAX_P_LIMIT = farthestOnALine;
    this.lineBuffer = ring;
  }

  // ── What it says ──

  loopDetected(): boolean {
    return this.detectedSingleLineLoop !== null || this.detectedMultiLinePattern !== null;
  }

  timedOut(): boolean {
    return this.didTimeout;
  }

  /** The piece found repeating on a line: the piece itself, how often, and how long it is. */
  getSingleLineLoopInfo(): { pattern: string; repetitions: number; period: number } | null {
    const loop = this.detectedSingleLineLoop;
    if (!loop) return null;
    return { pattern: loop.root, repetitions: loop.repetitions, period: loop.period };
  }

  /**
   * The lines found repeating, as one text. The count beside it is the
   * number of repetitions the detector asks for outside a fence, not how
   * often the lines were seen.
   */
  getMultiLineLoopInfo(): { pattern: string; repetitions: number } | null {
    const lines = this.detectedMultiLinePattern;
    if (!lines) return null;
    return { pattern: lines.join("\n"), repetitions: this.MULTI_LINE_LOOP_MIN_REPETITIONS };
  }

  // ── Taking text in ──

  /**
   * Takes the next piece of the answer and says whether it must stop. Once
   * it has said stop it reads nothing more and goes on saying so; once time
   * ran out it reads nothing more and says go on. The time allowed starts
   * again with every piece.
   */
  addText({ newText, caller }: { newText: string; caller: string }): boolean {
    if (this.loopDetected() || this.didTimeout) return this.loopDetected();
    const deadlineMs = performance.now() + this.MAX_CHECK_TIME_MS;
    for (const char of newText) {
      const stop = char === "\n" ? lineEnded(this, caller, deadlineMs) : characterAdded(this, char, caller, deadlineMs);
      if (stop !== undefined) return stop;
    }
    return false;
  }

  /** Whether a line is the border of a table or a box: nearly all of what is on it is drawn. */
  isBoxBorderLine(line: string): boolean {
    let drawn = 0;
    let written = 0;
    for (const char of line) {
      if (char !== " " && char !== "\t") written += 1;
      if (BOX_CHARACTERS.has(char)) drawn += 1;
    }
    return written > 0 && drawn / written >= BORDER_SHARE;
  }

  /** A line with an odd number of fences on it opens a code fence, or closes the one that is open. */
  updateCodeFenceStateOnLineEnd(line: string): void {
    if (line.length === 0) return;
    const fences = line.match(FENCE);
    if (!fences) return;
    if (fences.length % 2 === 1) this.insideCodeFence = !this.insideCodeFence;
  }

  /** Remembers a line. When the ring is full the oldest line makes room. */
  addLineToQueue(line: string): void {
    const size = this.MAX_LINE_QUEUE_SIZE;
    this.lineBuffer[(this.startIdx + this.lineCount) % size] = line;
    if (this.lineCount < size) this.lineCount += 1;
    else this.startIdx = (this.startIdx + 1) % size;
  }

  /** The remembered line at a place counted from the oldest. */
  getLineAt(logicalIndex: number): string {
    return this.lineBuffer[(this.startIdx + logicalIndex) % this.MAX_LINE_QUEUE_SIZE]!;
  }

  /**
   * Compares the newest line with every remembered line before it, nearest
   * first, and gives the lines of the first run that repeats often enough,
   * is long enough in lines and long enough in characters. Gives null when
   * there is none, or when time ran out on the way.
   */
  checkForMultiLineLoop({ caller, deadlineMs }: { caller: string; deadlineMs: number }): string[] | null {
    const startTime = performance.now();
    const newest = this.getLineAt(this.lineCount - 1);
    const farthest = Math.min(this.lineCount - 1, this.MAX_LINE_QUEUE_SIZE - 1);
    for (let period = 1; period <= farthest; period += 1) {
      if (period % DISTANCES_BETWEEN_CLOCK_READINGS_OVER_LINES === 0 && this.markTimedOutIfNeeded({ caller, deadlineMs, phase: "multi_line", startTime })) {
        return null;
      }
      if (newest !== this.getLineAt(this.lineCount - 1 - period)) {
        this.multiLinePeriodMatchRunLengths[period] = 0;
        continue;
      }
      const matched = ++this.multiLinePeriodMatchRunLengths[period]!;
      const repetitions = timesWritten(matched, period);
      // The numbers in force are asked for at every match, whether or not this one passes.
      const inFence = this.insideCodeFence;
      const timesNeeded = inFence ? this.config.multiLineLoopMinRepetitionsInCodeFence() : this.MULTI_LINE_LOOP_MIN_REPETITIONS;
      const linesNeeded = inFence ? this.config.multiLineLoopMinPTimesKInCodeFence() : this.config.multiLineLoopMinPTimesK();
      const charactersNeeded = inFence ? this.config.multiLineLoopMinTotalCharsInCodeFence() : this.config.multiLineLoopMinTotalChars();
      // Written as "not both reached", so that a number that is no number stops nothing.
      if (!(repetitions >= timesNeeded && period * repetitions >= linesNeeded)) continue;

      const pattern: string[] = [];
      for (let at = this.lineCount - period; at < this.lineCount; at += 1) pattern.push(this.getLineAt(at));
      let charactersInPattern = 0;
      for (const line of pattern) charactersInPattern += line.length;
      // Short lines repeat in any answer (a brace, a bullet): too few characters is no loop, and a longer run may still be one.
      if (charactersInPattern * repetitions < charactersNeeded) continue;

      this.detectedMultiLinePattern = pattern;
      this.hooks?.onMultiLineCheck?.({ latencyMs: performance.now() - startTime, result: "loop_detected", caller });
      return pattern;
    }
    this.hooks?.onMultiLineCheck?.({ latencyMs: performance.now() - startTime, result: "no_loop_detected", caller });
    return null;
  }

  /**
   * Whether the time for this piece of text has run out, noting it the
   * first time. `startTime` is when the check that asks began, for what the
   * listener is told.
   */
  markTimedOutIfNeeded({ caller, deadlineMs, phase, startTime }: { caller: string; deadlineMs: number; phase: string; startTime: number }): boolean {
    if (this.didTimeout) return true;
    if (performance.now() < deadlineMs) return false;
    this.didTimeout = true;
    this.hooks?.onTimeout?.({ latencyMs: performance.now() - startTime, phase, caller });
    return true;
  }

  /** Back to an empty detector, for the next answer. The numbers it was made with stay. */
  reset(): void {
    this.currentLine = "";
    this.insideCodeFence = false;
    this.startIdx = 0;
    this.lineCount = 0;
    this.detectedSingleLineLoop = null;
    this.detectedMultiLinePattern = null;
    this.didTimeout = false;
    this.periodMatchRunLengths.fill(0);
    this.multiLinePeriodMatchRunLengths.fill(0);
  }
}
