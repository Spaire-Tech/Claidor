import { LogReporterAction, reportYdAnalyzer } from '../../services/logReporter';
import type { Skill } from '../../types/skill';

type AnalyticsValue = string | number | boolean | null | undefined;
type AnalyticsParams = Record<string, AnalyticsValue>;

export function getSkillSource(skill: Skill): string {
  if (skill.isBuiltIn) return 'built_in';
  if (skill.isOfficial) return 'official';
  return 'custom';
}

export function getInstalledSkillAnalyticsParams(skill: Skill): AnalyticsParams {
  return {
    skillId: skill.id,
    skillName: skill.name,
    skillSource: getSkillSource(skill),
    isBuiltIn: skill.isBuiltIn,
    isOfficial: skill.isOfficial,
    version: skill.version,
  };
}

export function reportSkillAction(
  actionType: string,
  params: AnalyticsParams = {},
): void {
  console.debug('[Skills] reporting analytics action', actionType);
  void reportYdAnalyzer({
    action: LogReporterAction.SkillAction,
    actionType,
    ...params,
  });
}
