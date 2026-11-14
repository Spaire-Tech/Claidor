/**
 * What every way of asking a model is built from: the list of messages a
 * prompt is made of, an executor that keeps such a list, and a wrapper that
 * stands in front of another executor and passes every call on. A wrapper
 * that changes something extends the plain one and overrides only that.
 */

export interface PromptMessage {
  role: string;
  content: string | readonly unknown[];
}

/**
 * The messages of a prompt, in order. What it hands out is a copy of its
 * list each time, holding the very messages it was given.
 */
export class BasePromptBuilder<TMessage = PromptMessage> {
  /** The list itself. Builders of other parts read and write it under this name. */
  protected messages: TMessage[] = [];

  /** Starts with nothing, with one message, or with a copy of a list of them. */
  constructor(initialMessages?: TMessage | readonly TMessage[]) {
    if (initialMessages === undefined) return;
    this.messages = Array.isArray(initialMessages) ? [...initialMessages] : [initialMessages as TMessage];
  }

  /** Adds one message, or each message of a list, at the end. */
  appendMessages(newMessages: TMessage | readonly TMessage[]): this {
    if (Array.isArray(newMessages)) {
      this.messages.push(...newMessages);
    } else {
      this.messages.push(newMessages as TMessage);
    }
    return this;
  }

  /** The state of a builder is its messages. */
  getState(): TMessage[] {
    return [...this.messages];
  }

  getMessages(): TMessage[] {
    return [...this.messages];
  }

  clearMessages(): void {
    this.messages = [];
  }
}

/** An executor that keeps its messages in a builder. What asks the model is added by the class that extends it. */
export class BasePromptExecutor<TMessage = PromptMessage> {
  /** Executors of other parts reach their builder under this name. */
  protected readonly builder: BasePromptBuilder<TMessage>;

  constructor(builder: BasePromptBuilder<TMessage>) {
    this.builder = builder;
  }

  appendMessages(messages: TMessage | readonly TMessage[]): this {
    this.builder.appendMessages(messages);
    return this;
  }

  getState(): TMessage[] {
    return this.builder.getState();
  }

  getMessages(): TMessage[] {
    return this.builder.getMessages();
  }

  clearMessages(): void {
    this.builder.clearMessages();
  }
}

/** What the engine needs of anything it hands a prompt to. */
export interface PromptExecutor<TMessage = PromptMessage> {
  appendMessages(messages: TMessage | readonly TMessage[]): unknown;
  getState(): unknown;
  getMessages(): TMessage[];
  clearMessages(): void;
  stream(...args: readonly unknown[]): unknown;
}

/**
 * An executor in front of another one. As it is, it changes nothing: every
 * call goes to the executor below, a stream with all of its arguments.
 */
export class BaseMiddleware<TMessage = PromptMessage> implements PromptExecutor<TMessage> {
  /** Wrappers of other parts reach the executor below under this name. */
  protected readonly innerExecutor: PromptExecutor<TMessage>;

  constructor(innerExecutor: PromptExecutor<TMessage>) {
    this.innerExecutor = innerExecutor;
  }

  appendMessages(messages: TMessage | readonly TMessage[]): this {
    this.innerExecutor.appendMessages(messages);
    return this;
  }

  getState(): unknown {
    return this.innerExecutor.getState();
  }

  getMessages(): TMessage[] {
    return this.innerExecutor.getMessages();
  }

  clearMessages(): void {
    this.innerExecutor.clearMessages();
  }

  stream(...args: readonly unknown[]): unknown {
    return this.innerExecutor.stream(...args);
  }
}
