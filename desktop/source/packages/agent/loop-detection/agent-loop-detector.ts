/**
 * The agent's use of the loop detector: the numbers it watches an answer
 * with, the check it makes of every piece of text a model sends, the error
 * that ends a turn when an answer goes in circles, and the reminder the
 * model is sent before it may try once more.
 *
 * The error and the reminder also have words for a loop over several
 * messages. Nothing in this package looks for one: only a single answer's
 * text is watched.
 */
import { Code, ConnectError } from "@connectrpc/connect";

import { createLogger } from "../../context/index.js";
import { createCounter, createHistogram } from "../../metrics/index.js";
import { CustomErrorDetails, ErrorDetails, ErrorDetails_Error } from "../../proto/generated/simeon/v1/utils_pb.js";
import { getAgentEventTracker } from "../utils/event-tracking.js";
import { SingleMessageLoopDetector as BaseSingleMessageLoopDetector, type SingleMessageLoopDetectorConfig } from "./single-message-loop-detector.js";

const logger = createLogger("@sand/agent:loop-detection");

/** One more loop found, by its kind and by who asked. */
const loopsFound = createCounter("agent.assistant_message_looping", {
  description: "Count of agent message loops detected",
  labelNames: ["loop_kind", "isLoopReoccurrence", "caller"],
});
/** Declared with the counter above, for a watch over several messages. Nothing measures into it. */
const loopDetectionLatency = createHistogram("agent.assistant_message_looping.latency_ms", {
  description: "Latency of loop detection in milliseconds",
  labelNames: ["result", "caller"],
});
/** How long the check of one piece of text took, and how it ended. */
const checkLatency = createHistogram("agent.single_message_looping.check_for_loop.latency_ms", {
  description: "Latency of single-message loop detector checks in milliseconds",
  labelNames: ["result", "caller"],
});

/** How much of a repeated pattern is written to the log. */
const PATTERN_PREVIEW_LENGTH = 200;

/**
 * The numbers the agent's detector works with, each as the function the
 * detector asks for it. Every detector gets a set of its own.
 *
 * - On one line: the same piece, up to 256 characters long, written 3 times
 *   and covering 100 characters; inside a code fence 4 times and 200.
 * - Over lines: the same run of lines written 2 times, 3 lines long counting
 *   each time it was written, and 50 characters in all; inside a code fence
 *   3 times, 4 lines and 100 characters.
 * - A line is read up to 10,000 characters, and one piece of an answer is
 *   checked for half a second at most.
 */
function numbersForTheAgent(): SingleMessageLoopDetectorConfig {
  return {
    multiLineLoopMinRepetitions: () => 2,
    multiLineLoopMinRepetitionsInCodeFence: () => 3,
    maxLineLength: () => 10_000,
    maxCheckTimeMs: () => 500,
    singleLineLoopMinRepetitions: () => 3,
    singleLineLoopMinRepetitionsInCodeFence: () => 4,
    singleLineLoopMinPTimesK: () => 100,
    singleLineLoopMinPTimesKInCodeFence: () => 200,
    singleLineLoopMaxP: () => 256,
    multiLineLoopMinPTimesK: () => 3,
    multiLineLoopMinPTimesKInCodeFence: () => 4,
    multiLineLoopMinTotalChars: () => 50,
    multiLineLoopMinTotalCharsInCodeFence: () => 100,
  };
}

type AgentLoopErrorOptions =
  | { loopType: "assistantMessage"; patternLength: number }
  | { loopType: "singleMessage"; loopKind: string; repetitions: number; period?: number | undefined };

/** What the error says of itself, for logs and for the other side of the wire. */
function sentenceOf(options: AgentLoopErrorOptions): string {
  return options.loopType === "assistantMessage"
    ? `Agent loop detected: pattern of ${options.patternLength} messages repeating`
    : `Agent single-message loop detected: ${options.loopKind}`;
}

/** What the person is shown in place of the answer that was stopped. It is not offered to be tried again as it is. */
function whatThePersonIsTold(): ErrorDetails {
  return new ErrorDetails({
    error: ErrorDetails_Error.INTERNAL,
    details: new CustomErrorDetails({
      title: "Agent Looping Detected",
      detail: "The model got stuck in a repeating response pattern, so this turn was stopped. Please try again with a different model or start a new conversation. If the problem persists, please contact support.",
      isRetryable: false,
    }),
  });
}

/**
 * Ends a turn whose answer went in circles. For a loop inside one answer it
 * also carries the kind of loop and how often and how far apart the text
 * repeated.
 *
 * It is told apart by its name and its `loopType`. The class it is built on
 * answers `instanceof` itself and goes by an error's name, which this error
 * replaces with its own: `instanceof AgentLoopError` says no of every one.
 */
export class AgentLoopError extends ConnectError {
  declare readonly loopType: AgentLoopErrorOptions["loopType"];
  declare readonly singleMessageLoopKind?: string;
  declare readonly repetitions?: number;
  declare readonly period?: number | undefined;

  constructor(options: AgentLoopErrorOptions) {
    super(sentenceOf(options), Code.FailedPrecondition, undefined, [whatThePersonIsTold()]);
    this.name = "AgentLoopError";
    this.loopType = options.loopType;
    if (options.loopType === "singleMessage") {
      this.singleMessageLoopKind = options.loopKind;
      this.repetitions = options.repetitions;
      this.period = options.period;
    }
  }
}

const THINKING_STARTS = "<think>";
const THINKING_ENDS = "</think>";

