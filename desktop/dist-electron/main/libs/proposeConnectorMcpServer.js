"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProposeConnectorMcpStdioLaunch = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const proposal_1 = require("../../shared/connections/proposal");
/**
 * The tool that lets an agent propose a connector, from the conversation.
 *
 * A stdio MCP server, written to disk and launched by the gateway — the
 * same shape as `createAgentMcpServer.ts`, which this copies rather than
 * inventing a third way. One tool, one bridge route, no state of its own.
 *
 * **What it buys.** The founder, 17 September 2026: whenever an agent is
 * asked about a connector, or proposes one, the onboarding card — logo,
 * name, one line, Not now, Install. Until this the brief told the agent
 * to *say* where to connect it, which sent the person to the Apps screen
 * to find the card themselves.
 *
 * **What it deliberately does not do.** It never connects anything by
 * itself. The bridge raises the card; the person presses Install or Not
 * now; Install runs the Apps screen's own Connect; the tool waits for
 * the outcome inside its turn. A Not now comes back as a decision, not
 * an error.
 */
const SERVER_FILE_NAME = 'propose-connector-mcp-server.mjs';
const RUNTIME_CONFIG_FILE_NAME = 'propose-connector-mcp-runtime.json';
const WINDOWS_LAUNCHER_FILE_NAME = 'propose-connector-mcp.cmd';
const POSIX_LAUNCHER_FILE_NAME = 'propose-connector-mcp';
/**
 * What the model is told the tool is for.
 *
 * The rules are the founder's: the card comes to the person instead of
 * the person being sent to Apps; the card does the sign-in; a Not now
 * holds for the conversation. A tool the model does not understand is a
 * tool it misuses, and the misuse here is raising the same card twice,
 * or telling the person to go and connect it themselves.
 */
const TOOL_DESCRIPTION = [
    'Propose connecting a service, with a card in the conversation. Use this whenever',
    'the person asks about a service that is not connected, or you need one that is',
    'not connected to do what they asked. Never tell them to go to Apps and connect',
    'it themselves: this card is how it gets connected.',
    '',
    'The card shows the service and your one line of why, with Not now and Install.',
    'Install runs the sign-in in their browser; the card does the whole of it, and',
    'nothing is typed in chat. The call waits for the outcome and says which it was:',
    'connected, declined, or failed.',
    '',
    'If they say Not now, do not raise the card for that service again in this',
    'conversation unless they ask — say what you will do instead. If it failed, say',
    'so in a line with the reason, and offer to try again.',
    '',
    'Give the service\'s id from the list: ' + (0, proposal_1.connectorIds)().join(', ') + '.',
].join('\n');
const MCP_SERVER_SOURCE = String.raw `import fs from 'node:fs/promises';
import readline from 'node:readline';

function writeDiagnostic(message) {
  process.stderr.write('[ProposeConnectorMcp] ' + message + '\n');
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
  name: '${proposal_1.PROPOSE_CONNECTOR_TOOL}',
  description: ${JSON.stringify(TOOL_DESCRIPTION)},
  inputSchema: {
    type: 'object',
    properties: {
      connectionId: {
        type: 'string',
        description: 'The service, by its id.',
        enum: ${JSON.stringify((0, proposal_1.connectorIds)())},
      },
      reason: {
        type: 'string',
        description: 'One line, in your words, on why now. Shown under the service\'s own line. Up to ${proposal_1.PROPOSE_CONNECTOR_LIMITS.reason} characters. Optional.',
      },
    },
    required: ['connectionId'],
  },
}];

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function errorResult(message) {
  return { content: [{ type: 'text', text: message }], isError: true };
}

async function proposeConnector(args) {
  if (!bridgeUrl || !bridgeSecret) {
    return errorResult('The app is not reachable, so no connector can be proposed right now.');
  }
  const connectionId = typeof args?.connectionId === 'string' ? args.connectionId.trim() : '';
  if (!connectionId) {
    return errorResult('A connectionId is required: the service, by its id.');
  }

  let response;
  try {
    response = await fetch(bridgeUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mcp-bridge-secret': bridgeSecret },
      body: JSON.stringify({
        connectionId,
        ...(typeof args.reason === 'string' && args.reason.trim() ? { reason: args.reason } : {}),
      }),
    });
  } catch (error) {
    writeDiagnostic('bridge-request-failed error=' + JSON.stringify(formatError(error)));
    return errorResult('The card could not be shown.');
  }

  const payload = await response.json().catch(() => null);
  if (!payload) {
    return errorResult('The card could not be shown.');
  }
  if (payload.behavior === '${proposal_1.ProposeConnectorBehavior.Failed}') {
    // Refused before the card (a bad id, with the list), or the sign-in
    // did not go through. Either way the reason is the model's to relay.
    return errorResult('The sign-in failed: ' + (payload.reason || 'unknown reason') + '.');
  }
  if (!response.ok) {
    return errorResult('The card could not be shown.');
  }
  if (payload.behavior === '${proposal_1.ProposeConnectorBehavior.Declined}') {
    // Said plainly, so the model treats it as a decision rather than a
    // failure to retry.
    return {
      content: [{
        type: 'text',
        text: 'They said not now. Do not raise the card for this service again in this conversation unless they ask — say what you will do instead.',
      }],
    };
  }
  if (payload.behavior !== '${proposal_1.ProposeConnectorBehavior.Connected}') {
    return errorResult('The card gave an answer the app does not know.');
  }
  const name = payload.name || connectionId;
  return {
    content: [{ type: 'text', text: name + ' is connected now.' }],
    structuredContent: { connectionId: payload.connectionId || connectionId, name },
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
      serverInfo: { name: 'connectors', version: '1.0.0' },
    };
  } else if (message.method === 'tools/list') {
    result = { tools };
  } else if (message.method === 'tools/call') {
    result = message.params?.name === '${proposal_1.PROPOSE_CONNECTOR_TOOL}'
      ? await proposeConnector(message.params?.arguments || {})
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
const escapeWindowsBatchValue = (value) => value.replace(/%/g, '%%');
const quotePosixShellValue = (value) => `'${value.replace(/'/g, `'"'"'`)}'`;
const buildWindowsLauncherSource = (electronNodeRuntimePath) => [
    '@echo off',
    'chcp 65001 >nul 2>&1',
    'setlocal DisableDelayedExpansion',
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${escapeWindowsBatchValue(electronNodeRuntimePath)}" "%~dp0${SERVER_FILE_NAME}" %*`,
    '',
].join('\r\n');
const buildPosixLauncherSource = (electronNodeRuntimePath) => [
    '#!/bin/sh',
    `exec env ELECTRON_RUN_AS_NODE=1 ${quotePosixShellValue(electronNodeRuntimePath)} "$(dirname "$0")/${SERVER_FILE_NAME}" "$@"`,
    '',
].join('\n');
const writeFileIfChanged = (filePath, contents, mode) => {
    let current = null;
    try {
        current = fs_1.default.readFileSync(filePath, 'utf8');
    }
    catch {
        // Not there yet.
    }
    if (current !== contents) {
        fs_1.default.writeFileSync(filePath, contents, {
            encoding: 'utf8',
            ...(mode !== undefined ? { mode } : {}),
        });
    }
    if (mode !== undefined && process.platform !== 'win32') {
        fs_1.default.chmodSync(filePath, mode);
    }
};
/**
 * Write the server and its config.
 *
 * `0o600` on the config and `0o700` on the directory, as for the others:
 * anything that can read the bridge secret can raise cards in this
 * person's conversation.
 */
