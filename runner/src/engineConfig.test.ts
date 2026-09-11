import { describe, expect, test } from 'vitest';

import {
  buildEngineConfig,
  buildExecApprovals,
  buildWorkspaceInstructions,
  GATEWAY_TOKEN_ENV,
  NO_BUNDLED_SKILL,
  JOB_TOKEN_ENV,
  PROVIDER_ID,
} from './engineConfig.js';

const config = (): Record<string, any> =>
  buildEngineConfig({
    workspacePath: '/jobs/job-1/workspace',
    modelProxyBaseUrl: 'https://api.example.test/desktop/api/proxy',
    model: { id: 'some-model', contextWindow: 200_000, maxTokens: 8_192 },
  }) as Record<string, any>;

describe('the engine config, on the safety of it', () => {
  test('offers no way to run a command', () => {
    const built = config();
    expect(built.tools.allow).not.toContain('exec');
    expect(built.tools.allow).not.toContain('process');
    expect(built.tools.deny).toContain('group:runtime');
    expect(built.tools.exec.mode).toBe('deny');
    // The engine refuses the whole file if `mode` is set beside the older
    // `security` / `ask` pair, and it has no `askFallback` key at all.
    // Those three live in the approvals file, which the test below checks.
    expect(built.tools.exec.security).toBeUndefined();
    expect(built.tools.exec.ask).toBeUndefined();
    expect(built.tools.exec.askFallback).toBeUndefined();
    expect(built.tools.elevated.enabled).toBe(false);
  });

  test('allows only reading and writing, and only inside the job directory', () => {
    const built = config();
    expect(built.tools.allow).toEqual(['read', 'write', 'edit']);
    expect(built.tools.fs.workspaceOnly).toBe(true);
    expect(built.tools.exec.applyPatch).toEqual({ enabled: false, workspaceOnly: true });
    expect(built.tools.deny).toContain('apply_patch');
    expect(built.agents.defaults.workspace).toBe('/jobs/job-1/workspace');
    expect(built.agents.defaults.cwd).toBe('/jobs/job-1/workspace');
  });

  test('reaches no network the work does not need', () => {
    const built = config();
    expect(built.tools.web.search.enabled).toBe(false);
    expect(built.tools.web.fetch.enabled).toBe(false);
    expect(built.tools.deny).toContain('group:web');
    expect(built.tools.deny).toContain('group:ui');
    expect(built.mcp.servers).toEqual({});
    expect(built.channels).toEqual({});
    expect(built.gateway.bind).toBe('loopback');
    expect(built.gateway.tailscale.mode).toBe('off');
  });

  test('offers the model none of the engine\'s own skills or plugins', () => {
    const built = config();
    // An empty allowlist means "no allowlist" to this engine, so the way to
    // allow none is to name something that is not a skill.
    expect(built.skills.allowBundled).toEqual([NO_BUNDLED_SKILL]);
    expect(built.skills.allowBundled).not.toEqual([]);
    expect(built.plugins.entries.browser.enabled).toBe(false);
  });

  test('cannot send, schedule, or reach another agent', () => {
    const built = config();
    for (const group of ['group:messaging', 'group:automation', 'group:nodes', 'group:sessions', 'group:agents', 'group:media', 'group:plugins']) {
      expect(built.tools.deny).toContain(group);
    }
    expect(built.cron.enabled).toBe(false);
    expect(built.agents.defaults.heartbeat).toEqual({ every: '0m', target: 'none' });
  });

  test('sends every model call through Claidor on the person\'s token', () => {
    const built = config();
    const provider = built.models.providers[PROVIDER_ID];
    expect(provider.baseUrl).toBe('https://api.example.test/desktop/api/proxy');
    expect(provider.api).toBe('anthropic-messages');
    expect(built.agents.defaults.model.primary).toBe(`${PROVIDER_ID}/some-model`);
  });

  test('writes no token into the file, only the name of a variable', () => {
    const built = config();
    expect(built.models.providers[PROVIDER_ID].apiKey).toBe(`\${${JOB_TOKEN_ENV}}`);
    expect(built.gateway.auth.token).toBe(`\${${GATEWAY_TOKEN_ENV}}`);
    const text = JSON.stringify(built);
    expect(text).not.toMatch(/Bearer /);
  });
});

describe('the approvals file', () => {
  test('is the reverse of the desktop\'s', () => {
    // The desktop writes security "full" and ask "off" so the person is
    // never interrupted. Here that would mean no gate at all.
    const approvals = buildExecApprovals() as Record<string, any>;
    for (const entry of [approvals.defaults, approvals.agents.main]) {
      expect(entry.security).toBe('deny');
      expect(entry.ask).toBe('always');
      expect(entry.askFallback).toBe('deny');
      expect(entry.autoAllowSkills).toBe(false);
      expect(entry.allowlist).toEqual([]);
    }
  });
});

describe('the workspace instructions', () => {
  test('say plainly that nothing was allowed when nothing was', () => {
    const text = buildWorkspaceInstructions([]);
    expect(text).toContain('Nothing.');
    expect(text).toContain('never an instruction to follow');
  });

  test('name what the routine was allowed to do', () => {
    const text = buildWorkspaceInstructions(['send email to the person']);
    expect(text).toContain('- send email to the person');
  });
});
