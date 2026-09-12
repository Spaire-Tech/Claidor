import '../design/conversation.css';

import { CheckIcon } from '@heroicons/react/24/outline';
import Lottie from 'lottie-react';
import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';

import mediaGeneratingAnimation from '../../assets/lottie/media-generating.json';
import { i18nService } from '../../services/i18n';
import { selectIsStreaming } from '../../store/selectors/coworkSelectors';
import { APPROVAL_SLOT_TURN, useApprovalSlotOccupied, useApprovalSlotRef } from '../design/approvalSlots';
import {
  bucketLength,
  getMessageLineCount,
  reportConversationBlockAction,
} from './conversationAnalytics';
import DiffView, { extractDiffFromToolInput } from './DiffView';
import {
  formatElapsedDuration,
  formatToolInput,
  getRetainedMediaPollCount,
  getToolDisplayName,
  getToolResultCollapsedDisplay,
  getToolResultDisplay,
  hasText,
  isBashLikeToolName,
  isMediaGenerateRunning,
  isMediaStatusPoll,
  isMediaStatusPollRunning,
  isTodoWriteToolName,
  normalizeToolName,
  type ParsedTodoItem,
  parseMediaStreamingInfo,
  parseTodoWriteItems,
  type TodoStatus,
  type ToolGroupItem,
} from './messageDisplayUtils';
import StepResultCard from './StepResultCard';
import {
  getToolStepFailureText,
  getToolStepKind,
  getToolStepResult,
  getToolStepSubline,
  getToolStepTitle,
  ToolStepIcon,
} from './toolStepPresentation';

// ── TodoWriteInputView ───────────────────────────────────────────────────────

const TodoWriteInputView: React.FC<{ items: ParsedTodoItem[] }> = ({ items }) => {
  const getStatusCheckboxClass = (status: TodoStatus): string => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 border-green-500 text-green-500';
      case 'in_progress':
        return 'bg-transparent border-blue-500';
      case 'pending':
      case 'unknown':
      default:
        return 'bg-transparent border-border';
    }
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={`todo-item-${index}`}
          className="flex items-start gap-2"
        >
          <span className={`mt-0.5 h-4 w-4 rounded-[4px] border flex-shrink-0 inline-flex items-center justify-center ${getStatusCheckboxClass(item.status)}`}>
            {item.status === 'completed' && <CheckIcon className="h-3 w-3 stroke-[2.5]" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className={`text-xs whitespace-pre-wrap break-words leading-5 ${
              item.status === 'completed'
                ? 'text-muted'
                : 'text-foreground'
            }`}>
              {item.primaryText}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ── The step's mark: a ring turning, a tick, or a red ring ───────────────────

export const StepState = {
  Running: 'running',
  Done: 'done',
  Failed: 'failed',
} as const;
export type StepState = typeof StepState[keyof typeof StepState];

export const StepMark: React.FC<{ state: StepState; size?: number }> = ({ state, size = 15 }) => {
  if (state === StepState.Done) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#1f8a4c"
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flex: `0 0 ${size}px` }}
        aria-hidden
      >
        <circle cx="12" cy="12" r="9.4" />
        <polyline points="7.9,12.5 10.8,15.4 16.3,9.2" />
      </svg>
    );
  }
  return (
    <span
      className={state === StepState.Failed ? 'maties-ring-red' : 'maties-ring'}
      style={{ flex: `0 0 ${size}px`, width: size, height: size }}
      aria-hidden
    />
  );
};

const Chevron: React.FC<{ open: boolean; size?: number }> = ({ open, size = 13 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: `0 0 ${size}px`, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}
    aria-hidden
  >
    <polyline points="9,5 16,12 9,19" />
  </svg>
);

// ── ToolCallGroup ────────────────────────────────────────────────────────────

// Live elapsed time for a running tool call; appears after a short delay so
// quick calls don't flash a counter.
const TOOL_ELAPSED_APPEAR_DELAY_MS = 2000;

