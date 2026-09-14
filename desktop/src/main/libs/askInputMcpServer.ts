import fs from 'fs';
import path from 'path';

import { ASK_INPUT_TOOL } from '../../shared/askInput/constants';

/**
 * The tool that lets the agent ask for something typed.
 *
 * A stdio MCP server, written to disk and launched by the gateway — the
 * same shape as `lobsterBrowserMcpServer.ts`, which is the pattern this
 * copies rather than a second way of doing it. One tool, one bridge
 * route, no state of its own.
 *
 * **What it buys.** Every safety rule in this product says never ask
 * somebody to paste a password or a key into chat. Until now there was
 * nowhere else to put one, so "sign in to continue" was a dead end: the
 * agent either asked in the open or gave up. This is the somewhere else.
 *
 * **What it deliberately does not do.** The answer comes back to the
 * tool. It is not written into the conversation, not added to the model's
 * context by us, and not logged. The values cross exactly one boundary —
 * the loopback socket between this process and the app — and the app
 * never writes them down unless the person ticked "keep this".
 */

const SERVER_FILE_NAME = 'ask-input-mcp-server.mjs';
const RUNTIME_CONFIG_FILE_NAME = 'ask-input-mcp-runtime.json';
const WINDOWS_LAUNCHER_FILE_NAME = 'ask-input-mcp.cmd';
const POSIX_LAUNCHER_FILE_NAME = 'ask-input-mcp';

export interface AskInputMcpLaunchOptions {
  electronNodeRuntimePath: string;
  bridgeUrl: string;
  bridgeSecret: string;
  platform?: NodeJS.Platform;
}

export interface AskInputMcpStdioLaunch {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * What the model is told the tool is for.
 *
 * Long, and deliberately so. A tool the model does not understand is a
 * tool it does not reach for, and the failure mode here is not a crash —
 * it is the agent politely asking somebody to type their password into a
 * chat box, which is the thing this exists to stop.
 */
const TOOL_DESCRIPTION = [
  'Ask the person to type something into a card in the conversation, with any',
  'sensitive fields masked. Use this whenever you need a password, an API key,',
  'a one-time code, or the fields of a sign-in or checkout form.',
  '',
  'NEVER ask the person to send a password, key or code as a chat message. Call',
  'this instead. Values typed here are handed to you for this task only; they are',
  'not added to the conversation.',
  '',
  'Ask for everything you need in one call rather than several: a person filling',
  'in an email and then being asked for a password in a second card has been made',
  'to do the same job twice.',
  '',
  'Set offerToSave only when the value is worth keeping — a site password the',
  'person will need again. Never for a one-time code.',
  '',
  'If the person declines, do not ask again. Say what you cannot finish without',
  'it and stop.',
].join('\n');

const MCP_SERVER_SOURCE = String.raw`import fs from 'node:fs/promises';
import readline from 'node:readline';

function writeDiagnostic(message) {
  process.stderr.write('[AskInputMcp] ' + message + '\n');
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
const bridgeSecret = runtimeConfig?.bridgeSecret || '';

const tools = [{
  name: '${ASK_INPUT_TOOL}',
  description: ${JSON.stringify(TOOL_DESCRIPTION)},
  inputSchema: {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'One sentence saying what this is for and why you need it.',
      },
      note: {
        type: 'string',
        description: 'Which service or account, when you can say.',
      },
      fields: {
        type: 'array',
        description: 'The boxes to show, in the order they should be filled.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The key this value comes back under.' },
            label: { type: 'string', description: 'The word above the box, e.g. "Password".' },
            kind: {
              type: 'string',
              enum: ['line', 'secret', 'block'],
              description: 'secret is masked and never enters the conversation.',
            },
            placeholder: { type: 'string' },
            optional: { type: 'boolean' },
          },
          required: ['name', 'label', 'kind'],
        },
      },
      offerToSave: {
        type: 'boolean',
        description: 'Offer to keep the values on this computer. Never for a one-time code.',
      },
    },
    required: ['prompt', 'fields'],
  },
}];

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function askUser(args) {
  if (!bridgeUrl || !bridgeSecret) {
    return errorResult('The app is not reachable, so nothing can be asked right now.');
  }
  const fields = Array.isArray(args?.fields) ? args.fields : [];
  if (!args?.prompt || fields.length === 0) {
    return errorResult('A prompt and at least one field are required.');
  }

  let response;
  try {
    response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': bridgeSecret },
      body: JSON.stringify({
        prompt: args.prompt,
        note: args.note,
        fields,
        offerToSave: Boolean(args.offerToSave),
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
  if (payload.behavior !== 'provide') {
    // Said plainly, so the model treats it as a decision rather than a
    // failure to retry. Asking twice for a password is how software
    // teaches people to stop reading what it asks for.
    return {
      content: [{
        type: 'text',
        text: 'The person declined to provide this. Do not ask again — tell them what you cannot finish without it.',
      }],
    };
  }

  return {
    content: [{ type: 'text', text: 'The person filled this in.' }],
    structuredContent: { values: payload.values || {}, remembered: Boolean(payload.remember) },
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
      serverInfo: { name: 'ask-input', version: '1.0.0' },
    };
  } else if (message.method === 'tools/list') {
    result = { tools };
  } else if (message.method === 'tools/call') {
    result = message.params?.name === '${ASK_INPUT_TOOL}'
      ? await askUser(message.params?.arguments || {})
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
 * `0o600` on the config file and `0o700` on the directory: it holds the
 * bridge secret, and anything that can read that can raise a card asking
 * this person for a password.
 */
const prepare = (baseDir: string, options: AskInputMcpLaunchOptions): { serverDir: string } => {
  if (!options.electronNodeRuntimePath.trim()) {
    throw new Error('The ask-input MCP server needs an Electron Node runtime path.');
  }
  if (!options.bridgeUrl.trim() || !options.bridgeSecret) {
    throw new Error('The ask-input MCP server needs a running bridge.');
  }

  const serverDir = path.join(baseDir, 'ask-input-mcp');
  fs.mkdirSync(serverDir, { recursive: true, mode: 0o700 });
  if (process.platform !== 'win32') fs.chmodSync(serverDir, 0o700);

  writeFileIfChanged(path.join(serverDir, SERVER_FILE_NAME), MCP_SERVER_SOURCE, 0o600);
  writeFileIfChanged(
    path.join(serverDir, RUNTIME_CONFIG_FILE_NAME),
    `${JSON.stringify({ version: 1, bridgeUrl: options.bridgeUrl, bridgeSecret: options.bridgeSecret }, null, 2)}\n`,
    0o600,
  );
  return { serverDir };
};

export const resolveAskInputMcpStdioLaunch = (
  baseDir: string,
  options: AskInputMcpLaunchOptions,
): AskInputMcpStdioLaunch => {
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
