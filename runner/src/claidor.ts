import type { MemoryFile, OutgoingMemoryFile } from './memory.js';

/**
 * The two ways the runner talks to Claidor.
 *
 * The queue is spoken with the service's own token, which belongs to no
 * person. Everything about a person — their memory, their model calls — is
 * spoken with the short-lived token Claidor mints when the job is claimed,
 * which dies with the lease. The two never mix: a `PersonClient` is handed
 * the job token and nothing else, and the engine's environment never
 * carries the runner's token at all.
 */

/** The three reasons a job exists, as Claidor names them. */
export const JOB_KINDS = ['routine', 'mail', 'task'] as const;

/**
 * One message of a conversation the job continues (a cloud agent's turn,
 * 25 September 2026). The person's messages and the earlier turns'
 * replies, in order; the runner answers the whole list, not `prompt`
 * alone, when it is present.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** What a run says back, beyond its one answer: the turn's replies. */
export interface TurnMessage {
  role?: 'user' | 'assistant';
  text: string;
}

/** A file the executor left in the run's workspace. None today. */
export interface TurnArtifact {
  path: string;
  sizeBytes: number;
  updatedAtMs: number;
}

/** The runner as Claidor names it: the only executor that exists. */
export const MATY_RUNNER_EXECUTOR = 'maty-runner';

export interface Job {
  id: string;
  /** One of JOB_KINDS. The runner does the same thing with all three. */
  kind: string;
  prompt: string;
  /** Where Claidor should deliver the answer. The runner never delivers. */
  deliver?: unknown;
  /** What this routine's owner allowed it to do. */
  allow?: string[];
  /**
   * Which executor runs it. `maty-runner` (this process) unless Claidor
   * names another; see `executor.ts` for the seam.
   */
  executor: string;
  /** The conversation this job continues, when it is a cloud agent's turn. */
  conversation?: ConversationMessage[];
}

export interface ClaimedJob {
  job: Job;
  accessToken: string;
  expiresAt: string | null;
}

export interface JobUsage {
  [key: string]: unknown;
}

/** Where the job stands after a heartbeat, as Claidor answers it. */
export interface JobState {
  /** True once the person asked the job to stop. */
  cancelRequested: boolean;
}

export interface CompletionExtras {
  messages?: readonly TurnMessage[];
  artifacts?: readonly TurnArtifact[];
}

export class ClaidorError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClaidorError';
    this.status = status;
  }
}

const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const whole = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** What a refusal said, in as few words as it gave us. */
export const refusalOf = (raw: string): string => {
  try {
    const body = asRecord(JSON.parse(raw));
    const parts = [text(body.error), text(body.detail)].filter(Boolean);
    if (parts.length > 0) return parts.join(': ');
  } catch {
    // Not JSON; fall through to the raw text.
  }
  return raw.slice(0, 300) || '(no body)';
};

export interface HttpOptions {
  method: 'GET' | 'POST';
  path: string;
  token: string;
  body?: unknown;
  timeoutMs?: number;
}

