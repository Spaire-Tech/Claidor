import fs from 'node:fs/promises';
import path from 'node:path';

import type { ClaimedJob, TurnMessage } from './claidor.js';
import { PersonClient } from './claidor.js';
import { Engine } from './engine.js';
import type { EngineMessage } from './engine.js';
import { buildEngineConfig, buildWorkspaceInstructions } from './engineConfig.js';
import { collectMemoryChanges, isMemoryName, layOutMemory } from './memory.js';
import { log } from './log.js';
import type { RunnerSettings } from './settings.js';

/**
 * One job, start to finish.
 *
 * A fresh empty directory, the person's memory laid out in it, the engine
 * started against it, one instruction, the answer, the memory written back,
 * and the directory deleted — on the way out of a failure just as surely as
 * on the way out of a success. Nothing is carried from one job to the next.
 */

export interface JobResult {
  answer: string;
  usage: Record<string, unknown>;
  /** The turn's replies, for a job that carries a conversation. */
  messages?: TurnMessage[];
}

/**
 * What the engine is asked: the whole conversation when the job carries
 * one (a cloud agent's turn continues its earlier ones), the one prompt
 * otherwise.
 */
export const engineInput = (job: ClaimedJob['job']): string | EngineMessage[] =>
  job.conversation === undefined || job.conversation.length === 0
    ? job.prompt
    : job.conversation.map((message) => ({ role: message.role, content: message.text }));

export class NoModelAvailable extends Error {
  constructor() {
    super('Claidor offers this person no model, so there is nothing to run the work with.');
    this.name = 'NoModelAvailable';
  }
}

export const modelProxyUrl = (apiBaseUrl: string): string => `${apiBaseUrl}/desktop/api/proxy`;

export const runJob = async (claimed: ClaimedJob, settings: RunnerSettings, signal?: AbortSignal): Promise<JobResult> => {
  const jobDir = path.join(settings.workRoot, `job-${claimed.job.id}`);
  const workspace = path.join(jobDir, 'workspace');

  // A directory left over from a killed run is not reused: it is removed
  // and made again, empty.
  await fs.rm(jobDir, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });

  const person = new PersonClient(settings.apiBaseUrl, claimed.accessToken);
  let engine: Engine | null = null;
  try {
    // Sending nothing asks for everything Claidor holds.
    const bundle = (await person.syncMemory([])).filter((file) => isMemoryName(file.name));
    await layOutMemory(workspace, bundle);
    await fs.writeFile(
      path.join(workspace, 'AGENTS.md'),
      buildWorkspaceInstructions(claimed.job.allow ?? []),
      'utf8',
    );
    log.info(`job ${claimed.job.id}: ${bundle.length} memory file(s) laid out`);

    const models = await person.models();
    const model = models[0];
    if (!model) throw new NoModelAvailable();

    engine = await Engine.start({
      engineRoot: settings.engineRoot,
      jobDir,
      config: buildEngineConfig({
        workspacePath: workspace,
        modelProxyBaseUrl: modelProxyUrl(settings.apiBaseUrl),
        model,
      }),
      jobToken: claimed.accessToken,
      startTimeoutMs: settings.engineStartTimeoutMs,
    });

    const answer = await engine.ask(engineInput(claimed.job), settings.jobTimeoutMs, signal);
    log.info(`job ${claimed.job.id}: the engine answered`);

    await engine.stop();
    engine = null;

    const changes = await collectMemoryChanges(workspace, bundle);
    if (changes.length > 0) {
      await person.syncMemory(changes);
      log.info(`job ${claimed.job.id}: ${changes.length} memory file(s) written back`);
    }

    return {
      answer: answer.text,
      usage: answer.usage,
      // The reply goes back as the turn's message too, so a cloud agent's
      // conversation grows by what was actually said.
      ...(claimed.job.conversation === undefined ? {} : { messages: [{ role: 'assistant' as const, text: answer.text }] }),
    };
  } finally {
    if (engine) await engine.stop();
    await fs.rm(jobDir, { recursive: true, force: true });
  }
};
