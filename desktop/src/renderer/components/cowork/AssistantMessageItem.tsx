import '../design/conversation.css';

import React, { useCallback, useEffect, useState } from 'react';

import {
  type CoworkGoal,
  formatCoworkGoalCompletionDuration,
} from '../../../shared/cowork/goal';
import { i18nService } from '../../services/i18n';
import type { CoworkMessage, CoworkMessageMetadata } from '../../types/cowork';
import { formatTokenCount } from '../../utils/tokenFormat';
import GoalIcon from '../icons/GoalIcon';
import MessageForkIcon from '../icons/MessageForkIcon';
import MarkdownContent, { MarkdownVariant } from '../MarkdownContent';
import { reportConversationMessageAction } from './conversationAnalytics';
import ImagePreviewModal, { type ImagePreviewSource } from './ImagePreviewModal';
import { MessageActionButton, MessageCopyButton } from './MessageActionButton';
import { MEDIA_TOKEN_DISPLAY_RE } from './messageDisplayUtils';
import ProposedPlanBlock from './ProposedPlanBlock';
import { parseProposedPlanBlock } from './proposedPlanParser';

export { MessageCopyButton as CopyButton } from './MessageActionButton';

const RetryIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.9}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M20 12a8 8 0 1 1-2.6-5.9" />
    <polyline points="20,4 20,9.5 14.5,9.5" />
  </svg>
);

/** The token figures the app already computes for a turn, in plain words. */
export const formatTurnTokens = (metadata?: CoworkMessageMetadata | null): string | null => {
  const usage = metadata?.usage;
  if (!usage) return null;
  const input = typeof usage.inputTokens === 'number' ? usage.inputTokens : null;
  const output = typeof usage.outputTokens === 'number' ? usage.outputTokens : null;
  if (input == null && output == null) return null;
  return i18nService.t('matiesTurnTokens')
    .replace('{input}', formatTokenCount(input ?? 0))
    .replace('{output}', formatTokenCount(output ?? 0));
};

// ── AssistantMessageItem ─────────────────────────────────────────────────────

/**
 * The answer (docs/maties/design.md, section 4): Newsreader prose with the
 * markdown the app renders, the stream while it arrives, and under it, on
 * hover, copy, fork, retry and the token figures in 12.5 px muted.
 */
