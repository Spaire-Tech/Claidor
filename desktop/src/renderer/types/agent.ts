import type { ModelThinkingLevel } from '@shared/providers/modelThinking';

export type AgentSource = 'custom' | 'preset';

export interface Agent {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  identity: string;
  model: string;
  thinkingLevel: ModelThinkingLevel | '';
  workingDirectory: string;
  icon: string;
  skillIds: string[];
  subagentAllowAgentIds: string[];
  enabled: boolean;
  pinned: boolean;
  pinOrder?: number | null;
  sortOrder?: number | null;
  isDefault: boolean;
  source: AgentSource;
  presetId: string;
  createdAt: number;
  updatedAt: number;
  /** The face: 0–24 into `shared/agent/avatars.ts`. Stored, never derived. */
  avatar: number;
  /** "Research, marketing, admin…" — the remit line. */
  label: string;
  /** One of the seven voices, or '' for none yet. */
  voiceId: string;
  /** Whether finishing or needing input raises a desktop notification. */
  notify: boolean;
}

export interface PresetAgent {
  id: string;
  name: string;
  nameEn: string;
  /** The face: 0–24 into `shared/agent/avatars.ts`, the canvas's own for each role. */
  avatar: number;
  icon: string;
  description: string;
  descriptionEn: string;
  identity: string;
  identityEn: string;
  systemPrompt: string;
  systemPromptEn: string;
  skillIds: string[];
  installed?: boolean;
}

export interface CreateAgentRequest {
  id?: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  identity?: string;
  model?: string;
  thinkingLevel?: ModelThinkingLevel | '';
  workingDirectory?: string;
  icon?: string;
  skillIds?: string[];
  subagentAllowAgentIds?: string[];
  source?: string;
  presetId?: string;
}

export interface UpdateAgentRequest {
  name?: string;
  description?: string;
  systemPrompt?: string;
  identity?: string;
  model?: string;
  thinkingLevel?: ModelThinkingLevel | '';
  workingDirectory?: string;
  icon?: string;
  skillIds?: string[];
  subagentAllowAgentIds?: string[];
  enabled?: boolean;
  pinned?: boolean;
  sortOrder?: number | null;
}
