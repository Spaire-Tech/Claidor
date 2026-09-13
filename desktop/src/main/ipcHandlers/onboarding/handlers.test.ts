import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, test, vi } from 'vitest';

import { AgentId } from '../../../shared/agent/constants';
import { AssistantVoice, OnboardingStoreKey } from '../../../shared/onboarding/constants';
import type { AgentManager } from '../../agentManager';
import { applyOnboardingProfile, type OnboardingHandlerDeps } from './handlers';
import type { OnboardingProfileStore } from './profile';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}));

const createDeps = (options: { hasMainRow?: boolean; syncSucceeds?: boolean } = {}) => {
  const data = new Map<string, unknown>();
  const store: OnboardingProfileStore = {
    get: <T,>(key: string) => data.get(key) as T | undefined,
    set: (key, value) => {
      data.set(key, value);
    },
  };
  const updateAgent = vi.fn((id: string, updates: { name?: string }) => (
    options.hasMainRow === false ? null : { id, name: updates.name }
  ));
  const syncOpenClawConfig = vi.fn(async () => ({
    success: options.syncSucceeds !== false,
    changed: true,
    ...(options.syncSucceeds === false ? { error: 'gateway busy' } : {}),
  }));
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maties-onboarding-'));
  fs.writeFileSync(path.join(workspaceDir, 'BOOTSTRAP.md'), '# Bootstrap\n');
  const deps: OnboardingHandlerDeps = {
    getStore: () => store,
    getAgentManager: () => ({ updateAgent } as unknown as AgentManager),
    syncOpenClawConfig,
    getMainWorkspacePath: () => workspaceDir,
    getPersonName: () => 'Eva Martin',
  };
  return { data, deps, updateAgent, syncOpenClawConfig, workspaceDir };
};

describe('applyOnboardingProfile', () => {
  test('stores the profile, renames the main agent and resyncs the engine', async () => {
    const { data, deps, updateAgent, syncOpenClawConfig } = createDeps();

    await applyOnboardingProfile(
      { assistantName: 'Juno', voice: AssistantVoice.Warm, timezone: 'Europe/Paris' },
      deps,
    );

    expect(data.get(OnboardingStoreKey.AssistantName)).toBe('Juno');
    expect(data.get(OnboardingStoreKey.AssistantVoice)).toBe(AssistantVoice.Warm);
    expect(data.get(OnboardingStoreKey.Timezone)).toBe('Europe/Paris');
    expect(updateAgent).toHaveBeenCalledWith(AgentId.Main, { name: 'Juno' });
    expect(syncOpenClawConfig).toHaveBeenCalledWith({ reason: 'onboarding-profile-applied' });
  });

  test('writes the engine identity files and removes its questionnaire', async () => {
    const { deps, workspaceDir } = createDeps();

    await applyOnboardingProfile(
      { assistantName: 'Juno', voice: AssistantVoice.Warm, timezone: 'Europe/Paris' },
      deps,
    );

    expect(fs.existsSync(path.join(workspaceDir, 'BOOTSTRAP.md'))).toBe(false);
    expect(fs.readFileSync(path.join(workspaceDir, 'IDENTITY.md'), 'utf8')).toContain('- **Name:** Juno');
    expect(fs.readFileSync(path.join(workspaceDir, 'USER.md'), 'utf8')).toContain('- **Name:** Eva Martin');
    expect(fs.readFileSync(path.join(workspaceDir, 'SOUL.md'), 'utf8')).toContain('You are Juno');
  });

  test('keeps the stored profile when the main agent has no row yet', async () => {
    const { data, deps, syncOpenClawConfig } = createDeps({ hasMainRow: false });

    await applyOnboardingProfile(
      { assistantName: 'Pip', voice: AssistantVoice.Direct, timezone: 'UTC' },
      deps,
    );

    expect(data.get(OnboardingStoreKey.AssistantName)).toBe('Pip');
    expect(syncOpenClawConfig).toHaveBeenCalledTimes(1);
  });

  test('does not fail the apply when the engine sync fails', async () => {
    const { data, deps } = createDeps({ syncSucceeds: false });

    await expect(applyOnboardingProfile(
      { assistantName: 'Sable', voice: AssistantVoice.Sassy, timezone: 'UTC' },
      deps,
    )).resolves.toBeUndefined();

    expect(data.get(OnboardingStoreKey.AssistantName)).toBe('Sable');
  });
});
