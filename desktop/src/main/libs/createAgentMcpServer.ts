import fs from 'fs';
import path from 'path';

import { ROLES } from '../../shared/onboarding/script';
import {
  CREATE_AGENT_LIMITS,
  CREATE_AGENT_TOOL,
} from '../../shared/staffing/constants';
import { PROPOSE_TEAM_TOOL, ROSTER_LIMITS } from '../../shared/staffing/roster';
import { STRONGS } from '../../shared/staffing/strongs';

/**
 * The tools that let Yodo staff the person: stand up one agent, or
 * propose a starter team.
 *
 * A stdio MCP server, written to disk and launched by the gateway — the
 * same shape as `askInputMcpServer.ts`, which this copies rather than
 * inventing a second way. Two tools, two bridge routes, no state of its
 * own. `propose_team` came on 16 September with the founder's step-two
 * page: the roster card is the asking, so the bridge stands the checked
 * rows up itself and this tool is told who is in.
 *
 * **What it buys.** Step two of onboarding (`docs/product/onboarding-step-two-2026-09-16.md`):
 * Yodo proposes two or three agents and, on "Stand them up", they exist.
 * Until this, agents were created only from the create screen; the main
 * agent had no way to do it (review item 58).
 *
 * **What it deliberately does not do.** It never creates anything by
 * itself. The bridge raises a card in the conversation with the name,
 * the job and the brief; the person presses Stand up or Not now; the
 * tool waits for that answer inside its turn. A decline comes back as a
 * decision, not an error.
 */

const SERVER_FILE_NAME = 'create-agent-mcp-server.mjs';
const RUNTIME_CONFIG_FILE_NAME = 'create-agent-mcp-runtime.json';
const WINDOWS_LAUNCHER_FILE_NAME = 'create-agent-mcp.cmd';
const POSIX_LAUNCHER_FILE_NAME = 'create-agent-mcp';

export interface CreateAgentMcpLaunchOptions {
  electronNodeRuntimePath: string;
  /** The create-agent route. */
  bridgeUrl: string;
  /** The propose-team route. Absent, that tool answers that the app is not reachable. */
  proposeTeamUrl?: string;
  bridgeSecret: string;
  platform?: NodeJS.Platform;
}

export interface CreateAgentMcpStdioLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * What the model is told the tool is for.
 *
 * The rules are the founder's (the 16 September page, §9): one job, one
 * voice, explicit anti-jobs; draft by default; the person is asked
 * first. A tool the model does not understand is a tool it misuses, and
 * the misuse here is an agent with a soft job and nothing it refuses.
 */
const TOOL_DESCRIPTION = [
  'Stand up a new agent on this computer: a teammate with one job, one voice, and',
  'explicit anti-jobs (what it refuses to do). Use this when the person needs a',
  'specialist that does not exist yet, or when staffing their starter team.',
  '',
  'The person is asked first. A card shows the name, the job and the brief, and',
  'they press Stand up or Not now. The call waits for that answer. If they say',
  'Not now, do not call again for the same agent — say what you will do instead.',
  '',
  'Write the job as one sentence saying what done looks like. Give at least one',
  'anti-job; a brief with nothing it refuses is not a brief. Keep the label to a',
  'few words: it sits under the name in the sidebar.',
  '',
  'Never stand up more than the person asked for. Never stand up an agent to do',
  'something you can do yourself right now.',
].join('\n');

/**
 * The roster tool, in the founder's words (the 16 September page, §5):
 * curated two or three from the twenty-three, never all of them; the
 * card is the asking; short bubbles once they are in.
 */
const PROPOSE_TEAM_DESCRIPTION = [
  'Propose a starter team from the twenty-three Caisra Agents, trained desks that',
  'know their job. Give the work type the person chose (one of: ' + ROLES.map(one => one.label).join(', ') + ')',
  'and the card proposes the two or three that fit, with alternates to swap in. Give',
  '`picks` (two or three slugs) instead when you have a better fit, or when the work',
  'type is the person\'s own words.',
  '',
  'The card is the asking: the person swaps, trims, adds, or types something else,',
  'and presses Stand them up. This call waits for that. On Stand them up the agents',
  'are created and briefed before this returns, so do not call create_agent for them.',
  'Then say who is in, one short line each. If they typed something else, map it to',
  'the nearest of the twenty-three and call again with `picks`, or design a custom',
  'brief with create_agent. If they said Not now, do not raise the card again unless',
  'they ask.',
  '',
  'Never list the twenty-three in chat and never stand all of them up. Slugs:',
  STRONGS.map(one => `${one.slug} (${one.name})`).join(', ') + '.',
].join('\n');