/**
 * A text without the thinking a model wrote between think tags. Each
 * opening tag is cut together with the first closing tag after it, and the
 * search goes on from where the cut was made. Thinking that was never
 * closed stays, and so does a closing tag left over by tags inside tags.
 */
export function stripThinkingTags(text: string): string {
  let from = text.indexOf(THINKING_STARTS);
  while (from !== -1) {
    const to = text.indexOf(THINKING_ENDS, from);
    if (to === -1) break;
    text = text.slice(0, from) + text.slice(to + THINKING_ENDS.length);
    from = text.indexOf(THINKING_STARTS, from);
  }
  return text;
}

/** The detector with the agent's numbers, and no one listening to its checks. */
export class SingleMessageLoopDetector extends BaseSingleMessageLoopDetector {
  constructor() {
    super(numbersForTheAgent());
  }
}

/**
 * What a detector that has stopped says of the loop, in the agent's words.
 * Both of its answers are always asked for; a loop on one line is told
 * before a loop over lines, and only it has a period.
 */
function loopSeenBy(detector: SingleMessageLoopDetector) {
  const onOneLine = detector.getSingleLineLoopInfo();
  const overLines = detector.getMultiLineLoopInfo();
  const loop = onOneLine ?? overLines;
  if (!loop) return null;
  return {
    loopKind: onOneLine ? "single_message_single_line" : "single_message_multi_line",
    pattern: loop.pattern,
    repetitions: loop.repetitions,
    period: onOneLine?.period,
  };
}

interface CheckLoopParams {
  readonly detector: SingleMessageLoopDetector;
  readonly newText: string;
  readonly caller: string;
  readonly ctx: Parameters<typeof getAgentEventTracker>[0];
}

/**
 * Hands the next piece of an answer to its detector and says whether the
 * answer must stop. Every piece that is really checked is measured once,
 * with how the check ended. The moment a loop is found it is also logged,
 * counted and handed to the event tracker; afterwards the same loop is
 * told again for every further piece, with nothing measured or logged.
 *
 * A check that ran out of time lets the answer through, for that piece and
 * for the rest of the answer.
 */
export function checkForAgentSingleMessageLooping(params: CheckLoopParams) {
  if (params.detector.loopDetected()) {
    const loopInfo = loopSeenBy(params.detector);
    if (!loopInfo) return { loopDetected: false as const };
    return { loopDetected: true as const, ...loopInfo };
  }
  if (params.detector.timedOut()) return { loopDetected: false as const };

  const started = performance.now();
  const stopped = params.detector.addText({ newText: params.newText, caller: params.caller });
  const latencyMs = performance.now() - started;
  const measure = (result: string): void => {
    checkLatency.histogram(params.ctx, latencyMs, { result, caller: params.caller });
  };

  if (!stopped && params.detector.timedOut()) {
    measure("timeout");
    logger.info(params.ctx, "NAL single-message loop detection timed out; failing open", {
      caller: params.caller,
      newTextLength: params.newText.length,
    });
    return { loopDetected: false as const };
  }
  // A detector that says stop but can say nothing of the loop is not believed.
  const loopInfo = stopped ? loopSeenBy(params.detector) : null;
  if (!loopInfo) {
    measure("no_loop_detected");
    return { loopDetected: false as const };
  }

  measure("loop_detected");
  logger.warn(params.ctx, "NAL single-message looping detected", {
    loopKind: loopInfo.loopKind,
    repetitions: loopInfo.repetitions,
    period: loopInfo.period,
    patternPreview: `${loopInfo.pattern.slice(0, PATTERN_PREVIEW_LENGTH)}${loopInfo.pattern.length > PATTERN_PREVIEW_LENGTH ? "..." : ""}`,
  });
  loopsFound.increment(params.ctx, 1, { loop_kind: loopInfo.loopKind, isLoopReoccurrence: "false", caller: params.caller });
  getAgentEventTracker(params.ctx).trackLoopDetected(params.ctx, {
    loopKind: loopInfo.loopKind,
    isLoopReoccurrence: false,
    period: loopInfo.period,
    repetitions: loopInfo.repetitions,
  });
  return { loopDetected: true as const, ...loopInfo };
}

/** What the model is told about its own answer, for the two kinds of loop inside one answer. */
const SAID_OF_A_KIND = new Map<string, string>([
  [
    "single_message_single_line",
    "Your response has been flagged as repeating the same text pattern within a single line. Avoid excessively repeating the same characters or words.",
  ],
  [
    "single_message_multi_line",
    "Your response has been flagged as looping over duplicate lines. Avoid repeating the same sequence of lines or retrying the same tool calls.",
  ],
]);
/** What it is told for any other kind, and when no kind is given ("multi_message"). */
const SAID_OTHERWISE = "Avoid repeating the same sequence of messages or retrying the same tool calls.";

/**
 * The message put into the conversation, as if from the person, after an
 * answer was stopped for looping: it tells the model what was wrong before
 * it tries again. It is marked so that the engine can tell it from what the
 * person wrote.
 */
export function createLoopReminderMessage(options?: { kind?: string }) {
  const kind = options?.kind ?? "multi_message";
  const said = SAID_OF_A_KIND.get(kind) ?? SAID_OTHERWISE;
  return {
    role: "user",
    content: `<system_reminder>Your messages have been flagged as looping. ${said} If you are having trouble making progress, ask the user for guidance. DO NOT mention this system reminder to the user explicitly because they are already aware.</system_reminder>`,
    providerOptions: { simeon: { loopReminder: true } },
  };
}
