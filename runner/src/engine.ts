import { type ChildProcess, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';

import { buildExecApprovals, GATEWAY_TOKEN_ENV, JOB_TOKEN_ENV } from './engineConfig.js';
import { log, reasonOf } from './log.js';

/**
 * Starting the engine and asking it one thing.
 *
 * This is the small version of the desktop's
 * `openclawEngineManager.ts`: write a config, start the gateway, send one
 * instruction, collect the answer, stop. There is no supervision, no
 * restart ladder and no reconnection, because a cloud job that loses its
 * engine is a failed job that goes back to the queue.
 */

export interface EngineStartOptions {
  /** The directory holding openclaw.mjs. */
  engineRoot: string;
  /** The job's own directory: the config, the engine's home, the workspace. */
  jobDir: string;
  /** The config object to write. */
  config: Record<string, unknown>;
  /** The person's token, handed to the engine through its environment. */
  jobToken: string;
  /** How long to wait for the gateway to answer its health check. */
  startTimeoutMs: number;
}

export interface EngineAnswer {
  text: string;
  usage: Record<string, unknown>;
}

export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

/** A port nobody is using, asked of the operating system. */
export const freePort = async (): Promise<number> =>
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => reject(new EngineError('The operating system gave no port.')));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export class Engine {
  private readonly port: number;
  private readonly gatewayToken: string;
  private readonly child: ChildProcess;
  private readonly output: string[] = [];
  private exited = false;

  private constructor(port: number, gatewayToken: string, child: ChildProcess) {
    this.port = port;
    this.gatewayToken = gatewayToken;
    this.child = child;
    child.once('exit', () => {
      this.exited = true;
    });
    // A process that never started at all — a missing engine, an
    // unreadable directory — emits this and no exit, so without it the
    // start would wait out its whole timeout before saying so.
    child.once('error', (error) => {
      this.exited = true;
      this.output.push(`the engine process could not start: ${reasonOf(error)}`);
    });
    const keep = (chunk: Buffer): void => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        this.output.push(line);
        if (this.output.length > 200) this.output.shift();
      }
    };
    child.stdout?.on('data', keep);
    child.stderr?.on('data', keep);
  }

  static async start(options: EngineStartOptions): Promise<Engine> {
    const configPath = path.join(options.jobDir, 'openclaw.json');
    const home = path.join(options.jobDir, 'engine');
    const state = path.join(home, 'state');
    await fs.mkdir(state, { recursive: true });
    await fs.mkdir(path.join(home, '.openclaw'), { recursive: true });
    await fs.writeFile(configPath, `${JSON.stringify(options.config, null, 2)}\n`, 'utf8');
    // The host-local half of the exec policy, written deny-first. See
    // engineConfig.ts for why it is the reverse of the desktop's.
    await fs.writeFile(
      path.join(home, '.openclaw', 'exec-approvals.json'),
      `${JSON.stringify(buildExecApprovals(), null, 2)}\n`,
      'utf8',
    );

    const port = await freePort();
    const gatewayToken = crypto.randomBytes(32).toString('base64url');
    const entry = path.join(options.engineRoot, 'openclaw.mjs');

    // The engine's environment is built from nothing, not inherited. The
    // runner's own token, Claidor's queue address and everything else this
    // process holds stay out of the child: it gets the person's token, its
    // own gateway token, and the paths it needs.
    const env: NodeJS.ProcessEnv = {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: home,
      TMPDIR: path.join(options.jobDir, 'tmp'),
      TZ: process.env.TZ ?? 'UTC',
      NODE_ENV: 'production',
      OPENCLAW_HOME: home,
      OPENCLAW_STATE_DIR: state,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_NO_RESPAWN: '1',
      // A loopback gateway in a container has nothing to advertise, and the
      // watchdog is noisy.
      OPENCLAW_DISABLE_BONJOUR: '1',
      [GATEWAY_TOKEN_ENV]: gatewayToken,
      [JOB_TOKEN_ENV]: options.jobToken,
    };
    await fs.mkdir(env.TMPDIR as string, { recursive: true });

    const child = spawn(process.execPath, [entry, 'gateway', '--bind', 'loopback', '--port', String(port), '--token', gatewayToken], {
      cwd: options.engineRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const engine = new Engine(port, gatewayToken, child);
    try {
      await engine.waitUntilReady(options.startTimeoutMs);
    } catch (error) {
      await engine.stop();
      throw error;
    }
    return engine;
  }

  get url(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /** The last lines the engine printed, for a failure report. */
  recentOutput(lines = 20): string {
    return this.output.slice(-lines).join('\n');
  }

  private async waitUntilReady(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.exited) {
        throw new EngineError(`The engine stopped before it was ready.\n${this.recentOutput()}`);
      }
      if (await this.healthy()) {
        log.info(`the engine is ready on loopback:${this.port}`);
        return;
      }
      await sleep(500);
    }
    throw new EngineError(`The engine was not ready within ${Math.round(timeoutMs / 1000)}s.\n${this.recentOutput()}`);
  }

  private async healthy(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2_000);
      try {
        const response = await fetch(`${this.url}/health`, { signal: controller.signal });
        return response.ok;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return false;
    }
  }

  /**
   * One instruction in, one answer out. The gateway runs it as a normal
   * agent turn, with the tool policy and the workspace this job's config
   * set, so the answer is the whole result of the work.
   */
  async ask(instruction: string, timeoutMs: number): Promise<EngineAnswer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${this.url}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.gatewayToken}`,
          'content-type': 'application/json',
        },
        // "openclaw" is the engine's own name for "the configured agent",
        // not a model name: which model runs is decided by the config.
        body: JSON.stringify({ model: 'openclaw', messages: [{ role: 'user', content: instruction }] }),
        signal: controller.signal,
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new EngineError(`The engine refused the instruction (${response.status}): ${raw.slice(0, 500)}`);
      }
      return readAnswer(raw);
    } catch (error) {
      if (error instanceof EngineError) throw error;
      throw new EngineError(`The engine did not answer: ${reasonOf(error)}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Ask it to stop, then insist, and give up waiting rather than hold the
   * runner: the job is over either way, and a process that will not die is
   * a worse thing to wait for than to report.
   */
  async stop(graceMs = 10_000): Promise<void> {
    if (this.exited) return;
    const ended = new Promise<void>((resolve) => {
      this.child.once('exit', () => resolve());
      this.child.once('error', () => resolve());
    });
    try {
      this.child.kill('SIGTERM');
    } catch {
      return;
    }
    const insist = setTimeout(() => {
      try {
        this.child.kill('SIGKILL');
      } catch {
        // Already gone.
      }
    }, graceMs);
    const gaveUp = new Promise<void>((resolve) => setTimeout(resolve, graceMs * 2).unref());
    try {
      await Promise.race([ended, gaveUp]);
    } finally {
      clearTimeout(insist);
    }
    if (!this.exited) {
      log.warn(`the engine (pid ${this.child.pid ?? 'unknown'}) did not stop when asked`);
    }
  }
}

/** The answer, out of the engine's OpenAI-shaped reply. */
export const readAnswer = (raw: string): EngineAnswer => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EngineError('The engine answered something that is not JSON.');
  }
  const body = parsed as { choices?: { message?: { content?: unknown } }[]; usage?: unknown };
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new EngineError('The engine answered with no text.');
  }
  const usage = body.usage;
  return {
    text: content,
    usage: usage !== null && typeof usage === 'object' ? (usage as Record<string, unknown>) : {},
  };
};