const MCP_SERVER_SOURCE = String.raw`import fs from 'node:fs/promises';
import readline from 'node:readline';

function writeDiagnostic(message) {
  process.stderr.write('[CreateAgentMcp] ' + message + '\n');
}

function formatError(error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 2000);
}

const runtimeConfig = await fs.readFile(
  new URL('./${RUNTIME_CONFIG_FILE_NAME}', import.meta.url),
  'utf8',
).then((raw) => JSON.parse(raw)).catch((error) => {
  writeDiagnostic('runtime-config-unreadable error=' + JSON.stringify(formatError(error)));
  return null;
});

const bridgeUrl = runtimeConfig?.bridgeUrl || '';
const proposeTeamUrl = runtimeConfig?.proposeTeamUrl || '';
const bridgeSecret = runtimeConfig?.bridgeSecret || '';

const tools = [{
  name: '${PROPOSE_TEAM_TOOL}',
  description: ${JSON.stringify(PROPOSE_TEAM_DESCRIPTION)},
  inputSchema: {
    type: 'object',
    properties: {
      workType: {
        type: 'string',
        description: 'What the person said they do: one of the ten work types, or their own words.',
      },
      picks: {
        type: 'array',
        description: 'Your own ${ROSTER_LIMITS.min} or ${ROSTER_LIMITS.max} picks, by slug, when the table\'s default is not the right one.',
        items: { type: 'string' },
        minItems: ${ROSTER_LIMITS.min},
        maxItems: ${ROSTER_LIMITS.max},
      },
    },
    required: ['workType'],
  },
}, {
  name: '${CREATE_AGENT_TOOL}',
  description: ${JSON.stringify(TOOL_DESCRIPTION)},
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The agent\'s name, e.g. "Projects Manager". Up to ${CREATE_AGENT_LIMITS.name} characters.',
      },
      label: {
        type: 'string',
        description: 'The remit in a few words, shown under the name, e.g. "Project ops".',
      },
      job: {
        type: 'string',
        description: 'One sentence: what done looks like for this agent.',
      },
      antiJobs: {
        type: 'array',
        description: 'What this agent refuses to do. At least one, each a short line.',
        items: { type: 'string' },
        minItems: 1,
      },
      voice: {
        type: 'string',
        description: 'How it sounds, in a line. Optional.',
      },
    },
    required: ['name', 'label', 'job', 'antiJobs'],
  },
}];

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function createAgent(args) {
  if (!bridgeUrl || !bridgeSecret) {
    return errorResult('The app is not reachable, so no agent can be stood up right now.');
  }
  const name = typeof args?.name === 'string' ? args.name.trim() : '';
  const antiJobs = Array.isArray(args?.antiJobs) ? args.antiJobs.filter((one) => typeof one === 'string' && one.trim()) : [];
  if (!name || !args?.label || !args?.job || antiJobs.length === 0) {
    return errorResult('A name, a label, a one-sentence job and at least one anti-job are required.');
  }

  let response;
  try {
    response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': bridgeSecret },
      body: JSON.stringify({
        name,
        label: args.label,
        job: args.job,
        antiJobs,
        ...(typeof args.voice === 'string' && args.voice.trim() ? { voice: args.voice } : {}),
      }),
    });
  } catch (error) {
    writeDiagnostic('bridge-request-failed error=' + JSON.stringify(formatError(error)));
    return errorResult('The card could not be shown.');
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload) {
    return errorResult('The card could not be shown.');
  }
  if (payload.behavior === 'declined') {
    // Said plainly, so the model treats it as a decision rather than a
    // failure to retry.
    return {
      content: [{
        type: 'text',
        text: 'The person chose not to stand up ' + name + ' now. Do not ask again for this agent — say what you will do instead.',
      }],
    };
  }
  if (payload.behavior !== 'created') {
    return errorResult('Standing up ' + name + ' did not go through: ' + (payload.reason || 'unknown reason') + '.');
  }
  return {
    content: [{
      type: 'text',
      text: name + ' is in, as agent ' + payload.agentId + '. Brief them by sending them their first task.',
    }],
    structuredContent: { agentId: payload.agentId, name: payload.name || name },
  };
}

async function proposeTeam(args) {
  if (!proposeTeamUrl || !bridgeSecret) {
    return errorResult('The app is not reachable, so no team can be proposed right now.');
  }
  const workType = typeof args?.workType === 'string' ? args.workType.trim() : '';
  if (!workType) return errorResult('A work type is required: what the person said they do.');
  const picks = Array.isArray(args?.picks) ? args.picks.filter((one) => typeof one === 'string' && one.trim()) : undefined;

  let response;
  try {
    response = await fetch(proposeTeamUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': bridgeSecret },
      body: JSON.stringify({ workType, ...(picks ? { picks } : {}) }),
    });
  } catch (error) {
    writeDiagnostic('bridge-request-failed error=' + JSON.stringify(formatError(error)));
    return errorResult('The card could not be shown.');
  }

  const payload = await response.json().catch(() => null);
  if (!payload) return errorResult('The card could not be shown.');
  if (payload.behavior === 'failed') {
    return errorResult('The team could not be proposed: ' + (payload.reason || 'unknown reason') + '.');
  }
  if (!response.ok) return errorResult('The card could not be shown.');
  if (payload.behavior === 'declined') {
    return {
      content: [{
        type: 'text',
        text: 'The person chose not to stand up a team now. Do not raise the card again unless they ask — say what you will do instead.',
      }],
    };
  }
  if (payload.behavior === 'somethingElse') {
    return {
      content: [{
        type: 'text',
        text: 'The person typed, instead of the proposed team: ' + JSON.stringify(payload.text || '')
          + '. Map it to the nearest of the twenty-three and call propose_team again with picks, or design a custom brief with create_agent.',
      }],
      structuredContent: { somethingElse: payload.text || '' },
    };
  }
  if (payload.behavior !== 'stoodUp') {
    return errorResult('The card gave an answer the app does not know.');
  }
  const agents = Array.isArray(payload.agents) ? payload.agents : [];
  const failed = Array.isArray(payload.failed) ? payload.failed : [];
  const lines = [
    ...agents.map((one) => one.name + ' is in, as agent ' + one.agentId + '.'),
    ...failed.map((one) => one.name + ' did not go through: ' + one.reason + '.'),
  ];
  if (lines.length === 0) lines.push('Nobody was stood up.');
  lines.push('Say so in a line each, then offer one first useful action.');
  return {
    content: [{ type: 'text', text: lines.join(' ') }],
    structuredContent: { agents, failed },
  };
}

async function handleRequest(message) {
  if (!message || message.jsonrpc !== '2.0' || !message.method) return;
  if (message.method.startsWith('notifications/')) return;

  let result;
  if (message.method === 'initialize') {
    result = {
      protocolVersion: message.params?.protocolVersion || '2025-03-26',
      capabilities: { tools: {} },
      serverInfo: { name: 'staffing', version: '1.0.0' },
    };
  } else if (message.method === 'tools/list') {
    result = { tools };
  } else if (message.method === 'tools/call') {
    result = message.params?.name === '${CREATE_AGENT_TOOL}'
      ? await createAgent(message.params?.arguments || {})
      : message.params?.name === '${PROPOSE_TEAM_TOOL}'
        ? await proposeTeam(message.params?.arguments || {})
        : errorResult('Unknown tool.');
  } else if (message.method === 'ping') {
    result = {};
  } else {
    writeMessage({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'Method not found' } });
    return;
  }

  if (message.id !== undefined) writeMessage({ jsonrpc: '2.0', id: message.id, result });
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const message = JSON.parse(trimmed);
    void handleRequest(message).catch((error) => {
      writeDiagnostic('request-failed error=' + JSON.stringify(formatError(error)));
      if (message.id !== undefined) {
        writeMessage({
          jsonrpc: '2.0',
          id: message.id,
          result: errorResult(error instanceof Error ? error.message : String(error)),
        });
      }
    });
  } catch (error) {
    writeDiagnostic('invalid-json-rpc error=' + JSON.stringify(formatError(error)));
  }
});
`;

