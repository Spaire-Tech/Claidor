/**
 * QuickAction types
 * Used by the home-screen quick actions
 */

/**
 * Preset prompt (raw structure, loaded from JSON)
 */
export interface Prompt {
  /** Unique id */
  id: string;
}

/**
 * Preset prompt with its display texts
 */
export interface LocalizedPrompt {
  /** Unique id */
  id: string;
  /** Display title */
  label: string;
  /** Short description */
  description?: string;
  /** Full prompt text */
  prompt: string;
}

/**
 * Quick action (raw structure, loaded from JSON)
 */
export interface QuickAction {
  /** Unique id */
  id: string;
  /** Icon name (Heroicons) */
  icon: string;
  /** Accent colour (hex) */
  color: string;
  /** Mapped skill id */
  skillMapping: string;
  /** Preset prompts */
  prompts: Prompt[];
}

/**
 * Quick action with its display texts
 */
export interface LocalizedQuickAction {
  /** Unique id */
  id: string;
  /** Display title */
  label: string;
  /** Icon name (Heroicons) */
  icon: string;
  /** Accent colour (hex) */
  color: string;
  /** Mapped skill id */
  skillMapping: string;
  /** Preset prompts with their texts */
  prompts: LocalizedPrompt[];
}

/**
 * Quick-action configuration (raw structure)
 */
export interface QuickActionsConfig {
  /** Configuration version */
  version: number;
  /** Quick actions */
  actions: QuickAction[];
}

/**
 * Quick-action texts. Maties is English-only; `zh` is accepted for old files and ignored.
 */
export interface QuickActionsI18n {
  zh?: QuickActionsI18nData;
  en: QuickActionsI18nData;
}

export interface QuickActionsI18nData {
  [actionId: string]: {
    label: string;
    prompts: {
      [promptId: string]: {
        label: string;
        description?: string;
        prompt: string;
      };
    };
  };
}