const AssistantMessageItem: React.FC<{
  message: CoworkMessage;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  mapDisplayText?: (value: string) => string;
  /** Draw the hover row under the answer (the last answer of a turn). */
  showCopyButton?: boolean;
  onFork?: (messageId: string) => void;
  onRetry?: () => void;
  turnMetadata?: CoworkMessageMetadata | null;
  completedGoal?: CoworkGoal | null;
  planConfirmationMessageId?: string | null;
  onConfirmPlan?: (messageId: string) => void;
  onAdjustPlan?: (messageId: string) => void;
  forceSearchExpanded?: boolean;
  /** True while this message is still arriving. */
  streaming?: boolean;
  /** Files the turn touched, for the chips in the prose. */
  knownFiles?: string[];
}> = ({
  message,
  resolveLocalFilePath,
  mapDisplayText,
  showCopyButton = false,
  onFork,
  onRetry,
  turnMetadata,
  completedGoal,
  planConfirmationMessageId,
  onConfirmPlan,
  onAdjustPlan,
  forceSearchExpanded = false,
  streaming = false,
  knownFiles,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [expandedImage, setExpandedImage] = useState<ImagePreviewSource | null>(null);
  const rawContent = mapDisplayText ? mapDisplayText(message.content) : message.content;
  const proposedPlan = parseProposedPlanBlock(rawContent);
  const displayContent = proposedPlan.visibleText.replace(MEDIA_TOKEN_DISPLAY_RE, '').trimEnd();
  const copyContent = [
    displayContent,
    proposedPlan.planText,
  ].filter((part): part is string => Boolean(part)).join('\n\n');
  const tokensLabel = formatTurnTokens(turnMetadata);
  const goalCompletionDuration = completedGoal
    ? formatCoworkGoalCompletionDuration(completedGoal)
    : null;
  const goalCompletionLabel = goalCompletionDuration
    ? i18nService.t('coworkGoalCompletedIn').replace('{duration}', goalCompletionDuration)
    : null;
  const metaVisible = isHovered || !!goalCompletionLabel;
  const showPlanConfirmationActions = planConfirmationMessageId === message.id;
  const handleImageClick = useCallback((image: ImagePreviewSource) => {
    reportConversationMessageAction({
      actionType: 'open_message_image',
      message,
      params: {
        messageRole: 'assistant',
      },
    });
    setExpandedImage(image);
  }, [message]);
  useEffect(() => {
    if (!proposedPlan.didNormalizePlanText) return;
    window.electron?.log?.fromRenderer?.(
      'debug',
      'AssistantMessageItem',
      `Normalized inline section labels in proposed plan ${message.id}.`,
    );
  }, [message.id, proposedPlan.didNormalizePlanText]);
  useEffect(() => {
    if (!proposedPlan.ignoredInlineOpenTagCount) return;
    window.electron?.log?.fromRenderer?.(
      'debug',
      'AssistantMessageItem',
      `Ignored ${proposedPlan.ignoredInlineOpenTagCount} inline proposed plan tag mention(s) before block in message ${message.id}.`,
    );
  }, [message.id, proposedPlan.ignoredInlineOpenTagCount]);
  const handleBlur = useCallback((event: React.FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    setIsHovered(false);
  }, []);
  const handleMouseLeave = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (document.activeElement instanceof HTMLElement && event.currentTarget.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    setIsHovered(false);
  }, []);

  const metaRow = showCopyButton && (
    <div
      className={`maties-meta mt-2 flex min-h-[28px] items-center gap-1 select-none transition-opacity duration-200 ${
        metaVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      aria-hidden={!metaVisible}
      data-cowork-search-exclude="true"
    >
      <MessageCopyButton
        content={copyContent}
        onCopy={(result) => reportConversationMessageAction({
          actionType: 'copy_message',
          message,
          params: {
            result,
            copySource: 'assistant_message',
            copiedLength: copyContent.length,
          },
        })}
        visible={isHovered}
      />
      {onFork && (
        <MessageActionButton
          label={i18nService.t('matiesTurnFork')}
          visible={isHovered}
          onClick={(event) => {
            event.stopPropagation();
            reportConversationMessageAction({ actionType: 'fork_from_assistant_message', message });
            onFork(message.id);
          }}
        >
          <MessageForkIcon className="h-4 w-4" />
        </MessageActionButton>
      )}
      {onRetry && (
        <MessageActionButton
          label={i18nService.t('matiesTurnRetry')}
          visible={isHovered}
          onClick={(event) => {
            event.stopPropagation();
            onRetry();
          }}
        >
          <RetryIcon className="h-4 w-4" />
        </MessageActionButton>
      )}
      {tokensLabel && <span className="ml-1.5 tabular-nums">{tokensLabel}</span>}
      {goalCompletionLabel && (
        <span className="ml-1.5 inline-flex items-center gap-1" style={{ color: '#1f8a4c' }}>
          <GoalIcon className="h-3.5 w-3.5" />
          <span>{goalCompletionLabel}</span>
        </span>
      )}
    </div>
  );

  return (
    <div
      className="relative focus:outline-none"
      data-cowork-assistant-message-id={message.id}
      data-cowork-search-message-id={message.id}
      tabIndex={showCopyButton ? 0 : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsHovered(true)}
      onBlur={handleBlur}
    >
      <div>
        {displayContent && (
          <MarkdownContent
            content={displayContent}
            variant={MarkdownVariant.Answer}
            className="max-w-none"
            resolveLocalFilePath={resolveLocalFilePath}
            forceExpanded={forceSearchExpanded}
            onImageClick={handleImageClick}
            streaming={streaming}
            knownFiles={knownFiles}
          />
        )}
        {proposedPlan.planText && (
          <div className={displayContent ? 'mt-4' : undefined}>
            <ProposedPlanBlock
              content={proposedPlan.planText}
              resolveLocalFilePath={resolveLocalFilePath}
              onImageClick={handleImageClick}
              showConfirmationActions={showPlanConfirmationActions}
              onConfirmExecution={showPlanConfirmationActions ? () => onConfirmPlan?.(message.id) : undefined}
              onAdjustPlan={showPlanConfirmationActions ? () => onAdjustPlan?.(message.id) : undefined}
              forceExpanded={forceSearchExpanded}
            />
          </div>
        )}
        {metaRow}
      </div>
      <ImagePreviewModal image={expandedImage} onClose={() => setExpandedImage(null)} />
    </div>
  );
};

export default AssistantMessageItem;