/** One request, with a timeout, and a real error when the status says no. */
export const request = async (baseUrl: string, options: HttpOptions): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 60_000);
  try {
    const response = await fetch(`${baseUrl}${options.path}`, {
      method: options.method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        accept: 'application/json',
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) {
      // Claidor's refusals are `{error, detail}` with the reason in the
      // status: 404 no such job, 409 the lease is not ours or has run out,
      // 401 our service token is wrong, 422 a bad body.
      throw new ClaidorError(
        response.status,
        `${options.method} ${options.path} answered ${response.status}: ${refusalOf(raw)}`,
      );
    }
    if (!raw) return {};
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new ClaidorError(response.status, `${options.method} ${options.path} answered something that is not JSON.`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * The queue. Spoken with the service's own token and nothing else.
 *
 * Every call names the runner, including the three that address a job by
 * id: the lease belongs to a named runner, and Claidor answers 409 when the
 * name on the call is not the one holding it.
 */
export class RunnerQueue {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly runner: string;

  constructor(baseUrl: string, token: string, runner: string) {
    this.baseUrl = baseUrl;
    this.token = token;
    this.runner = runner;
  }

  /** Ask for work. Null when there is none. */
  async claim(): Promise<ClaimedJob | null> {
    const answer = asRecord(
      await request(this.baseUrl, {
        method: 'POST',
        path: '/maty/runner/claim',
        token: this.token,
        body: { runner: this.runner },
      }),
    );
    const job = answer.job;
    if (job === null || job === undefined) return null;

    const fields = asRecord(job);
    const id = text(fields.id);
    const prompt = text(fields.prompt);
    if (!id || !prompt) {
      throw new ClaidorError(200, 'Claidor handed out a job with no id or no instruction.');
    }
    const accessToken = text(answer.access_token);
    if (!accessToken) {
      throw new ClaidorError(200, `Claidor handed out job ${id} with no access token for the person.`);
    }
    const conversation = Array.isArray(fields.conversation)
      ? fields.conversation
          .map((row) => asRecord(row))
          .filter((row) => typeof row.text === 'string')
          .map((row): ConversationMessage => ({ role: row.role === 'user' ? 'user' : 'assistant', text: row.text as string }))
      : undefined;
    return {
      job: {
        id,
        kind: text(fields.kind) || 'unknown',
        prompt,
        deliver: fields.deliver,
        allow: Array.isArray(fields.allow) ? fields.allow.filter((one): one is string => typeof one === 'string') : [],
        executor: text(fields.executor) || MATY_RUNNER_EXECUTOR,
        ...(conversation === undefined || conversation.length === 0 ? {} : { conversation }),
      },
      accessToken,
      expiresAt: text(answer.expires_at) || null,
    };
  }

  /**
   * Still going. A runner that dies stops sending this and the lease
   * lapses, and the job goes back to the queue. The same beat extends the
   * person's token, which dies with the lease — so a job whose heartbeat
   * stops arriving loses its own model calls before anything else.
   *
   * The answer says whether the person has since asked the job to stop
   * (`cancel_requested`, 25 September 2026); the loop reads it and fails
   * the job as cancelled.
   */
  async heartbeat(jobId: string): Promise<JobState> {
    const answer = asRecord(
      await request(this.baseUrl, {
        method: 'POST',
        path: `/maty/runner/jobs/${encodeURIComponent(jobId)}/heartbeat`,
        token: this.token,
        body: { runner: this.runner },
        timeoutMs: 20_000,
      }),
    );
    return { cancelRequested: answer.cancel_requested === true };
  }

  async complete(jobId: string, result: string, usage: JobUsage, extras: CompletionExtras = {}): Promise<void> {
    await request(this.baseUrl, {
      method: 'POST',
      path: `/maty/runner/jobs/${encodeURIComponent(jobId)}/complete`,
      token: this.token,
      body: {
        runner: this.runner,
        result,
        usage,
        ...(extras.messages === undefined ? {} : { messages: extras.messages }),
        ...(extras.artifacts === undefined ? {} : { artifacts: extras.artifacts }),
      },
    });
  }

  async fail(jobId: string, reason: string, retryable: boolean): Promise<void> {
    await request(this.baseUrl, {
      method: 'POST',
      path: `/maty/runner/jobs/${encodeURIComponent(jobId)}/fail`,
      token: this.token,
      body: { runner: this.runner, reason, retryable },
    });
  }
}

export interface AvailableModel {
  id: string;
  contextWindow: number;
  maxTokens: number;
}

/** Everything about one person, spoken with that person's job token. */
export class PersonClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  /**
   * One round of the shared memory. Sending nothing asks for everything
   * Claidor holds, which is what a fresh job directory needs.
   */
  async syncMemory(files: readonly OutgoingMemoryFile[]): Promise<MemoryFile[]> {
    const answer = asRecord(
      await request(this.baseUrl, {
        method: 'POST',
        path: '/desktop/api/memory/sync',
        token: this.token,
        body: { files },
      }),
    );
    const rows = Array.isArray(answer.files) ? answer.files : [];
    return rows.map((row) => {
      const file = asRecord(row);
      return {
        name: text(file.name),
        content: text(file.content),
        version: whole(file.version, 0),
      };
    });
  }

  /**
   * The models this person may use. The runner takes the first one rather
   * than naming a model anywhere in its own code: which models exist is
   * Claidor's to decide and ours to follow.
   */
  async models(): Promise<AvailableModel[]> {
    const answer = asRecord(
      await request(this.baseUrl, {
        method: 'GET',
        path: '/desktop/api/models/available',
        token: this.token,
      }),
    );
    const rows = Array.isArray(answer.data) ? answer.data : [];
    return rows
      .map((row) => {
        const model = asRecord(row);
        return {
          id: text(model.modelId),
          contextWindow: whole(model.contextWindow, 200_000),
          maxTokens: whole(model.maxTokens, 8_192),
          accessible: model.accessible !== false,
        };
      })
      .filter((model) => model.id && model.accessible)
      .map(({ id, contextWindow, maxTokens }) => ({ id, contextWindow, maxTokens }));
  }
}
