/**
 * Skill management tabs.
 *
 * The Market tab is gone — it was a shop with nothing in it, and it was the
 * tab this screen opened on. Skills now opens on the skills the person has.
 */
export const SkillTab = {
  Mine: 'mine',
  BuiltIn: 'builtIn',
} as const;
export type SkillTab = typeof SkillTab[keyof typeof SkillTab];

export const SKILL_TAB_ORDER: readonly SkillTab[] = [SkillTab.Mine, SkillTab.BuiltIn];

export const SKILL_TAB_LABEL_KEYS: Record<SkillTab, string> = {
  [SkillTab.Mine]: 'skillGroupMine',
  [SkillTab.BuiltIn]: 'skillGroupBuiltIn',
};
