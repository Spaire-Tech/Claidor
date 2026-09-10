import '../design/conversation.css';

import React from 'react';
import { useSelector } from 'react-redux';

import type { RootState } from '@/store';
import type { SubagentSessionSummary } from '@/types/cowork';
import { getSubagentDisplayInitial, getSubagentDisplayName } from '@/utils/subagentDisplay';

import { i18nService } from '../../services/i18n';
import AgentAvatarIcon from '../agent/AgentAvatarIcon';
import { StepMark, StepState } from './ToolCallGroup';
import { ToolStepIcon, ToolStepKind } from './toolStepPresentation';

/**
 * A subagent (docs/maties/design.md, « Subagents »): a step whose result
 * card names the agent and opens its own conversation in the right panel.
 * The title, the sub-line with the ring, then one card per agent.
 */
const SubagentSpawnCard: React.FC<{
  subagents: SubagentSessionSummary[];
  onSelectSubagent: (subagent: SubagentSessionSummary) => void;
}> = ({ subagents, onSelectSubagent }) => {
  const agents = useSelector((state: RootState) => state.agent.agents);

  if (subagents.length === 0) return null;

  const anyRunning = subagents.some((subagent) => subagent.status === 'running');
  const anyFailed = subagents.some((subagent) => subagent.status === 'error');
  const state: StepState = anyRunning ? StepState.Running : anyFailed ? StepState.Failed : StepState.Done;
  const first = subagents[0];
  const subline = subagents.length === 1
    ? (first.task ?? getSubagentDisplayName(first, agents))
    : subagents.map((subagent) => getSubagentDisplayName(subagent, agents)).join(', ');

  return (
    <div className="flex flex-col gap-4" data-maties-step="subagents">
      <div className="maties-in-slow flex items-center gap-[13px]">
        <span style={{ color: '#6b7280', display: 'inline-flex' }}>
          <ToolStepIcon kind={ToolStepKind.AgentStart} size={18} />
        </span>
        <span className="maties-step-title">
          {i18nService.t(anyRunning ? 'matiesStepAgentWait' : 'matiesStepAgentStart')}
        </span>
      </div>
      <div className="maties-in-slow flex items-center gap-3">
        <StepMark state={state} />
        <span className="maties-step-sub min-w-0 truncate" style={anyFailed && !anyRunning ? { color: '#e0322d' } : undefined}>
          {anyFailed && !anyRunning ? i18nService.t('matiesStepFailedAgent') : subline}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {subagents.map((subagent) => {
          const displayName = getSubagentDisplayName(subagent, agents);
          const agentIcon = subagent.agentId
            ? agents.find((agent) => agent.id === subagent.agentId)?.icon?.trim()
            : undefined;
          return (
            <button
              key={subagent.id}
              type="button"
              onClick={() => onSelectSubagent(subagent)}
              className="maties-card maties-in-slow group flex items-center gap-3 text-left"
              style={{ alignSelf: 'flex-start', minWidth: 'min(380px, 100%)', maxWidth: '100%' }}
              aria-label={`${displayName} — ${i18nService.t('matiesStepOpenAgent')}`}
            >
              {agentIcon ? (
                <AgentAvatarIcon
                  value={agentIcon}
                  className="h-6 w-6"
                  iconClassName="h-3.5 w-3.5"
                  legacyClassName="text-sm"
                  useDefaultWhenEmpty={false}
                />
              ) : (
                <span
                  className="flex flex-shrink-0 items-center justify-center rounded-full"
                  style={{ width: 22, height: 22, background: '#e8effa', color: '#0060d0', fontSize: 11, fontWeight: 600 }}
                >
                  {getSubagentDisplayInitial(subagent, agents)}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate" style={{ fontSize: 14.5, letterSpacing: '-.01em', color: '#31353b' }}>
                    {displayName}
                  </span>
                  {subagent.status === 'running' && (
                    <span className="maties-shimmer flex-shrink-0" style={{ fontSize: 12.5 }}>
                      {i18nService.t('subagentRunning')}
                    </span>
                  )}
                  {subagent.status === 'error' && (
                    <span className="flex-shrink-0" style={{ fontSize: 12.5, color: '#e0322d' }}>
                      {i18nService.t('subagentFailed')}
                    </span>
                  )}
                  {subagent.status === 'done' && (
                    <span className="flex-shrink-0" style={{ fontSize: 12.5, color: '#1f8a4c' }}>
                      {i18nService.t('subagentCompleted')}
                    </span>
                  )}
                </span>
                {subagent.task && subagents.length > 1 && (
                  <span className="maties-meta mt-0.5 block truncate">
                    {subagent.task}
                  </span>
                )}
              </span>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#c4c8ce" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="9,5 16,12 9,19" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SubagentSpawnCard;
