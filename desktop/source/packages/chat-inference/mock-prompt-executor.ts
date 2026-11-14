/**
 * An executor that answers without a model. It sends the words and the tool
 * calls it is told to, cut into pieces the way a model streams them, and can
 * be told to wait between pieces or to fail at the end. The engine uses it
 * when it is set to answer from a script instead of a model; nothing here
 * reaches a network.
 */
import { BasePromptBuilder, BasePromptExecutor } from "./base.js";

type Loose = Record<string, any>;

export interface MockPromptExecutorOptions {
  response?: string;
  toolCalls?: readonly Loose[];
  streamDelay?: number;
  chunkSize?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    maxTokens?: number;
  };
  simulateError?: unknown;
}

/** The options with everything that was left out filled in. */
interface FilledOptions {
  response: string;
  toolCalls: readonly Loose[];
  streamDelay: number;
  chunkSize: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    maxTokens: number;
  };
  simulateError?: unknown;
}

type Usage = FilledOptions["usage"];

/** What stands for an option that is left out. No tool calls and no error stand for those two. */
const WHEN_LEFT_OUT = {
  response: "This is a mock response.",
  streamDelay: 0,
  chunkSize: 1,
  usage: { inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0, maxTokens: 1_000 },
} as const;

/** The ids every answer carries: there is one model here and it gives one answer. */
const RESPONSE_ID = "mock-response-id";
const MODEL_ID = "mock-model";
const MESSAGE_ID = "mock-message-id";

function filled(asked: MockPromptExecutorOptions | undefined): FilledOptions {
  const count = (name: keyof Usage): number => asked?.usage?.[name] ?? WHEN_LEFT_OUT.usage[name];
  return {
    response: asked?.response ?? WHEN_LEFT_OUT.response,
    toolCalls: asked?.toolCalls ?? [],
    streamDelay: asked?.streamDelay ?? WHEN_LEFT_OUT.streamDelay,
    chunkSize: asked?.chunkSize ?? WHEN_LEFT_OUT.chunkSize,
    usage: {
      inputTokens: count("inputTokens"),
      outputTokens: count("outputTokens"),
      cacheReadTokens: count("cacheReadTokens"),
      cacheWriteTokens: count("cacheWriteTokens"),
      maxTokens: count("maxTokens"),
    },
    simulateError: asked?.simulateError,
  };
}

/**
 * A text cut into pieces of `size`, the last one shorter. The pieces are
 * made one at a time, as they are asked for: with a size of zero they never
 * end, and whoever reads them has to stop.
 */
function* piecesOf(text: string, size: number): Generator<string> {
  for (let at = 0; at < text.length; at += size) {
    yield text.slice(at, at + size);
  }
}

const pause = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** The usage as a stream reports it: what went in, what came out, and both together. */
function totals(usage: Usage): { promptTokens: number; completionTokens: number; totalTokens: number } {
  return {
    promptTokens: usage.inputTokens,
    completionTokens: usage.outputTokens,
    totalTokens: usage.inputTokens + usage.outputTokens,
  };
}

/** An executor whose options are asked for again at each stream, so a script can give one answer after another. */
export function createMockPromptExecutor(options: () => MockPromptExecutorOptions): MockPromptExecutor {
  return new MockPromptExecutor(() => options(), undefined);
}

export class MockPromptBuilder extends BasePromptBuilder<Loose> {}

export class MockPromptExecutor extends BasePromptExecutor<Loose> {
  /** The options as they stand now, everything filled in. A stream asks for them once, when it is made. */
  readonly options: () => FilledOptions;

  constructor(options?: () => MockPromptExecutorOptions | undefined, initialMessages?: Loose | readonly Loose[]) {
    super(new MockPromptBuilder(initialMessages));
    this.options = () => filled(options?.());
  }

  /**
   * The answer as a stream and as promises. The stream sends the words in
   * pieces, then each tool call (its start, its arguments in pieces, the
   * call whole), then either the error it was told to fail with, which it
   * also throws, or a last piece that says it finished. The promises are
   * settled at once, whether or not the stream is read.
   */
  stream(_ctx: unknown, invocationId?: string, _tools?: readonly Loose[], _options?: Loose) {
    const { response: words, toolCalls, chunkSize, streamDelay, simulateError, usage } = this.options();

    const fullStream = (async function* (): AsyncGenerator<Loose> {
      if (words) {
        for (const piece of piecesOf(words, chunkSize)) {
          if (streamDelay > 0) await pause(streamDelay);
          yield { type: "text-delta", textDelta: piece };
        }
      }
      for (const call of toolCalls) {
        if (streamDelay > 0) await pause(streamDelay);
        yield { type: "tool-call-streaming-start", toolCallId: call.toolCallId, toolName: call.toolName };
        for (const piece of piecesOf(JSON.stringify(call.args), chunkSize)) {
          if (streamDelay > 0) await pause(streamDelay);
          yield { type: "tool-call-delta", toolCallId: call.toolCallId, toolName: call.toolName, argsTextDelta: piece };
        }
        if (streamDelay > 0) await pause(streamDelay);
        yield { type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, args: call.args };
      }
      if (simulateError) {
        yield { type: "error", error: simulateError };
        throw simulateError;
      }
      yield {
        type: "finish",
        finishReason: "stop",
        usage: totals(usage),
        logprobs: undefined,
        response: { id: RESPONSE_ID, timestamp: new Date(), modelId: MODEL_ID },
      };
    })();

    // The whole answer as one message. When told to fail, only the first piece of the words is in it.
    const response = (async (): Promise<Loose> => {
      const content: Loose[] = [];
      if (words) {
        content.push({ type: "text", text: simulateError ? words.slice(0, chunkSize) : words });
      }
      for (const call of toolCalls) {
        content.push({ type: "tool-call", toolCallId: call.toolCallId, toolName: call.toolName, args: call.args });
      }
      const answer: Loose = {
        id: RESPONSE_ID,
        timestamp: new Date(),
        modelId: MODEL_ID,
        messages: [{ role: "assistant", content: content.length > 0 ? content : "", id: MESSAGE_ID }],
      };
      if (simulateError) answer.error = simulateError;
      return answer;
    })();

    return {
      fullStream,
      response,
      usage: Promise.resolve(totals(usage)),
      extendedUsage: Promise.resolve({
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        maxTokens: usage.maxTokens,
      }),
      providerMetadata: Promise.resolve(undefined),
      invocationId: Promise.resolve(invocationId ?? crypto.randomUUID()),
    };
  }
}
