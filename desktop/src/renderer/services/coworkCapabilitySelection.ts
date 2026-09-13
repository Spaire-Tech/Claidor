import type { Skill } from '../types/skill';

export interface CoworkCapabilitySelection {
  directSkillIds: string[];
  runtimeSkillIds: string[];
}

export const buildCoworkCapabilitySelection = (
  skillIds: string[],
  skills: Skill[],
): CoworkCapabilitySelection => {
  const resolveRoutableSkillIds = (candidateIds: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const skillId of candidateIds) {
      if (seen.has(skillId)) continue;
      seen.add(skillId);
      const skill = skills.find(item => item.id === skillId);
      if (!skill?.enabled || !skill.skillPath.trim()) continue;
      result.push(skillId);
    }
    return result;
  };

  const directSkillIds = resolveRoutableSkillIds(skillIds);

  return {
    directSkillIds,
    runtimeSkillIds: directSkillIds,
  };
};
