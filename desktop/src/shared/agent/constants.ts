export const AgentId = {
  Main: 'main',
} as const;

export type AgentId = typeof AgentId[keyof typeof AgentId];

export const AgentIpcChannel = {
  List: 'agents:list',
  Get: 'agents:get',
  Create: 'agents:create',
  Update: 'agents:update',
  Reorder: 'agents:reorder',
  Delete: 'agents:delete',
  CleanupLegacyIdentityBlock: 'agents:cleanupLegacyIdentityBlock',
  Presets: 'agents:presets',
  PresetTemplates: 'agents:presetTemplates',
  AddPreset: 'agents:addPreset',
} as const;

export type AgentIpcChannel = typeof AgentIpcChannel[keyof typeof AgentIpcChannel];

export const AgentLegacyIdentityCleanupStatus = {
  Cleaned: 'cleaned',
  Skipped: 'skipped',
  Failed: 'failed',
} as const;

export type AgentLegacyIdentityCleanupStatus =
  typeof AgentLegacyIdentityCleanupStatus[keyof typeof AgentLegacyIdentityCleanupStatus];

export const AgentLegacyIdentityCleanupSkipReason = {
  NoAgentsMd: 'no-agents-md',
  NoLegacyBlock: 'no-legacy-block',
  LowConfidence: 'low-confidence',
} as const;

export type AgentLegacyIdentityCleanupSkipReason =
  typeof AgentLegacyIdentityCleanupSkipReason[keyof typeof AgentLegacyIdentityCleanupSkipReason];

export type AgentLegacyIdentityCleanupResult =
  | {
      status: typeof AgentLegacyIdentityCleanupStatus.Cleaned;
      backupPath: string;
      removedChars: number;
    }
  | {
      status: typeof AgentLegacyIdentityCleanupStatus.Skipped;
      reason: AgentLegacyIdentityCleanupSkipReason;
    }
  | {
      status: typeof AgentLegacyIdentityCleanupStatus.Failed;
      error: string;
    };

export const LegacyAgentName = {
  Main: 'main',
  /**
   * Upstream's name for the default agent. Every profile created before the
   * rename has this in its `agents` row, so the migration has to recognise
   * it — the row is real data on disk and changing the constant alone would
   * leave existing installs saying "LobsterAI" forever.
   */
  Upstream: 'lobsterai',
  /** The app's own earlier names for the main agent, 13 to 16 September 2026. */
  Faiser: 'faiser',
  Caisra: 'caisra',
} as const;

/**
 * The main agent is Yodo, the Chief of Staff.
 *
 * The founder, 16 September 2026, with the onboarding canvas: *"there is
 * a cloud avatar, who's the chief of staff. his name is yodo. he's the
 * main agent. his job is literally being a chief of staff."* Before that
 * the main agent wore the app's name (Caisra from the 15th, Faiser for two
 * days before); those are legacy names now and existing rows migrate.
 *
 * The face is the canvas's, not one of the twenty-five in
 * `avatars.ts`: its own three stops and `seed: 22`, drawn without the
 * shade the other clouds carry.
 */
export const DefaultAgentProfile = {
  Name: 'Yodo',
  Colors: '#8ec9f0,#a9b8ea,#bfe0f5',
  Seed: 22,
} as const;
