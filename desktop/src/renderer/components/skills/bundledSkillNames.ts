import type { LocalizedText } from '../../types/skill';

/**
 * Display names for the skills bundled with the app
 * (the ones listed in SKILLs/skills.config.json).
 *
 * The skill store ships ids as names, so these give a readable title. Once
 * the server sends `displayName` for a skill, that value wins over this map
 * — see `skillService.getLocalizedSkillName()`.
 *
 * When adding a bundled skill, add its display name here too; a missing entry
 * only means the prettified id is shown.
 */
export const BUNDLED_SKILL_DISPLAY_NAMES: Record<string, LocalizedText> = {
  'canvas-design': { en: 'Canvas Design' },
  'create-plan': { en: 'Create Plan' },
  'develop-web-game': { en: 'Web Game Development' },
  'docx': { en: 'Word Documents' },
  'frontend-design': { en: 'Frontend Design' },
  'imap-smtp-email': { en: 'Email (IMAP/SMTP)' },
  'local-tools': { en: 'Local Tools' },
  'pdf': { en: 'PDF Toolkit' },
  'playwright': { en: 'Playwright' },
  'pptx': { en: 'PowerPoint Slides' },
  'remotion': { en: 'Programmatic Video' },
  'skill-creator': { en: 'Skill Creator' },
  'skill-vetter': { en: 'Skill Vetter' },
  'skin-creator': { en: 'Skin Creator' },
  'weather': { en: 'Weather' },
  'web-search': { en: 'Web Search' },
  'xlsx': { en: 'Excel Spreadsheets' },
};
