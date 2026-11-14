/**
 * Tells from a provider's sentence whether a call failed because too much
 * went in, or because the answer ran past what the model may write.
 * Providers word this in many ways and send no code to rely on, so the
 * sentences seen so far are kept here, in small letters, piece by piece.
 */
import { InputTokenLimitError, OutputTokensLimitExceededError } from "./prompt-executor.js";

/** The one wording of "the answer ran past what the model may write". */
const TOO_MUCH_OUT = "exceeded max output tokens";

/**
 * The message of our own InputTokenLimitError. A sentence that holds it is
 * sorted as too much input, though it is not one of the providers' wordings.
 */
const OUR_OWN_TOO_MUCH_IN = "input token limit exceeded";

/**
 * The providers' wordings of "too much went in". A sentence is one of them
 * when it holds every piece of a row, wherever in the sentence each is.
 */
const TOO_MUCH_IN: readonly (readonly string[])[] = [
  ["input tokens exceed the configured limit", "your messages resulted in", "tokens"],
  ["input token count", "exceeds the maximum number of tokens allowed"],
  ["input token count", "exceeds", "maximum context length"],
  ["maximum prompt length", "request contains", "tokens"],
  ["prompt is too long"],
  ["input", "token", "longer than", "context length"],
  ["input token count", "plus", "requested output count", "exceeds", "maximum context length"],
  ["input exceeds", "context window"],
  ["input is too long for requested model"],
  ["input length", "exceeds the maximum allowed input length"],
  ["request size cannot exceed", "bytes", "please shorten the request"],
  ["input length", "max_tokens", "exceed context limit"],
  ["input is too long"],
  ["request size exceeds model context window"],
  ["message size", "bytes", "exceeds", "mb limit"],
  ["context_length_exceeded"],
  ["payload too large"],
];

/** One more wording, whose number changes from call to call: "max tokens of 128000 exceeded". */
const COUNT_EXCEEDED = /max tokens of \d+ exceeded/;

/** Whether a sentence, whatever its capitals, is one of the providers' wordings of too much input. */
export function isInputTokenLimitErrorMessage(errorMessage: string): boolean {
  const small = errorMessage.toLowerCase();
  const known = TOO_MUCH_IN.some((pieces) => pieces.every((piece) => small.includes(piece)));
  return known || COUNT_EXCEEDED.test(small);
}

/** Whether a sentence, whatever its capitals, says the answer ran past what the model may write. */
export function isOutputTokenLimitErrorMessage(errorMessage: string): boolean {
  return errorMessage.toLowerCase().includes(TOO_MUCH_OUT);
}

/**
 * The error a sentence stands for, carrying the sentence as it came, or
 * nothing when the sentence is about neither limit. Too much output is
 * looked for first: a sentence that tells of both is sorted as that.
 */
export function classifyTokenLimitErrorFromMessage(errorMessage: string): Error | undefined {
  if (isOutputTokenLimitErrorMessage(errorMessage)) {
    return new OutputTokensLimitExceededError(errorMessage);
  }
  if (isInputTokenLimitErrorMessage(errorMessage) || errorMessage.toLowerCase().includes(OUR_OWN_TOO_MUCH_IN)) {
    return new InputTokenLimitError(errorMessage);
  }
  return undefined;
}
