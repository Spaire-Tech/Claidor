/**
 * Caisra Box — the agent's computer, registered as an engine sandbox backend.
 *
 * The engine keeps sandbox backends in a plugin registry
 * (`registerSandboxBackend`), so the box needs no fork and no patch. What it
 * does need is a broker: the sandbox credential belongs to Claidor and must
 * never ship inside an Electron app, so every call goes to the Caisra server.
 *
 * Findings that shaped this plugin, with the evidence, are in
 * `docs/product/agent-computer-plan.md`.
 */
import type { OpenClawPluginApi } from 'openclaw/plugin-sdk';
import { registerSandboxBackend } from 'openclaw/plugin-sdk/sandbox';

import { createBoxSandboxBackendFactory, createBoxSandboxBackendManager } from './backend';
import { readBoxConfig } from './backendSpec';

export const BOX_SANDBOX_BACKEND_ID = 'box';

const plugin = {
  id: 'caisra-box',
  name: 'Caisra Box',
  description: "The agent's computer: a remote sandbox the engine drives as a sandbox backend.",

  register(api: OpenClawPluginApi) {
    const config = readBoxConfig(api.pluginConfig);
    if ('error' in config) {
      api.logger.info(
        `[Box] sandbox backend not registered: ${config.error}. `
        + 'The engine will refuse agents.defaults.sandbox.backend=box until this is configured.',
      );
      return;
    }

    registerSandboxBackend(BOX_SANDBOX_BACKEND_ID, {
      factory: createBoxSandboxBackendFactory({ config }),
      manager: createBoxSandboxBackendManager({ config }),
    });

    api.logger.info(
      `[Box] sandbox backend registered against ${config.brokerBaseUrl}`
      + `${config.template ? ` (template ${config.template})` : ''}`,
    );
  },
};

export default plugin;