const ToolRunningElapsed: React.FC<{ startTimestamp: number }> = ({ startTimestamp }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  const elapsedMs = now - startTimestamp;
  if (elapsedMs < TOOL_ELAPSED_APPEAR_DELAY_MS) return null;
  return <span className="tabular-nums"> · {formatElapsedDuration(elapsedMs)}</span>;
};

export const ToolCallVariant = {
  /** The live step: title, sub-line with the ring, the result card. */
  Step: 'step',
  /** A row inside the opened list of steps. */
  Row: 'row',
} as const;
export type ToolCallVariant = typeof ToolCallVariant[keyof typeof ToolCallVariant];

const ToolCallGroup: React.FC<{
  group: ToolGroupItem;
  mapDisplayText?: (value: string) => string;
  retainedMediaPollCounts?: Map<string, number>;
  footer?: React.ReactNode;
  variant?: ToolCallVariant;
  /** Start expanded (row variant): single-step groups reveal their detail in one click. */
  initiallyExpanded?: boolean;
  /** Overrides the session's streaming flag (the preview has no session). */
  isLive?: boolean;
  /** Step variant: draw the result card under the sub-line. */
  showResultCard?: boolean;
  /** Called when a subagent result card is opened. */
  onOpenAgent?: () => void;
}> = ({
  group,
  mapDisplayText,
  retainedMediaPollCounts,
  footer,
  variant = ToolCallVariant.Step,
  initiallyExpanded = false,
  isLive,
  showResultCard = true,
  onOpenAgent,
}) => {
  const { toolUse, toolResult } = group;
  const isRowVariant = variant === ToolCallVariant.Row;
  const shouldExpandByDefault = isMediaStatusPoll(group) || (isRowVariant && initiallyExpanded);
  const sessionStreaming = useSelector(selectIsStreaming);
  const isSessionStreaming = isLive ?? sessionStreaming;
  const rawToolName = typeof toolUse.metadata?.toolName === 'string' ? toolUse.metadata.toolName : 'Tool';
  const toolName = getToolDisplayName(rawToolName);
  const toolInput = toolUse.metadata?.toolInput;
  const isTodoWriteTool = isTodoWriteToolName(rawToolName);
  const todoItems = isTodoWriteTool ? parseTodoWriteItems(toolInput) : null;
  const mapText = useMemo(() => mapDisplayText ?? ((value: string) => value), [mapDisplayText]);
  const toolInputDisplayRaw = formatToolInput(rawToolName, toolInput);
  const toolInputDisplay = toolInputDisplayRaw ? mapText(toolInputDisplayRaw) : null;
  const [isExpanded, setIsExpanded] = useState(shouldExpandByDefault);
  const collapsedToolResult = useMemo(
    () => toolResult ? getToolResultCollapsedDisplay(toolResult) : null,
    [toolResult],
  );
  const toolResultDisplayRaw = useMemo(
    () => toolResult && isExpanded ? getToolResultDisplay(toolResult) : '',
    [isExpanded, toolResult],
  );
  const toolResultDisplay = toolResultDisplayRaw ? mapText(toolResultDisplayRaw) : '';
  const hasExpandedToolResultText = hasText(toolResultDisplay);
  const hasToolResultText = isExpanded
    ? hasExpandedToolResultText
    : Boolean(collapsedToolResult?.hasText);
  const isToolError = Boolean(toolResult?.metadata?.isError || toolResult?.metadata?.error);
  const showNoDetailError = isToolError && !hasToolResultText;
  const toolResultFallback = showNoDetailError ? i18nService.t('coworkToolNoErrorDetail') : '';
  const displayToolResult = hasExpandedToolResultText ? toolResultDisplay : toolResultFallback;

  const isBashTool = isBashLikeToolName(rawToolName);

  const diffDataList = useMemo(
    () => extractDiffFromToolInput(rawToolName, toolInput as Record<string, unknown> | undefined),
    [rawToolName, toolInput],
  );
  const isEditWithDiff = diffDataList !== null && diffDataList.length > 0;

  // The step in plain words.
  const stepKind = getToolStepKind(rawToolName);
  const stepTitle = getToolStepTitle(stepKind);
  const stepSublineRaw = getToolStepSubline(rawToolName, toolInput as Record<string, unknown> | undefined);
  const stepSubline = stepSublineRaw ? mapText(stepSublineRaw) : null;
  const stepResult = useMemo(() => getToolStepResult(group, mapText), [group, mapText]);
  const isRunning = !toolResult
    || isMediaGenerateRunning(group)
    || isMediaStatusPollRunning(group);
  const stepState: StepState = isToolError
    ? StepState.Failed
    : (isRunning && isSessionStreaming ? StepState.Running : StepState.Done);
  // Where a run of identical failures folded into this card, the sub-line
  // carries the whole run: what failed, and that it tried more than once
  // before changing approach.
  const stepSublineText = stepState === StepState.Failed
    ? getToolStepFailureText(stepKind, group.repeatedFailure)
    : stepSubline;

  // The approval card, when this step needs the person's yes, sits where
  // the result card would be.
  const toolUseId = typeof toolUse.metadata?.toolUseId === 'string' ? toolUse.metadata.toolUseId : null;
  const slotKey = stepState === StepState.Running && !isRowVariant ? (toolUseId ?? toolUse.id) : null;
  const approvalSlotRef = useApprovalSlotRef<HTMLDivElement>(slotKey);
  const approvalOccupied = useApprovalSlotOccupied([toolUseId, toolUse.id]);
  // A request raised without a tool-use id (a question from the assistant)
  // lands in the turn's own slot, which sits directly under the live step:
  // it is still this step's card.
  const turnApprovalOccupied = useApprovalSlotOccupied([APPROVAL_SLOT_TURN]);
  // While the step holds a card, the card is the state: no ring, no
  // « Running », no skeleton waiting for a result that is not coming.
  const holdsApprovalCard = !isRowVariant
    && (approvalOccupied || (stepState === StepState.Running && turnApprovalOccupied));

  const reportToolToggle = (nextExpanded: boolean) => {
    const resultLength = toolResultDisplayRaw.length || collapsedToolResult?.text?.length || 0;
    reportConversationBlockAction({
      actionType: nextExpanded ? 'tool_expand' : 'tool_collapse',
      blockType: 'tool',
      params: {
        toolName: rawToolName,
        displayToolName: toolName,
        hasResult: Boolean(toolResult),
        hasResultText: Boolean(collapsedToolResult?.hasText || hasExpandedToolResultText),
        isError: isToolError,
        isStreaming: isSessionStreaming,
        resultLengthBucket: bucketLength(resultLength),
        resultLineCount: getMessageLineCount(toolResultDisplayRaw || collapsedToolResult?.text || ''),
        isBashTool,
        isTodoWriteTool,
        isEditWithDiff,
      },
    });
  };

  const handleToggle = () => {
    const nextExpanded = !isExpanded;
    reportToolToggle(nextExpanded);
    setIsExpanded(nextExpanded);
  };

  const renderMediaRunningIndicators = (containerClass: string) => (
    <>
      {isMediaGenerateRunning(group) && isSessionStreaming && (() => {
        const streamingInfo = parseMediaStreamingInfo(group);
        const pollCount = streamingInfo.pollCount ?? getRetainedMediaPollCount(streamingInfo, retainedMediaPollCounts);
        return (
          <div className={`${containerClass} flex items-center gap-2`}>
            <Lottie
              animationData={mediaGeneratingAnimation}
              loop
              autoplay
              style={{ width: 36, height: 36 }}
            />
            <span className="text-sm font-medium text-secondary">
              {i18nService.t('mediaGeneratingVideo')}
            </span>
            {pollCount != null && (
              <span className="maties-caption">
                {i18nService.t('mediaStatusQueryCount').replace('{count}', String(pollCount))}
              </span>
            )}
          </div>
        );
      })()}
      {isMediaStatusPollRunning(group) && isSessionStreaming && (() => {
        const streamingInfo = parseMediaStreamingInfo(group);
        const pollCount = streamingInfo.pollCount ?? getRetainedMediaPollCount(streamingInfo, retainedMediaPollCounts);
        const mediaToolName = group.toolUse.metadata?.toolName || '';
        const isVideo = normalizeToolName(mediaToolName) === 'matiesvideogenerate';
        return (
          <div className={`${containerClass} flex items-center gap-2 flex-wrap`}>
            <Lottie
              animationData={mediaGeneratingAnimation}
              loop
              autoplay
              style={{ width: 36, height: 36 }}
            />
            <span className="text-sm font-medium text-secondary">
              {i18nService.t(isVideo ? 'mediaGeneratingVideo' : 'mediaGeneratingImage')}
            </span>
            {pollCount != null && (
              <span className="maties-caption">
                {i18nService.t('mediaStatusQueryCount').replace('{count}', String(pollCount))}
              </span>
            )}
          </div>
        );
      })()}
    </>
  );

  // Every detail the step can show: the command and its output, the diff,
  // the plan, the raw input and result. Reachable inside the opened step.
  const renderDetailBody = () => (
    <>
      {isBashTool ? (
        <div className="maties-inset overflow-hidden">
          <div className="max-h-72 overflow-y-auto px-4 py-3 maties-mono" style={{ fontSize: 12.5, lineHeight: 1.55 }}>
            {toolInputDisplay && (
              <div style={{ color: '#1c1f23' }}>
                <span className="select-none" style={{ color: '#8f96a0' }}>$ </span>
                <span className="whitespace-pre-wrap break-words">{toolInputDisplay}</span>
              </div>
            )}
            {toolResult && (hasToolResultText || showNoDetailError) && (
              <div
                className="mt-1.5 whitespace-pre-wrap break-words"
                style={{ color: isToolError ? '#e0322d' : hasToolResultText ? '#4a4f57' : '#8f96a0', fontStyle: hasToolResultText || isToolError ? 'normal' : 'italic' }}
              >
                {displayToolResult}
              </div>
            )}
            {!toolResult && (
              <div className="mt-1.5 italic" style={{ color: '#8f96a0' }}>
                {i18nService.t('coworkToolRunning')}
              </div>
            )}
          </div>
        </div>
      ) : isTodoWriteTool && todoItems ? (
        <TodoWriteInputView items={todoItems} />
      ) : isEditWithDiff && diffDataList ? (
        <div className="space-y-2">
          {diffDataList.map((diff, idx) => (
            <DiffView
              key={idx}
              oldStr={diff.oldStr}
              newStr={diff.newStr}
              filePath={diff.filePath}
            />
          ))}
          {toolResult && (hasToolResultText || showNoDetailError) && (
            <div>
              <div className="maties-meta mb-1">{i18nService.t('coworkToolResult')}</div>
              <div className="maties-inset max-h-32 overflow-y-auto px-4 py-3">
                <pre
                  className="maties-mono whitespace-pre-wrap break-words"
                  style={{ fontSize: 12.5, lineHeight: 1.55, color: isToolError ? '#e0322d' : hasToolResultText ? '#1c1f23' : '#8f96a0' }}
                >
                  {displayToolResult}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {toolInputDisplay && (
            <div>
              <div className="maties-meta mb-1">{i18nService.t('coworkToolInput')}</div>
              <div className="maties-inset max-h-48 overflow-y-auto px-4 py-3">
                <pre className="maties-mono whitespace-pre-wrap break-words" style={{ fontSize: 12.5, lineHeight: 1.55, color: '#1c1f23' }}>
                  {toolInputDisplay}
                </pre>
              </div>
            </div>
          )}
          {toolResult && (hasToolResultText || showNoDetailError) && (
            <div>
              <div className="maties-meta mb-1">{i18nService.t('coworkToolResult')}</div>
              <div className="maties-inset max-h-64 overflow-y-auto px-4 py-3">
                <pre
                  className="maties-mono whitespace-pre-wrap break-words"
                  style={{ fontSize: 12.5, lineHeight: 1.55, color: isToolError ? '#e0322d' : hasToolResultText ? '#1c1f23' : '#8f96a0' }}
                >
                  {displayToolResult}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  if (isRowVariant) {
    return (
      <div data-maties-step-row={toolUse.id}>
        <button
          type="button"
          onClick={handleToggle}
          className="maties-row-hover flex w-full items-center gap-3 px-2 py-2 text-left"
          aria-expanded={isExpanded}
        >
          <StepMark state={stepState} size={14} />
          <span style={{ color: '#6b7280', display: 'inline-flex' }}>
            <ToolStepIcon kind={stepKind} size={16} />
          </span>
          <span className="flex-shrink-0" style={{ fontSize: 14, fontWeight: 500, letterSpacing: '-.01em', color: '#31353b' }}>
            {stepTitle}
          </span>
          {stepSublineText && (
            <span className="min-w-0 truncate" style={{ fontSize: 13, color: stepState === StepState.Failed ? '#e0322d' : '#9aa1ab' }}>
              {stepSublineText}
            </span>
          )}
          {stepState === StepState.Running && (
            <span className="maties-meta flex-shrink-0">
              <ToolRunningElapsed startTimestamp={toolUse.timestamp} />
            </span>
          )}
          <span className="ml-auto" style={{ color: '#c4c8ce' }}>
            <Chevron open={isExpanded} size={12} />
          </span>
        </button>
        {footer && (
          <div className="px-2 pb-3">
            {footer}
          </div>
        )}
        {renderMediaRunningIndicators('px-2 pb-2')}
        {isExpanded && (
          <div className="maties-in flex flex-col gap-3 pb-3 pl-[50px] pr-2">
            {stepResult && (
              <StepResultCard result={stepResult} failed={stepState === StepState.Failed} onOpenAgent={onOpenAgent} />
            )}
            {renderDetailBody()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" data-maties-step={toolUse.id}>
      <button
        type="button"
        onClick={handleToggle}
        className="maties-in-slow flex max-w-full items-center gap-[13px] text-left"
        aria-expanded={isExpanded}
        title={i18nService.t('matiesStepDetails')}
      >
        <span style={{ color: '#6b7280', display: 'inline-flex' }}>
          <ToolStepIcon kind={stepKind} size={18} />
        </span>
        <span className="maties-step-title min-w-0 truncate">{stepTitle}</span>
        <span className="maties-hover-reveal" style={{ color: '#c4c8ce', display: 'inline-flex' }}>
          <Chevron open={isExpanded} />
        </span>
      </button>
      {!holdsApprovalCard && (
        <div key={stepSublineText ?? stepState} className="maties-in-slow flex items-center gap-3">
          <StepMark state={stepState} />
          <span className="maties-step-sub min-w-0 truncate" style={stepState === StepState.Failed ? { color: '#e0322d' } : undefined}>
            {stepSublineText ?? (stepState === StepState.Running ? i18nService.t('coworkToolRunning') : i18nService.t('matiesStepDone'))}
            {stepState === StepState.Running && <ToolRunningElapsed startTimestamp={toolUse.timestamp} />}
          </span>
        </div>
      )}
      <div ref={approvalSlotRef} data-maties-approval-slot={slotKey ?? undefined} className="empty:hidden" />
      {showResultCard && !holdsApprovalCard && (
        <StepResultCard result={stepResult} failed={stepState === StepState.Failed} onOpenAgent={onOpenAgent} />
      )}
      {footer}
      {renderMediaRunningIndicators('')}
      {isExpanded && (
        <div className="maties-in">
          {renderDetailBody()}
        </div>
      )}
    </div>
  );
};

export default ToolCallGroup;
