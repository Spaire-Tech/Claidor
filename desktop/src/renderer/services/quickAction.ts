import type { LocalizedQuickAction, Prompt, QuickAction, QuickActionsConfig, QuickActionsI18n } from '../types/quickAction';
import { i18nService } from './i18n';

const CONFIG_PATH = './quick-actions.json';
const I18N_PATH = './quick-actions-i18n.json';

class QuickActionService {
  private config: QuickActionsConfig | null = null;
  private i18nData: QuickActionsI18n | null = null;
  private listeners = new Set<() => void>();

  /**
   * Load the quick-action configuration
   */
  async loadConfig(): Promise<QuickActionsConfig> {
    if (this.config) {
      return this.config;
    }

    try {
      const response = await fetch(CONFIG_PATH);
      if (!response.ok) {
        throw new Error(`Failed to load quick actions config: ${response.status}`);
      }
      const data = await response.json();
      this.config = data as QuickActionsConfig;
      return this.config;
    } catch (error) {
      console.error('Failed to load quick actions config:', error);
      // Fall back to an empty configuration
      return { version: 1, actions: [] };
    }
  }

  /**
   * Load the quick-action texts
   */
  async loadI18n(): Promise<QuickActionsI18n> {
    if (this.i18nData) {
      return this.i18nData;
    }

    try {
      const response = await fetch(I18N_PATH);
      if (!response.ok) {
        throw new Error(`Failed to load quick actions i18n: ${response.status}`);
      }
      const data = await response.json();
      this.i18nData = data as QuickActionsI18n;
      return this.i18nData;
    } catch (error) {
      console.error('Failed to load quick actions i18n:', error);
      // Fall back to empty texts
      return { en: {} };
    }
  }

  /**
   * All quick actions, with their texts
   */
  async getLocalizedActions(): Promise<LocalizedQuickAction[]> {
    const config = await this.loadConfig();
    const i18nData = await this.loadI18n();
    const language = i18nService.getLanguage();

    return config.actions.map(action => {
      const actionI18n = i18nData[language]?.[action.id];

      return {
        ...action,
        label: actionI18n?.label || action.id,
        prompts: action.prompts.map(prompt => {
          const promptI18n = actionI18n?.prompts?.[prompt.id];

          return {
            id: prompt.id,
            label: promptI18n?.label || prompt.id,
            description: promptI18n?.description,
            prompt: promptI18n?.prompt || ''
          };
        })
      };
    });
  }

  /**
   * All quick actions (raw data)
   */
  async getActions(): Promise<QuickAction[]> {
    const config = await this.loadConfig();
    return config.actions;
  }

  /**
   * A quick action by id, with its texts
   */
  async getLocalizedActionById(id: string): Promise<LocalizedQuickAction | undefined> {
    const actions = await this.getLocalizedActions();
    return actions.find(action => action.id === id);
  }

  /**
   * A quick action by id (raw data)
   */
  async getActionById(id: string): Promise<QuickAction | undefined> {
    const actions = await this.getActions();
    return actions.find(action => action.id === id);
  }

  /**
   * A prompt by actionId and promptId (raw data)
   */
  async getPrompt(actionId: string, promptId: string): Promise<Prompt | undefined> {
    const action = await this.getActionById(actionId);
    if (!action) return undefined;
    return action.prompts.find(prompt => prompt.id === promptId);
  }

  /**
   * The quick action mapped to a skill, with its texts
   */
  async getLocalizedActionBySkillMapping(skillMapping: string): Promise<LocalizedQuickAction | undefined> {
    const actions = await this.getLocalizedActions();
    return actions.find(action => action.skillMapping === skillMapping);
  }

  /**
   * The quick action mapped to a skill (raw data)
   */
  async getActionBySkillMapping(skillMapping: string): Promise<QuickAction | undefined> {
    const actions = await this.getActions();
    return actions.find(action => action.skillMapping === skillMapping);
  }

  /**
   * Subscribe to reloads
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify every subscriber
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener());
  }

  /**
   * Clear the cache (forces a reload)
   */
  clearCache(): void {
    this.config = null;
    this.i18nData = null;
    this.notifyListeners();
  }

  /**
   * Initialise the service (reload when the i18n service changes)
   */
  initialize(): void {
    // Reload when the i18n service signals a change
    i18nService.subscribe(() => {
      this.clearCache();
    });
  }
}

export const quickActionService = new QuickActionService();
