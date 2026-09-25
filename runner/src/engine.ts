import fs from 'node:fs/promises';
import path from 'node:path';

import { log, reasonOf } from './log.js';
import { isMemoryName } from './memory.js';

/**
 * The runner's model call, spoken straight to Claidor's metered proxy
 * (25 September 2026).
 *
 * Until then this file started the OpenClaw gateway that the LobsterAI-era
 * desktop app shipped, and the image built that engine from source with
 * the desktop's patches (`desktop/scripts/patches`). Those patches, the
 * script that applied them and the desktop's pin left the repository with
 * the 18 September re-founding, so the image could not be built from the
 * tree at all, and the product's own agent loop no longer runs on that
 * engine anyway. What a cloud job actually does today is one model turn
 * over the person's memory and the conversation, with no tools; that is a
 * request to the proxy on the person's job token, the same door the
 * desktop's executor uses, so this is now that request and nothing else.
 *
 * The memory the queue lays out in the workspace is read into the system
 * prompt (the workspace instructions first, then every memory file). The
 * model has no way to write files, so `collectMemoryChanges` in job.ts
 * finds nothing; memory written by a cloud turn is a follow-up
 * (`docs/product/cloud-agents-served.md`).
 */

export interface EngineModel {
  id: string;
  /** Which wire the proxy takes for this model: `openai-responses`, `openai-completions` or `anthropic-messages`. */
  transportApi: string;
  maxTokens: number;
}

export interface EngineStartOptions {
  /** The proxy's base, `${apiBaseUrl}/desktop/api/proxy`. */
  modelProxyBaseUrl: string;
  model: EngineModel;
  /** The person's job token, the bearer on every call. */
  jobToken: string;
  /** The job's workspace: the instructions and the memory files laid out there. */
  workspace: string;
  fetchImpl?: typeof fetch;
}

export interface EngineAnswer {
  text: string;
  usage: Record<string, unknown>;
}

/** One message of the conversation. */
export interface EngineMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

/**
 * The person asked the job to stop while it ran (the cancel flag on the
 * heartbeat's answer). Final, never retried: the queue records it as
 * cancelled and a cloud agent shows it as such.
 */
export class JobCancelled extends Error {
  constructor() {
    super('Cancelled by the person while it ran.');
    this.name = 'JobCancelled';
  }
}

/** The instructions file the queue writes into the workspace. */
export const INSTRUCTIONS_FILE = 'AGENTS.md';

/**
 * The system prompt: the workspace instructions, then every memory file
 * under its name, so the model reads what the person's computer would have
 * read from disk.
 */
export const buildSystemPrompt = async (workspace: string): Promise<string> => {
  const parts: string[] = [];
  const instructions = await fs.readFile(path.join(workspace, INSTRUCTIONS_FILE), 'utf8').catch(() => '');
  if (instructions.trim()) parts.push(instructions.trim());
  const names: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), relative);
      else if (isMemoryName(relative)) names.push(relative);
    }
  };
  await walk(workspace, '');
  names.sort();
  for (const name of names) {
    const content = (await fs.readFile(path.join(workspace, name), 'utf8')).trim();
    if (content) parts.push(`## ${name}\n\n${content}`);
  }
  return parts.join('\n\n');
};

export class Engine {
  private readonly options: EngineStartOptions;
  private readonly system: string;

  private constructor(options: EngineStartOptions, system: string) {
    this.options = options;
    this.system = system;
  }

  /** Reads the workspace once; nothing is started, there is no process. */
  static async start(options: EngineStartOptions): Promise<Engine> {
    const system = await buildSystemPrompt(options.workspace);
    log.info(`model ${options.model.id} on ${options.model.transportApi}; system prompt ${system.length} chars`);
    return new Engine(options, system);
  }

