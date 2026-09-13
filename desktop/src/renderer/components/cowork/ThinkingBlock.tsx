import React, { useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkMessage } from '../../types/cowork';
import Shimmer from '../design/Shimmer';
import {
  bucketLength,
  getMessageLineCount,
  reportConversationBlockAction,
} from './conversationAnalytics';
import { formatStepsDuration } from './stepsFold';

/**
 * Thinking (docs/maties/design.md, section 4): « Thinking » in the shimmer,
 * alone, while the model reasons; then « Thought for 4 s » in 13 px muted
 * that opens to the reasoning, folded by default.
 */
const ThinkingBlock: React.FC<{
  message: CoworkMessage;
  mapDisplayText?: (value: string) => string;
  /** When the model moved on: the next item's timestamp, for « Thought for N s ». */
  endTimestamp?: number | null;
  /** 'row' is the same line, inside the opened list of steps. */
  variant?: 'default' | 'row';
  initiallyExpanded?: boolean;
  /** Overrides the message's own streaming flag (the preview has no session). */
  isLive?: boolean;
}> = ({ message, mapDisplayText, endTimestamp, variant = 'default', initiallyExpanded = false, isLive }) => {
  const isCurrentlyStreaming = isLive ?? Boolean(message.metadata?.isStreaming);
  const isRowVariant = variant === 'row';
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);
  const displayContent = mapDisplayText ? mapDisplayText(message.content) : message.content;
  const handleToggleExpanded = () => {
    const nextExpanded = !isExpanded;
    reportConversationBlockAction({
      actionType: nextExpanded ? 'thinking_expand' : 'thinking_collapse',
      blockType: 'thinking',
      params: {
        isStreaming: isCurrentlyStreaming,
        thinkingLength: displayContent.length,
        thinkingLengthBucket: bucketLength(displayContent.length),
        thinkingLineCount: getMessageLineCount(displayContent),
      },
    });
    setIsExpanded(nextExpanded);
  };

  if (isCurrentlyStreaming) {
    return (
      <div className={`flex items-center ${isRowVariant ? 'px-2 py-2' : 'py-0.5'}`} role="status" aria-live="polite">
        <Shimmer text={i18nService.t('matiesThinking')} />
      </div>
    );
  }

  const durationMs = endTimestamp != null && endTimestamp > message.timestamp
    ? endTimestamp - message.timestamp
    : null;
  const label = durationMs != null && durationMs >= 1000
    ? i18nService.t('matiesThoughtFor').replace('{duration}', formatStepsDuration(durationMs))
    : i18nService.t('matiesThought');
  const hasReasoning = displayContent.trim().length > 0;

  return (
    <div className={isRowVariant ? 'px-2' : undefined}>
      <button
        type="button"
        onClick={hasReasoning ? handleToggleExpanded : undefined}
        className={`flex items-center gap-1.5 text-left ${isRowVariant ? 'py-2' : 'py-0.5'} ${hasReasoning ? 'cursor-pointer' : 'cursor-default'}`}
        aria-expanded={hasReasoning ? isExpanded : undefined}
        disabled={!hasReasoning}
      >
        <span className="maties-caption">{label}</span>
        {hasReasoning && (
          <svg
            width={11}
            height={11}
            viewBox="0 0 24 24"
            fill="none"
            stroke="#c4c8ce"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}
            aria-hidden
          >
            <polyline points="9,5 16,12 9,19" />
          </svg>
        )}
      </button>
      {isExpanded && hasReasoning && (
        <div
          className="maties-in max-h-[320px] overflow-y-auto whitespace-pre-wrap pb-2 pr-4"
          style={{ fontSize: 13.5, lineHeight: 1.55, color: '#6b7280', letterSpacing: '-.006em', maxWidth: '74ch' }}
        >
          {displayContent}
        </div>
      )}
    </div>
  );
};

export default ThinkingBlock;