const escapeWindowsBatchValue = (value: string): string => value.replace(/%/g, '%%');
const quotePosixShellValue = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

const buildWindowsLauncherSource = (electronNodeRuntimePath: string): string => [
  '@echo off',
  'chcp 65001 >nul 2>&1',
  'setlocal DisableDelayedExpansion',
  'set "ELECTRON_RUN_AS_NODE=1"',
  `"${escapeWindowsBatchValue(electronNodeRuntimePath)}" "%~dp0${SERVER_FILE_NAME}" %*`,
  '',
].join('\r\n');

const buildPosixLauncherSource = (electronNodeRuntimePath: string): string => [
  '#!/bin/sh',
  `exec env ELECTRON_RUN_AS_NODE=1 ${quotePosixShellValue(electronNodeRuntimePath)} "$(dirname "$0")/${SERVER_FILE_NAME}" "$@"`,
  '',
].join('\n');

const writeFileIfChanged = (filePath: string, contents: string, mode?: number): void => {
  let current: string | null = null;
  try {
    current = fs.readFileSync(filePath, 'utf8');
  } catch {
    // Not there yet.
  }
  if (current !== contents) {
    fs.writeFileSync(filePath, contents, {
      encoding: 'utf8',
      ...(mode !== undefined ? { mode } : {}),
    });
  }
  if (mode !== undefined && process.platform !== 'win32') {
    fs.chmodSync(filePath, mode);
  }
};