  /**
   * One instruction in, one answer out. A conversation (a cloud agent's
   * turn continuing earlier ones) is passed as the messages it is; a string
   * is one user message. `signal` is the person asking the job to stop:
   * the call is abandoned and the error names the cancellation.
   */
  async ask(instruction: string | readonly EngineMessage[], timeoutMs: number, signal?: AbortSignal): Promise<EngineAnswer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const onCancel = (): void => controller.abort();
    if (signal?.aborted) throw new JobCancelled();
    signal?.addEventListener('abort', onCancel, { once: true });
    const messages: EngineMessage[] = typeof instruction === 'string' ? [{ role: 'user', content: instruction }] : [...instruction];
    const { path: route, body } = buildRequest(this.options.model, this.system, messages);
    const fetchImpl = this.options.fetchImpl ?? fetch;
    try {
      const response = await fetchImpl(`${this.options.modelProxyBaseUrl}${route}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.jobToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new EngineError(`The model proxy refused the turn (${response.status}): ${raw.slice(0, 500)}`);
      }
      return readAnswer(raw, this.options.model.transportApi);
    } catch (error) {
      if (signal?.aborted) throw new JobCancelled();
      if (error instanceof EngineError) throw error;
      throw new EngineError(`The model proxy did not answer: ${reasonOf(error)}`);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onCancel);
    }
  }

  /** Nothing to stop: kept so job.ts reads the same on both sides of the change. */
  async stop(): Promise<void> {}
}

/** The request for the model's wire: the same three shapes the proxy serves. */
export const buildRequest = (model: EngineModel, system: string, messages: readonly EngineMessage[]): { path: string; body: Record<string, unknown> } => {
  switch (model.transportApi) {
    case 'anthropic-messages':
      return {
        path: '/v1/messages',
        body: {
          model: model.id,
          max_tokens: Math.min(model.maxTokens, 8_192),
          ...(system ? { system } : {}),
          messages: messages.map((message) => ({ role: message.role, content: message.content })),
        },
      };
    case 'openai-completions':
      return {
        path: '/v1/chat/completions',
        body: {
          model: model.id,
          messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages.map((message) => ({ role: message.role, content: message.content }))],
        },
      };
    default:
      return {
        path: '/v1/responses',
        body: {
          model: model.id,
          ...(system ? { instructions: system } : {}),
          input: messages.map((message) => ({ role: message.role, content: message.content })),
        },
      };
  }
};

/** The answer, out of whichever wire was spoken. */
export const readAnswer = (raw: string, transportApi: string): EngineAnswer => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EngineError('The model proxy answered something that is not JSON.');
  }
  const body = parsed as Record<string, unknown>;
  const usage = typeof body.usage === 'object' && body.usage !== null ? (body.usage as Record<string, unknown>) : {};
  let text: string | undefined;
  if (transportApi === 'anthropic-messages') {
    const content = Array.isArray(body.content) ? body.content : [];
    text = content
      .map((part) => (typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'text' ? String((part as { text?: unknown }).text ?? '') : ''))
      .join('');
  } else if (transportApi === 'openai-completions') {
    const choices = Array.isArray(body.choices) ? body.choices : [];
    const first = choices[0] as { message?: { content?: unknown } } | undefined;
    text = typeof first?.message?.content === 'string' ? first.message.content : undefined;
  } else {
    if (typeof body.output_text === 'string') text = body.output_text;
    else {
      const output = Array.isArray(body.output) ? body.output : [];
      text = output
        .filter((item) => typeof item === 'object' && item !== null && (item as { type?: unknown }).type === 'message')
        .flatMap((item) => (Array.isArray((item as { content?: unknown }).content) ? ((item as { content: unknown[] }).content) : []))
        .map((part) => (typeof part === 'object' && part !== null && (part as { type?: unknown }).type === 'output_text' ? String((part as { text?: unknown }).text ?? '') : ''))
        .join('');
    }
  }
  if (typeof text !== 'string' || !text.trim()) {
    throw new EngineError('The model answered with no text.');
  }
  return { text, usage };
};
