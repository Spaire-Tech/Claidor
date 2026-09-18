/**
 * The box is reached through the Caisra server, never directly.
 *
 * The E2B credential is Claidor's and must not ship inside an Electron app, so
 * this client speaks only to our own broker and presents the desktop access
 * token. Nothing here knows what a sandbox provider is.
 *
 * Every method is one HTTP round trip. That is deliberate and it is the unit
 * the latency measurement in `docs/product/agent-computer-plan.md` counts: the
 * engine does not pipeline, so cost is round trips times RTT.
 */
import type { BoxBrokerSettings } from './backendSpec';

export type BoxState = {
  boxId: string;
  running: boolean;
  template?: string;
  createdAtMs?: number;
  lastUsedAtMs?: number;
  /**
   * Where this box's template keeps the agent's files. The broker started the
   * template, so it is the one that knows; absent, the plugin's defaults apply.
   */
  workspaceDir?: string;
  agentWorkspaceDir?: string;
};

export type BoxShellResult = {
  stdout: Buffer;
  stderr: Buffer;
  code: number;
};

/** A machine in the registry: the box, plus the person's own registered machines. */
export type BoxMachine = {
  id: string;
  kind: 'box' | 'machine';
  label: string;
  state: 'running' | 'stopped' | 'unknown';
  template?: string;
  createdAtMs?: number;
};

export type BoxBrokerConfig = BoxBrokerSettings;

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

export class BoxBrokerError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BoxBrokerError';
    this.status = status;
  }
}

/** Strip the trailing slash so path joins do not double up. */
export function normalizeBrokerBaseUrl(raw: string): string {
  const trimmed = String(raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('Box broker base URL is empty.');
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Box broker base URL must be http or https: ${trimmed}`);
  }
  return trimmed;
}

export class BoxBrokerClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly timeoutMs: number;
  readonly template?: string;

  constructor(config: BoxBrokerConfig, private readonly fetchImpl: typeof fetch = fetch) {
    this.baseUrl = normalizeBrokerBaseUrl(config.brokerBaseUrl);
    this.accessToken = String(config.accessToken ?? '').trim();
    if (!this.accessToken) {
      throw new Error('Box broker access token is empty.');
    }
    this.template = config.template?.trim() || undefined;
    this.timeoutMs = config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  /**
   * Ensure a box exists for this scope and return it. The broker is the one
   * that decides whether to reuse a running box or start a new one — the engine
   * asks for a scope, not for a machine.
   */
  async ensureBox(scopeKey: string): Promise<BoxState> {
    return await this.json<BoxState>('POST', '/api/box/sandboxes', {
      scopeKey,
      template: this.template,
    });
  }

  async describeBox(boxId: string): Promise<BoxState> {
    return await this.json<BoxState>('GET', `/api/box/sandboxes/${encodeURIComponent(boxId)}`);
  }

  /** Reset: the box is destroyed. E2B bills by the second, so this must really kill it. */
  async removeBox(boxId: string): Promise<void> {
    await this.json<unknown>('DELETE', `/api/box/sandboxes/${encodeURIComponent(boxId)}`, undefined, {
      allowNotFound: true,
    });
  }

  /** The registry: this box plus the person's registered machines. */
  async listMachines(): Promise<BoxMachine[]> {
    const result = await this.json<{ machines?: BoxMachine[] }>('GET', '/api/box/machines');
    return Array.isArray(result?.machines) ? result.machines : [];
  }

  /**
   * One shell script in the box, run to completion. This is the primitive the
   * remote fs bridge builds every file operation out of.
   */
  async runShell(
    boxId: string,
    params: {
      script: string;
      args?: string[];
      stdin?: Buffer | string;
      allowFailure?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<BoxShellResult> {
    const stdin = params.stdin === undefined
      ? undefined
      : (Buffer.isBuffer(params.stdin) ? params.stdin : Buffer.from(params.stdin)).toString('base64');
    const payload = await this.json<{
      stdoutBase64?: string;
      stderrBase64?: string;
      exitCode?: number;
    }>('POST', `/api/box/sandboxes/${encodeURIComponent(boxId)}/shell`, {
      script: params.script,
      args: params.args ?? [],
      stdinBase64: stdin,
    }, { signal: params.signal });

    const result: BoxShellResult = {
      stdout: Buffer.from(payload.stdoutBase64 ?? '', 'base64'),
      stderr: Buffer.from(payload.stderrBase64 ?? '', 'base64'),
      code: Number.isInteger(payload.exitCode) ? (payload.exitCode as number) : 0,
    };
    if (result.code !== 0 && !params.allowFailure) {
      const detail = result.stderr.toString('utf8').trim() || `shell exited ${result.code}`;
      throw new Error(detail);
    }
    return result;
  }

  /**
   * Import: put one of the person's files into the box.
   *
   * This is the ONLY way a file from the person's machine gets into the box —
   * a deliberate copy, never ambient. The engine's own remote backend uploads
   * the whole workspace on first use; the box backend does not, and that is the
   * difference file custody makes.
   */
  async putFile(boxId: string, boxPath: string, data: Buffer): Promise<void> {
    await this.json<unknown>('PUT', `/api/box/sandboxes/${encodeURIComponent(boxId)}/file`, {
      path: boxPath,
      contentBase64: data.toString('base64'),
    });
  }

  /** Export: take a file back out of the box onto the person's machine. */
  async getFile(boxId: string, boxPath: string): Promise<Buffer> {
    const payload = await this.json<{ contentBase64?: string }>(
      'GET',
      `/api/box/sandboxes/${encodeURIComponent(boxId)}/file?path=${encodeURIComponent(boxPath)}`,
    );
    return Buffer.from(payload.contentBase64 ?? '', 'base64');
  }

  private async json<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { signal?: AbortSignal; allowNotFound?: boolean },
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onOuterAbort = () => controller.abort();
    options?.signal?.addEventListener('abort', onOuterAbort);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.status === 404 && options?.allowNotFound) {
        return undefined as T;
      }
      if (!response.ok) {
        throw new BoxBrokerError(
          `Box broker ${method} ${path} failed: ${response.status} ${await safeText(response)}`,
          response.status,
        );
      }
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', onOuterAbort);
    }
  }
}

async function safeText(response: { text(): Promise<string> }): Promise<string> {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}