/**
 * Write the server and its config.
 *
 * `0o600` on the config and `0o700` on the directory, as for ask-input:
 * anything that can read the bridge secret can raise cards in this
 * person's conversation.
 */
const prepare = (baseDir: string, options: CreateAgentMcpLaunchOptions): { serverDir: string } => {
  if (!options.electronNodeRuntimePath.trim()) {
    throw new Error('The create-agent MCP server needs an Electron Node runtime path.');
  }
  if (!options.bridgeUrl.trim() || !options.bridgeSecret) {
    throw new Error('The create-agent MCP server needs a running bridge.');
  }

  const serverDir = path.join(baseDir, 'create-agent-mcp');
  fs.mkdirSync(serverDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(serverDir, 0o700);

  writeFileIfChanged(path.join(serverDir, SERVER_FILE_NAME), MCP_SERVER_SOURCE, 0o600);
  writeFileIfChanged(
    path.join(serverDir, RUNTIME_CONFIG_FILE_NAME),
    `${JSON.stringify({
      version: 2,
      bridgeUrl: options.bridgeUrl,
      ...(options.proposeTeamUrl ? { proposeTeamUrl: options.proposeTeamUrl } : {}),
      bridgeSecret: options.bridgeSecret,
    }, null, 2)}\n`,
    0o600,
  );
  return { serverDir };
};

export const resolveCreateAgentMcpStdioLaunch = (
  baseDir: string,
  options: CreateAgentMcpLaunchOptions,
): CreateAgentMcpStdioLaunch => {
  const { serverDir } = prepare(baseDir, options);
  const platform = options.platform ?? process.platform;

  const launcherName = platform === 'win32' ? WINDOWS_LAUNCHER_FILE_NAME : POSIX_LAUNCHER_FILE_NAME;
  const launcherPath = path.join(serverDir, launcherName);
  writeFileIfChanged(
    launcherPath,
    platform === 'win32'
      ? buildWindowsLauncherSource(options.electronNodeRuntimePath)
      : buildPosixLauncherSource(options.electronNodeRuntimePath),
    platform === 'win32' ? 0o600 : 0o700,
  );

  return {
    command: launcherPath,
    args: [],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
};
