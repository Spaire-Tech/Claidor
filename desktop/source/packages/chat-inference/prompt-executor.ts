/**
 * What a tool hands back to the model, and the three errors that say a limit
 * of the model was reached. The rest of the engine tells these errors apart
 * by their class and by their name, so each one sets its name on itself.
 */

/** A tool's answer in words. */
export interface TextResult {
  content: Array<{ type: "text"; text: string }>;
  isError: boolean;
}

/** A tool's answer that holds a picture, with or without words before it. */
export interface ImageResult {
  content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }>;
  isError: boolean;
}

/** Words as a tool's answer. `isError` says the words tell of a failure. */
export function createStringResult(content: string, isError = false): TextResult {
  return { content: [{ type: "text", text: content }], isError };
}

/**
 * A picture as a tool's answer, given as its data and its kind. Words, when
 * there are any, come before the picture.
 */
export function createImageResult(imageData: string, mimeType: string, textContent?: string, isError = false): ImageResult {
  const picture = { type: "image" as const, data: imageData, mimeType };
  if (!textContent) return { content: [picture], isError };
  return { content: [{ type: "text", text: textContent }, picture], isError };
}

/** The model stopped because its answer reached the most it may write. */
export class OutputTokensLimitExceededError extends Error {
  constructor(message = "Provider exceeded max output tokens") {
    super(message);
    this.name = "OutputTokensLimitExceededError";
  }
}

/** The prompt was larger than the model takes. The engine answers it by summarizing the conversation. */
export class InputTokenLimitError extends Error {
  constructor(message = "Input token limit exceeded") {
    super(message);
    this.name = "InputTokenLimitError";
  }
}

/** The prompt reached the size at which the engine is set to summarize, before the model refused anything. */
export class ProactiveSummarizationThresholdError extends Error {
  constructor(message = "Configured summarization threshold reached") {
    super(message);
    this.name = "ProactiveSummarizationThresholdError";
  }
}