const prepare = (baseDir, options) => {
    if (!options.electronNodeRuntimePath.trim()) {
        throw new Error('The propose-connector MCP server needs an Electron Node runtime path.');
    }
    if (!options.bridgeUrl.trim() || !options.bridgeSecret) {
        throw new Error('The propose-connector MCP server needs a running bridge.');
    }
    const serverDir = path_1.default.join(baseDir, 'propose-connector-mcp');
    fs_1.default.mkdirSync(serverDir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32')
        fs_1.default.chmodSync(serverDir, 0o700);
    writeFileIfChanged(path_1.default.join(serverDir, SERVER_FILE_NAME), MCP_SERVER_SOURCE, 0o600);
    writeFileIfChanged(path_1.default.join(serverDir, RUNTIME_CONFIG_FILE_NAME), `${JSON.stringify({
        version: 1,
        bridgeUrl: options.bridgeUrl,
        bridgeSecret: options.bridgeSecret,
    }, null, 2)}\n`, 0o600);
    return { serverDir };
};
const resolveProposeConnectorMcpStdioLaunch = (baseDir, options) => {
    const { serverDir } = prepare(baseDir, options);
    const platform = options.platform ?? process.platform;
    const launcherName = platform === 'win32' ? WINDOWS_LAUNCHER_FILE_NAME : POSIX_LAUNCHER_FILE_NAME;
    const launcherPath = path_1.default.join(serverDir, launcherName);
    writeFileIfChanged(launcherPath, platform === 'win32'
        ? buildWindowsLauncherSource(options.electronNodeRuntimePath)
        : buildPosixLauncherSource(options.electronNodeRuntimePath), platform === 'win32' ? 0o600 : 0o700);
    return {
        command: launcherPath,
        args: [],
        env: { ELECTRON_RUN_AS_NODE: '1' },
    };
};
exports.resolveProposeConnectorMcpStdioLaunch = resolveProposeConnectorMcpStdioLaunch;
//# sourceMappingURL=proposeConnectorMcpServer.js.map