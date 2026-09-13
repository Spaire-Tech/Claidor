import { ipcMain } from 'electron';

import { AgentId } from '../../../shared/agent/constants';
import { OnboardingIpcChannel, type OnboardingProfile } from '../../../shared/onboarding/constants';
import type { AgentManager } from '../../agentManager';
import { applyProfileToWorkspace } from '../../libs/openclawWorkspaceProfile';
import {
  type OnboardingProfileStore,
  readOnboardingProfile,
  storeOnboardingProfile,
  validateOnboardingProfile,
} from './profile';

type SyncOpenClawConfig = (options: {
  reason: string;
  restartGatewayIfRunning?: boolean;
}) => Promise<{
  success: boolean;
  changed: boolean;
  error?: string;
}>;

export interface OnboardingHandlerDeps {
  getStore: () => OnboardingProfileStore;
  getAgentManager: () => AgentManager;
  syncOpenClawConfig: SyncOpenClawConfig;
  /** The main agent's workspace, where the engine keeps its identity files. */
  getMainWorkspacePath: () => string;
  /** The signed-in person's display name, empty when signed out. */
  getPersonName: () => string;
}

export interface OnboardingApplyResult {
  success: boolean;
  error?: string;
}

const ONBOARDING_SYNC_REASON = 'onboarding-profile-applied';

/**
 * Stores the profile, renames the main agent (the engine reads the row's
 * name as its identity) and resyncs the engine config so the name, the
 * voice section and the time zone land before the next conversation.
 */
export async function applyOnboardingProfile(
  profile: OnboardingProfile,
  deps: OnboardingHandlerDeps,
): Promise<void> {
  storeOnboardingProfile(deps.getStore(), profile);

  const renamed = deps.getAgentManager().updateAgent(AgentId.Main, { name: profile.assistantName });
  if (!renamed) {
    // No row yet: the config sync reads the stored name for the main agent instead.
    console.warn('[Onboarding] main agent row not found; the stored name is used for the engine identity');
  }

  // The engine's own first-run questionnaire would ask all this again; the
  // answers go into its identity files and the questionnaire is removed.
  try {
    const written = applyProfileToWorkspace(deps.getMainWorkspacePath(), profile, { name: deps.getPersonName() });
    console.log(`[Onboarding] workspace identity applied: ${JSON.stringify(written)}`);
  } catch (error) {
    console.error('[Onboarding] writing the workspace identity files failed:', error);
  }

  try {
    const result = await deps.syncOpenClawConfig({ reason: ONBOARDING_SYNC_REASON });
    if (!result.success) {
      console.warn(`[Onboarding] config sync after profile apply failed: ${result.error ?? 'unknown error'}`);
    }
  } catch (error) {
    console.error('[Onboarding] config sync after profile apply threw:', error);
  }
}

export function registerOnboardingHandlers(deps: OnboardingHandlerDeps): void {
  ipcMain.handle(OnboardingIpcChannel.GetProfile, async (): Promise<OnboardingProfile> => (
    readOnboardingProfile(deps.getStore())
  ));

  ipcMain.handle(
    OnboardingIpcChannel.ApplyProfile,
    async (_event, payload: unknown): Promise<OnboardingApplyResult> => {
      const validated = validateOnboardingProfile(payload);
      if (validated.ok === false) {
        return { success: false, error: validated.error };
      }
      try {
        await applyOnboardingProfile(validated.profile, deps);
        return { success: true };
      } catch (error) {
        console.error('[Onboarding] failed to apply profile:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to apply the onboarding profile',
        };
      }
    },
  );
}
