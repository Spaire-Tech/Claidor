import '../design/conversation.css';

import { ChevronDownIcon, ChevronUpIcon, FolderIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';

import { classifyErrorKey, CoworkErrorI18nKey } from '../../../common/coworkErrorClassify';
import { ContextCompactionStatus } from '../../../common/coworkSystemMessages';
import { getScheduledReminderDisplayText } from '../../../scheduledTask/reminderText';
import {
  type CoworkErrorDetail,
  CoworkErrorModelSource,
  formatCoworkErrorDetailText,
  parseCoworkErrorDetail,
} from '../../../shared/cowork/errorDetail';
import type { CoworkGoal } from '../../../shared/cowork/goal';
import { dedupeArtifactsForDisplay } from '../../services/artifactParser';
import { getPortalPricingUrl } from '../../services/endpoints';
import { i18nService } from '../../services/i18n';
import type { RootState } from '../../store';
import type { Model } from '../../store/slices/modelSlice';
import type { Artifact } from '../../types/artifact';
import type { CoworkMessage, CoworkMessageMetadata } from '../../types/cowork';
import { revealLocalPathWithToast } from '../../utils/localFileActions';
import { getModelDisplayName } from '../../utils/modelProviderHint';
import { ArtifactPreviewCard } from '../artifacts';
import { APPROVAL_SLOT_TURN, useApprovalSlotRef } from '../design/approvalSlots';
import ProviderMark from '../design/ProviderMark';
import Shimmer from '../design/Shimmer';
import Sphere from '../design/Sphere';
import AbnormalIcon from '../icons/AbnormalIcon';
import ExclamationTriangleIcon from '../icons/ExclamationTriangleIcon';
import InformationCircleIcon from '../icons/InformationCircleIcon';
import MarkdownContent from '../MarkdownContent';
import ActivityGroupBlock, { type ActivityEntryRenderOptions, ActivityGroupMode } from './ActivityGroupBlock';
import AssistantMessageItem from './AssistantMessageItem';
import { reportConversationBlockAction } from './conversationAnalytics';
import MediaPollingIndicator from './MediaPollingIndicator';
import { MessageCopyButton } from './MessageActionButton';
import {
  canFoldTurnProcess,
  chunkConsolidatedItemsForDisplay,
  collectMediaPollCounts,
  type ConsolidatedItem,
  type ConsolidatedRenderChunk,
  consolidateMediaPolling,
  type ConversationTurn,
  COWORK_DETAIL_CONTENT_CLASS,
  COWORK_DETAIL_GUTTER_CLASS,
  formatElapsedDuration,
  getActivityIndicatorStatusText,
  getContextCompactionMessageLabel,
  getMediaCompletionDisplayText,
  getRetainedMediaPollCount,
  getToolResultDisplay,
  getToolResultLineCount,
  getToolResultLineCountSummary,
  getTurnActivityFingerprint,
  getTurnAnswerStartIndex,
  getTurnEndTimestamp,
  getTurnStartTimestamp,
  getVideoPathArtifacts,
  getVisibleAssistantItems,
  hasText,
  isActivityConsolidatedItem,
  isContextCompactionMessage,
  isDuplicateGeneratedVideoAssistantMessage,
  type ToolGroupItem,
  turnHasSelfIndicatingActivity,
} from './messageDisplayUtils';
import StepResultCard from './StepResultCard';
import { countToolSteps, formatStepsFold } from './stepsFold';
import ThinkingBlock from './ThinkingBlock';
import ToolCallGroup, { ToolCallVariant } from './ToolCallGroup';
import { getToolStepFilePath, getToolStepResult } from './toolStepPresentation';

const encodeLocalPathForUrl = (filePath: string): string => {
  return filePath
    .replace(/\\/g, '/')
    .split('/')
    .map((segment, index) => {
      if (index === 0 && segment === '') return '';
      if (/^[A-Za-z]:$/.test(segment)) return segment;
      return encodeURIComponent(segment);
    })
    .join('/');
};

const toLocalFileSrc = (filePath: string): string => {
  const normalized = filePath.trim().replace(/^file:\/\//i, '').replace(/^localfile:\/\//i, '');
  const withoutLeadingDriveSlash = /^\/[A-Za-z]:/.test(normalized) ? normalized.slice(1) : normalized;
  const encoded = encodeLocalPathForUrl(withoutLeadingDriveSlash);
  if (/^[A-Za-z]:/.test(withoutLeadingDriveSlash)) {
    return `localfile:///${encoded}`;
  }
  if (encoded.startsWith('/')) {
    return `localfile://${encoded}`;
  }
  return `localfile:///${encoded}`;
};

// ── ContextCompressionIcon ───────────────────────────────────────────────────

const ContextCompressionIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 34 34" fill="none" aria-hidden="true" {...props}>
    <path
      d="M6 5V24C6 26.2091 7.79086 28 10 28H22.5M28 29V10C28 7.79086 26.2091 6 24 6H11.5"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M11.5 13.5H21"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M11.5 19H17"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="6" cy="5" r="2" fill="currentColor" />
    <circle cx="28" cy="29" r="2" fill="currentColor" />
  </svg>
);

// ── ContextCompactionDivider ─────────────────────────────────────────────────

const ContextCompactionDivider: React.FC<{ label: string; active?: boolean }> = ({
  label,
  active = false,
}) => (
  <div
    className="flex w-full items-center gap-3 py-3 text-secondary"
    role={active ? 'status' : undefined}
    aria-live={active ? 'polite' : undefined}
  >
    <div className="h-px min-w-0 flex-1 bg-border" />
    <div className="flex max-w-[min(100%,360px)] flex-col items-center gap-1.5 bg-background px-2">
      <div className="inline-flex max-w-full items-center gap-2 text-sm font-normal leading-[var(--lobster-leading-promptLarge)] text-foreground/95">
        <ContextCompressionIcon className={`h-3.5 w-3.5 flex-shrink-0 text-foreground/70 ${active ? 'animate-pulse' : ''}`} />
        <span className="truncate">{label}</span>
      </div>
      {active && (
        <div className="context-compaction-progress w-44 max-w-full" aria-hidden="true" />
      )}
    </div>
    <div className="h-px min-w-0 flex-1 bg-border" />
  </div>
);

// ── ActivityIndicator ────────────────────────────────────────────────────────
// Persistent busy-state line at the insertion point of the last turn
// (Codex / ChatGPT style): breathing dot + shimmering status text + elapsed
// time, visible for the whole run. The label starts as "thinking" and
// switches to "working" once the turn has shown any content.

// One tick: the first value the user sees is "1s", counting up naturally.
const ACTIVITY_TIMER_APPEAR_DELAY_MS = 1000;
const ACTIVITY_LONG_WAIT_HINT_DELAY_MS = 30_000;

export const ActivityIndicator: React.FC<{
  fingerprint: string;
  hasContent: boolean;
  startTimestamp: number | null;
  statusTextOverride?: string | null;
}> = ({ fingerprint, hasContent, startTimestamp, statusTextOverride }) => {
  const [isLongWaiting, setIsLongWaiting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  // The long-wait hint resets whenever streamed content grows, so it only
  // appears after the model has been silent for a while.
  useEffect(() => {
    setIsLongWaiting(false);
    const timeoutId = window.setTimeout(
      () => setIsLongWaiting(true),
      ACTIVITY_LONG_WAIT_HINT_DELAY_MS,
    );
    return () => window.clearTimeout(timeoutId);
  }, [fingerprint]);

  useEffect(() => {
    setNow(Date.now());
    const intervalId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  // Elapsed time is anchored to message timestamps so it survives remounts
  // (switching sessions/views); until the turn has a timestamp, show no
  // counter rather than one restarted from zero.
  const elapsedMs = startTimestamp != null ? Math.max(0, now - startTimestamp) : null;
  const statusText = statusTextOverride
    ?? getActivityIndicatorStatusText(false, isLongWaiting, hasContent);

  return (
    <div className="flex items-center gap-2.5 py-0.5" role="status" aria-live="polite">
      <Shimmer text={statusText} />
      {elapsedMs != null && elapsedMs >= ACTIVITY_TIMER_APPEAR_DELAY_MS && (
        <span className="maties-meta tabular-nums flex-shrink-0" aria-hidden="true">
          {formatElapsedDuration(elapsedMs)}
        </span>
      )}
    </div>
  );
};

const getSystemMessageDisplayContent = (message: CoworkMessage, content: string): string => {
  const errorText = typeof message.metadata?.error === 'string' ? message.metadata.error : null;
  if (!errorText) return content;

  const key = classifyErrorKey(errorText) ?? classifyErrorKey(content);
  return key ? i18nService.t(key) : content;
};

const getSystemMessageErrorKey = (message: CoworkMessage, content: string): string | null => {
  const errorText = typeof message.metadata?.error === 'string' ? message.metadata.error : null;
  if (!errorText) return classifyErrorKey(content);
  return classifyErrorKey(errorText) ?? classifyErrorKey(content);
};

const isCreditQuotaExhaustedKey = (key: string | null): boolean => (
  key === CoworkErrorI18nKey.QuotaExhausted
  || key === CoworkErrorI18nKey.FreeQuotaExhausted
);

const logCreditQuotaBannerEvent = (
  level: 'debug' | 'warn',
  message: string,
  error?: unknown,
): void => {
  if (level === 'warn') {
    if (error === undefined) {
      console.warn(`[CreditQuotaBanner] ${message}`);
    } else {
      console.warn(`[CreditQuotaBanner] ${message}`, error);
    }
  } else {
    console.debug(`[CreditQuotaBanner] ${message}`);
  }

  try {
    const errorSuffix = error instanceof Error ? `: ${error.message}` : '';
    window.electron?.log?.fromRenderer?.(
      level,
      'CreditQuotaBanner',
      `${message}${errorSuffix}`.slice(0, 500),
    );
  } catch {
    // Renderer diagnostics must never interrupt the conversation UI.
  }
};

const CreditQuotaExhaustedBanner: React.FC = () => {
  const handlePurchase = async () => {
    const pricingUrl = getPortalPricingUrl();
    logCreditQuotaBannerEvent('debug', 'purchase action clicked');
    try {
      const result = await window.electron?.shell?.openExternal(pricingUrl);
      if (!result?.success) {
        logCreditQuotaBannerEvent(
          'warn',
          `pricing page open failed: ${result?.error ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      logCreditQuotaBannerEvent('warn', 'pricing page open threw an error', error);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-background px-4 py-3 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-surface-raised text-secondary">
          <AbnormalIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold leading-5 text-foreground">
            {i18nService.t('coworkCreditQuotaBannerTitle')}
          </div>
          <div className="mt-1 text-xs leading-5 text-secondary">
            {i18nService.t('coworkCreditQuotaBannerDescription')}
          </div>
        </div>
        <button
          type="button"
          onClick={handlePurchase}
          className="ml-2 inline-flex h-8 flex-shrink-0 items-center justify-center rounded-full bg-foreground px-5 text-xs font-medium text-background transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {i18nService.t('coworkCreditQuotaBannerAction')}
        </button>
      </div>
    </div>
  );
};

// ── SystemErrorTechnicalDetail ───────────────────────────────────────────────

/**
 * User-facing model source label. Users only need two buckets — the Maties
 * plan vs. a model they configured themselves; finer detail (provider name,
 * Coding Plan, OAuth) goes into the parenthesized qualifier.
 */
const buildErrorModelSourceLabel = (detail: CoworkErrorDetail): string | null => {
  if (!detail.modelSource) return null;
  if (detail.modelSource === CoworkErrorModelSource.MatiesPlan) {
    return i18nService.t('coworkErrorModelSourceMatiesPlan');
  }

  const qualifiers: string[] = [];
  if (detail.providerDisplayName) qualifiers.push(detail.providerDisplayName);
  if (detail.modelSource === CoworkErrorModelSource.CodingPlan) qualifiers.push('Coding Plan');
  if (detail.modelSource === CoworkErrorModelSource.BuiltinOAuth) qualifiers.push('OAuth');

  const base = i18nService.t('coworkErrorModelSourceCustomModel');
  return qualifiers.length > 0 ? `${base} (${qualifiers.join(' · ')})` : base;
};

/** "Model: glm-5 · Custom model (Zhipu · Coding Plan)" line shown without expanding details. */
const buildErrorModelLine = (detail: CoworkErrorDetail): string | null => {
  const sourceLabel = buildErrorModelSourceLabel(detail);
  if (!detail.model && !sourceLabel) return null;

  const parts: string[] = [];
  if (detail.model) {
    parts.push(`${i18nService.t('coworkErrorModelLabel')}: ${detail.model}`);
  }
  if (sourceLabel) {
    parts.push(sourceLabel);
  }
  return parts.join(' · ');
};

const SystemErrorTechnicalDetail: React.FC<{ detail: CoworkErrorDetail }> = ({ detail }) => {
  const [expanded, setExpanded] = useState(false);
  const detailText = useMemo(() => formatCoworkErrorDetailText(detail), [detail]);
  if (!detailText) return null;

  return (
    <div className="mt-1.5 pl-6">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-1 text-xs text-muted transition-colors hover:text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded"
        aria-expanded={expanded}
      >
        {expanded
          ? <ChevronUpIcon className="h-3 w-3 flex-shrink-0" />
          : <ChevronDownIcon className="h-3 w-3 flex-shrink-0" />
        }
        <span>{i18nService.t('coworkErrorTechnicalDetails')}</span>
      </button>
      {expanded && (
        <div className="relative mt-1.5 rounded-md bg-surface-raised px-3 py-2">
          <div className="absolute right-1 top-1">
            <MessageCopyButton content={detailText} />
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words pr-8 font-mono text-code text-secondary">
            {detailText}
          </pre>
        </div>
      )}
    </div>
  );
};

// ── VideoArtifactPathList ────────────────────────────────────────────────────

const VideoArtifactPathList: React.FC<{ artifacts: Artifact[] }> = ({ artifacts }) => {
  if (artifacts.length === 0) return null;

  const getDisplayPath = (filePath: string): string => {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  };

  return (
    <div className="space-y-1">
      {artifacts.map(artifact => (
        <div
          key={artifact.id}
          className="flex items-center gap-2 text-xs text-secondary"
        >
          <span className="truncate">{getDisplayPath(artifact.filePath!)}</span>
          <button
            className="flex items-center gap-1 text-primary hover:underline flex-shrink-0"
            onClick={() => void revealLocalPathWithToast(artifact.filePath!)}
          >
            <FolderIcon className="h-3.5 w-3.5" />
            <span>{i18nService.t('showInFolder')}</span>
          </button>
        </div>
      ))}
    </div>
  );
};

// ── MediaImageInline ────────────────────────────────────────────────────────

const MediaImageInline: React.FC<{ artifacts: Artifact[] }> = ({ artifacts }) => {
  if (artifacts.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {artifacts.map(artifact => {
        const src = artifact.filePath
          ? toLocalFileSrc(artifact.filePath)
          : artifact.content;
        if (!src) return null;
        return (
          <img
            key={artifact.id}
            src={src}
            alt={artifact.title || ''}
            className="max-w-[320px] max-h-[240px] rounded-lg border border-border object-contain"
          />
        );
      })}
    </div>
  );
};

// ── AssistantTurnBlock ───────────────────────────────────────────────────────

const getActivityGroupKey = (item: ConsolidatedItem): string => {
  if (item.type === 'media_polling_group') return `media-${item.group.taskId}`;
  if (item.type === 'tool_group') return item.group.toolUse.id;
  return item.message.id;
};

/** The model the turn ran on: the last assistant message that names one. */
const getTurnModelRef = (turn: ConversationTurn): string => {
  let modelRef = '';
  for (const item of turn.assistantItems) {
    if (item.type !== 'assistant') continue;
    const model = item.message.metadata?.model;
    if (typeof model === 'string' && model.trim()) modelRef = model.trim();
  }
  return modelRef;
};

/** The first thing the assistant did in the turn, for the time in the header. */
const getTurnAssistantTimestamp = (turn: ConversationTurn): number | null => {
  for (const item of turn.assistantItems) {
    const timestamp = item.type === 'tool_group' ? item.group.toolUse.timestamp : item.message.timestamp;
    if (typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp > 0) return timestamp;
  }
  return getTurnStartTimestamp(turn);
};

const getItemTimestamp = (item: ConsolidatedItem): number | null => {
  if (item.type === 'tool_group') return item.group.toolUse.timestamp;
  if (item.type === 'media_polling_group') return item.group.polls[0]?.toolUse.timestamp ?? null;
  return item.message.timestamp;
};

/** Files the turn read, wrote or edited: their names become chips in the answer. */
const collectTurnFiles = (items: ConsolidatedItem[]): string[] => {
  const files: string[] = [];
  for (const item of items) {
    if (item.type !== 'tool_group') continue;
    const rawName = item.group.toolUse.metadata?.toolName;
    const filePath = getToolStepFilePath(
      typeof rawName === 'string' ? rawName : undefined,
      item.group.toolUse.metadata?.toolInput,
    );
    if (filePath && !files.includes(filePath)) files.push(filePath);
  }
  return files;
};

const countSteps = (chunks: ConsolidatedRenderChunk[]): number => countToolSteps(
  chunks.flatMap((chunk) => (chunk.kind === 'item' ? [chunk.item] : chunk.entries.map((entry) => entry.item))),
);

/** The last tool step of the process, whose result card stays visible under the fold. */
const findLastToolGroup = (chunks: ConsolidatedRenderChunk[]): ToolGroupItem | null => {
  for (let at = chunks.length - 1; at >= 0; at -= 1) {
    const chunk = chunks[at];
    if (chunk.kind === 'item') {
      if (chunk.item.type === 'tool_group') return chunk.item.group;
      continue;
    }
    for (let entryAt = chunk.entries.length - 1; entryAt >= 0; entryAt -= 1) {
      const item = chunk.entries[entryAt].item;
      if (item.type === 'tool_group') return item.group;
    }
  }
  return null;
};

const formatTurnTime = (timestamp: number | null): string => {
  if (timestamp == null) return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const FoldChevron: React.FC<{ open: boolean }> = ({ open }) => (
  <svg
    width={11}
    height={11}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#c4c8ce"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flex: '0 0 11px', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s ease' }}
    aria-hidden
  >
    <polyline points="9,5 16,12 9,19" />
  </svg>
);

/** Steps are indented 36 px under the sphere's text column. */
const STEP_INDENT_PX = 36;

/**
 * The assistant's turn (docs/maties/design.md, section 4). No bubble: a
 * still sphere at the left, the column, the line « <mark> Claude Sonnet 5
 * · 12:40 » above it, then whatever the turn contains, in order.
 */
const AssistantTurnBlock: React.FC<{
  turn: ConversationTurn;
  artifacts?: Artifact[];
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  mapDisplayText?: (value: string) => string;
  localServiceDirectory?: string;
  onOpenLocalService?: (artifact: Artifact) => void;
  onDeployLocalService?: (artifact: Artifact) => void;
  onOpenHtmlFile?: (artifact: Artifact) => void;
  onOpenArtifactPreview?: (artifact: Artifact) => void;
  onForkMessage?: (messageId: string) => void;
  /** Puts the person's message of this turn back in the composer. */
  onRetryTurn?: (turn: ConversationTurn) => void;
  planConfirmationMessageId?: string | null;
  onConfirmPlan?: (messageId: string) => void;
  onAdjustPlan?: (messageId: string) => void;
  /** Replaces a tool_group's rendering entirely (e.g. subagent spawn cards). */
  renderToolGroupOverride?: (group: ToolGroupItem) => React.ReactNode;
  showActivityIndicator?: boolean;
  activityStatusOverride?: string | null;
  showCopyButtons?: boolean;
  completedGoal?: CoworkGoal | null;
  hiddenSystemMessageId?: string | null;
  searchTargetMessageId?: string | null;
  /** True when this turn is the one currently streaming; keeps the latest activity step visible. */
  isStreamingTurn?: boolean;
  /** True while subagents spawned in this turn are still running; keeps the process unfolded. */
  hasRunningSubagents?: boolean;
  /** Hide the sphere and the header line (a subagent's own view draws its own). */
  hideTurnHeader?: boolean;
  /**
   * The model the session is set to. A turn names its model only once its
   * final message lands; while it runs, this keeps the mark and the name in
   * the header instead of a bare time.
   */
  liveModelRef?: string;
}> = ({
  turn,
  artifacts,
  resolveLocalFilePath,
  mapDisplayText,
  localServiceDirectory,
  onOpenLocalService,
  onDeployLocalService,
  onOpenHtmlFile,
  onOpenArtifactPreview,
  onForkMessage,
  onRetryTurn,
  planConfirmationMessageId,
  onConfirmPlan,
  onAdjustPlan,
  renderToolGroupOverride,
  showActivityIndicator = false,
  activityStatusOverride = null,
  showCopyButtons = true,
  completedGoal,
  hiddenSystemMessageId,
  searchTargetMessageId,
  isStreamingTurn = false,
  hasRunningSubagents = false,
  hideTurnHeader = false,
  liveModelRef = '',
}) => {
  const [artifactCardsExpanded, setArtifactCardsExpanded] = useState(false);
  const [processExpanded, setProcessExpanded] = useState(false);
  const visibleAssistantItems = useMemo(
    () => getVisibleAssistantItems(turn.assistantItems),
    [turn.assistantItems],
  );
  const consolidatedItems = useMemo(
    () => consolidateMediaPolling(visibleAssistantItems),
    [visibleAssistantItems],
  );
  const toolGroupOverrides = useMemo(() => {
    const overrides = new Map<string, React.ReactNode>();
    if (!renderToolGroupOverride) return overrides;
    for (const item of consolidatedItems) {
      if (item.type !== 'tool_group') continue;
      const override = renderToolGroupOverride(item.group);
      if (override) overrides.set(item.group.toolUse.id, override);
    }
    return overrides;
  }, [consolidatedItems, renderToolGroupOverride]);
  const videoPathArtifacts = useMemo(
    () => getVideoPathArtifacts(artifacts),
    [artifacts],
  );
  const artifactCards = useMemo(
    () => artifacts
      ? dedupeArtifactsForDisplay(
          artifacts,
          { defaultProjectDirectory: localServiceDirectory },
        )
      : [],
    [artifacts, localServiceDirectory],
  );
  const visibleArtifactCards = useMemo(() => {
    return artifactCardsExpanded ? artifactCards : artifactCards.slice(0, 3);
  }, [artifactCards, artifactCardsExpanded]);
  const hiddenArtifactCardCount = Math.max(0, artifactCards.length - visibleArtifactCards.length);
  const retainedMediaPollCountsRef = useRef<Map<string, number>>(new Map());
  const currentMediaPollCounts = useMemo(
    () => collectMediaPollCounts(consolidatedItems),
    [consolidatedItems],
  );
  const retainedMediaPollCounts = useMemo(() => {
    const next = new Map(retainedMediaPollCountsRef.current);
    for (const [key, pollCount] of currentMediaPollCounts) {
      next.set(key, Math.max(next.get(key) ?? 0, pollCount));
    }
    return next;
  }, [currentMediaPollCounts]);
  const knownFiles = useMemo(() => collectTurnFiles(consolidatedItems), [consolidatedItems]);
  const recordedModelRef = useMemo(() => getTurnModelRef(turn), [turn]);
  const turnTime = formatTurnTime(getTurnAssistantTimestamp(turn));
  const isTurnLive = isStreamingTurn || hasRunningSubagents;
  const turnModelRef = recordedModelRef || (isTurnLive ? liveModelRef.trim() : '');

  // A request that arrives before its step is on screen lands here.
  const turnApprovalSlotRef = useApprovalSlotRef<HTMLDivElement>(isStreamingTurn ? APPROVAL_SLOT_TURN : null);

  useEffect(() => {
    retainedMediaPollCountsRef.current = retainedMediaPollCounts;
  }, [retainedMediaPollCounts]);

  useEffect(() => {
    setArtifactCardsExpanded(false);
    setProcessExpanded(false);
  }, [turn.id]);

  const renderSystemMessage = (message: CoworkMessage) => {
    if (message.id === hiddenSystemMessageId) {
      return null;
    }
    const isError = !hasText(message.content) && typeof message.metadata?.error === 'string';
    const rawContent = hasText(message.content)
      ? message.content
      : (typeof message.metadata?.error === 'string' ? message.metadata.error : '');
    if (getMediaCompletionDisplayText(message, rawContent)) {
      return null;
    }
    const normalizedContent = getScheduledReminderDisplayText(rawContent) ?? rawContent;
    const errorKey = getSystemMessageErrorKey(message, normalizedContent);
    if (isCreditQuotaExhaustedKey(errorKey)) {
      return <CreditQuotaExhaustedBanner />;
    }
    const displayContent = getSystemMessageDisplayContent(message, normalizedContent);
    const content = mapDisplayText ? mapDisplayText(displayContent) : displayContent;
    if (!content.trim() && !isContextCompactionMessage(message)) return null;

    if (isContextCompactionMessage(message)) {
      const status = message.metadata?.status;
      return (
        <ContextCompactionDivider
          label={getContextCompactionMessageLabel(message, content)}
          active={status === ContextCompactionStatus.Running}
        />
      );
    }

    const errorDetail = parseCoworkErrorDetail(message.metadata?.errorDetail);
    const errorModelLine = errorDetail ? buildErrorModelLine(errorDetail) : null;

    return (
      <div className="maties-card" style={{ padding: '12px 18px 12px 15px' }}>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex-shrink-0" style={{ color: isError ? '#c8790a' : '#8f96a0' }}>
            {isError
              ? <ExclamationTriangleIcon className="h-4 w-4" />
              : <InformationCircleIcon className="h-4 w-4" />
            }
          </span>
          <div className="min-w-0" style={{ fontSize: 13.5, color: '#4a4f57' }}>
            <MarkdownContent
              content={content}
              className="!text-[13.5px] !leading-5 [&_a]:!text-primary [&_p]:!my-0 [&_p]:!text-secondary [&_p]:!leading-5"
            />
          </div>
        </div>
        {errorModelLine && (
          <div className="maties-meta mt-1 pl-6">{errorModelLine}</div>
        )}
        {errorDetail && <SystemErrorTechnicalDetail detail={errorDetail} />}
      </div>
    );
  };

  const renderOrphanToolResult = (message: CoworkMessage) => {
    const toolResultDisplayRaw = getToolResultDisplay(message);
    const toolResultDisplay = mapDisplayText ? mapDisplayText(toolResultDisplayRaw) : toolResultDisplayRaw;
    const isToolError = Boolean(message.metadata?.isError || message.metadata?.error);
    const hasToolResultText = hasText(toolResultDisplay);
    const resultLineCount = hasToolResultText ? getToolResultLineCount(toolResultDisplay) : 0;
    const showNoDetailError = isToolError && !hasToolResultText;
    const fallbackText = showNoDetailError ? i18nService.t('coworkToolNoErrorDetail') : '';
    const displayText = hasToolResultText ? toolResultDisplay : fallbackText;
    return (
      <div className="py-1">
        <div className="flex items-start gap-3">
          <span
            className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full`}
            style={{ background: isToolError ? '#e0322d' : '#e7e7ea' }}
          />
          <div className="min-w-0 flex-1">
            <div style={{ fontSize: 14, fontWeight: 500, color: '#31353b' }}>
              {i18nService.t('coworkToolResult')}
            </div>
            {resultLineCount > 0 && (
              <div className="maties-meta mt-0.5">
                {getToolResultLineCountSummary(resultLineCount)}
              </div>
            )}
            {resultLineCount === 0 && showNoDetailError && (
              <div className="mt-0.5 text-xs" style={{ color: isToolError ? '#e0322d' : '#8f96a0' }}>
                {fallbackText}
              </div>
            )}
            {(hasToolResultText || showNoDetailError) && (
              <div className="maties-inset mt-2 max-h-64 overflow-y-auto px-4 py-3">
                <pre
                  className="maties-mono whitespace-pre-wrap break-words"
                  style={{ fontSize: 12.5, lineHeight: 1.55, color: isToolError ? '#e0322d' : hasToolResultText ? '#1c1f23' : '#8f96a0' }}
                >
                  {displayText}
                </pre>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Tool groups with an override (e.g. subagent cards) stay visible on their own.
  const renderChunks = chunkConsolidatedItemsForDisplay(
    consolidatedItems,
    (item) => isActivityConsolidatedItem(item)
      && !(item.type === 'tool_group' && toolGroupOverrides.has(item.group.toolUse.id)),
  );

  const renderConsolidatedItem = (
    item: ConsolidatedItem,
    index: number,
    options: ActivityEntryRenderOptions = { variant: 'step' },
  ): React.ReactNode => {
    const isRowVariant = options.variant === 'row';
    const nextItem = consolidatedItems[index + 1];
    if (item.type === 'media_polling_group') {
      const retainedPollCount = getRetainedMediaPollCount(
        { taskId: item.group.taskId, upstreamTaskId: item.group.upstreamTaskId },
        retainedMediaPollCounts,
      );
      const indicator = (
        <MediaPollingIndicator
          key={`media-poll-${item.group.taskId}`}
          group={{
            ...item.group,
            pollCount: retainedPollCount ?? item.group.pollCount,
          }}
          isLastInSequence
        />
      );
      return isRowVariant
        ? <div key={`media-poll-${item.group.taskId}`} className="px-2 py-1.5">{indicator}</div>
        : indicator;
    }

    if (item.type === 'assistant') {
      if (item.message.metadata?.isThinking) {
        return (
          <ThinkingBlock
            key={item.message.id}
            message={item.message}
            mapDisplayText={mapDisplayText}
            endTimestamp={nextItem ? getItemTimestamp(nextItem) : null}
            variant={isRowVariant ? 'row' : 'default'}
            initiallyExpanded={options.initiallyExpanded}
            isLive={isTurnLive ? undefined : false}
          />
        );
      }

      if (isDuplicateGeneratedVideoAssistantMessage(item.message, videoPathArtifacts)) {
        return null;
      }

      // Check if there are image artifacts for this message (inline MEDIA display)
      const imageArtifacts = artifacts?.filter(a =>
        a.type === 'image' && a.messageId === item.message.id,
      );
      if (imageArtifacts && imageArtifacts.length > 0 && !item.message.content.replace(/\s*MEDIA\s*/gi, '').trim()) {
        return (
          <MediaImageInline key={item.message.id} artifacts={imageArtifacts} />
        );
      }

      const hasToolGroupAfter = consolidatedItems
        .slice(index + 1)
        .some(laterItem => laterItem.type === 'tool_group' || laterItem.type === 'media_polling_group');
      const isLastAssistant = showCopyButtons && !hasToolGroupAfter;
      const hasAssistantAfter = consolidatedItems
        .slice(index + 1)
        .some(laterItem => laterItem.type === 'assistant');
      const isMessageStreaming = isStreamingTurn && Boolean(item.message.metadata?.isStreaming);

      return (
        <AssistantMessageItem
          key={item.message.id}
          message={item.message}
          resolveLocalFilePath={resolveLocalFilePath}
          mapDisplayText={mapDisplayText}
          showCopyButton={isLastAssistant}
          onFork={isLastAssistant ? onForkMessage : undefined}
          onRetry={isLastAssistant && onRetryTurn && turn.userMessage ? () => onRetryTurn(turn) : undefined}
          turnMetadata={isLastAssistant ? (item.message.metadata as CoworkMessageMetadata) : undefined}
          completedGoal={isLastAssistant && !hasAssistantAfter ? completedGoal : null}
          planConfirmationMessageId={planConfirmationMessageId}
          onConfirmPlan={onConfirmPlan}
          onAdjustPlan={onAdjustPlan}
          forceSearchExpanded={searchTargetMessageId === item.message.id}
          streaming={isMessageStreaming}
          knownFiles={knownFiles}
        />
      );
    }

    if (item.type === 'tool_group') {
      const override = toolGroupOverrides.get(item.group.toolUse.id);
      if (override) {
        return (
          <div key={`tool-${item.group.toolUse.id}`} style={{ paddingLeft: isRowVariant ? 0 : STEP_INDENT_PX }}>
            {override}
          </div>
        );
      }
      return (
        <ToolCallGroup
          key={`tool-${item.group.toolUse.id}`}
          group={item.group}
          mapDisplayText={mapDisplayText}
          retainedMediaPollCounts={retainedMediaPollCounts}
          variant={isRowVariant ? ToolCallVariant.Row : ToolCallVariant.Step}
          initiallyExpanded={options.initiallyExpanded}
          isLive={isTurnLive}
        />
      );
    }

    if (item.type === 'system') {
      const systemMessage = renderSystemMessage(item.message);
      if (!systemMessage) {
        return null;
      }
      return (
        <div key={item.message.id}>
          {systemMessage}
        </div>
      );
    }

    return (
      <div key={item.message.id} className={isRowVariant ? 'px-2 py-1.5' : undefined}>
        {renderOrphanToolResult(item.message)}
      </div>
    );
  };

  const renderChunk = (
    chunk: ConsolidatedRenderChunk,
    groupMode: ActivityGroupMode,
  ): React.ReactNode => {
    if (chunk.kind === 'item') {
      return <React.Fragment key={`item-${chunk.index}`}>{renderConsolidatedItem(chunk.item, chunk.index)}</React.Fragment>;
    }
    const lastGroup = groupMode === ActivityGroupMode.Folded ? findLastToolGroup([chunk]) : null;
    const lastResult = lastGroup && !toolGroupOverrides.has(lastGroup.toolUse.id)
      ? getToolStepResult(lastGroup, mapDisplayText)
      : null;
    return (
      <div key={`activity-${getActivityGroupKey(chunk.entries[0].item)}`} style={{ paddingLeft: STEP_INDENT_PX }}>
        <ActivityGroupBlock
          entries={chunk.entries}
          mode={groupMode}
          renderEntry={(entry, options) => renderConsolidatedItem(entry.item, entry.index, options)}
          keptResult={lastResult ? (
            <StepResultCard
              result={lastResult}
              failed={Boolean(lastGroup?.toolResult?.metadata?.isError || lastGroup?.toolResult?.metadata?.error)}
            />
          ) : undefined}
        />
      </div>
    );
  };

  // Once the turn completes, the steps fold into one line (« 4 steps ·
  // 12 s ») that opens to the full list, and the last result card stays
  // visible. A turn with subagents still running is not complete; neither
  // is one with no trailing answer yet.
  const answerStartIndex = getTurnAnswerStartIndex(renderChunks);
  const processChunks = renderChunks.slice(0, answerStartIndex);
  const answerChunks = renderChunks.slice(answerStartIndex);
  const shouldFoldProcess = !isStreamingTurn
    && !hasRunningSubagents
    && canFoldTurnProcess(renderChunks, answerStartIndex);
  const processContainsSearchTarget = Boolean(searchTargetMessageId) && processChunks.some(
    (chunk) => chunk.kind === 'item'
      && chunk.item.type === 'assistant'
      && chunk.item.message.id === searchTargetMessageId,
  );
  const isProcessExpanded = processExpanded || processContainsSearchTarget;
  const turnStartTimestamp = getTurnStartTimestamp(turn);
  const turnEndTimestamp = getTurnEndTimestamp(turn);
  const processDurationMs = turnStartTimestamp != null && turnEndTimestamp != null
    ? turnEndTimestamp - turnStartTimestamp
    : null;
  const processStepCount = countSteps(processChunks);
  const processLabel = formatStepsFold(processStepCount, processDurationMs);
  const lastProcessGroup = shouldFoldProcess ? findLastToolGroup(processChunks) : null;
  const keptResult = lastProcessGroup && !toolGroupOverrides.has(lastProcessGroup.toolUse.id)
    ? getToolStepResult(lastProcessGroup, mapDisplayText)
    : null;
  const keptResultFailed = Boolean(lastProcessGroup?.toolResult?.metadata?.isError || lastProcessGroup?.toolResult?.metadata?.error);

  const handleProcessToggle = () => {
    const nextExpanded = !isProcessExpanded;
    reportConversationBlockAction({
      actionType: nextExpanded ? 'turn_process_expand' : 'turn_process_collapse',
      blockType: 'turn_process',
      params: {
        processChunkCount: processChunks.length,
        durationMs: processDurationMs ?? undefined,
      },
    });
    setProcessExpanded(nextExpanded);
  };

  // While a step carries its own ring, the turn's « Thinking » line stays
  // hidden, so at most one thing moves on screen.
  const lastItem = consolidatedItems[consolidatedItems.length - 1];
  const answerIsStreaming = Boolean(
    lastItem
    && lastItem.type === 'assistant'
    && !lastItem.message.metadata?.isThinking
    && lastItem.message.metadata?.isStreaming,
  );
  // ... and while the answer's own words are moving, nothing else needs to.
  const stepIsLive = turnHasSelfIndicatingActivity(turn) || answerIsStreaming;
  const modelName = turnModelRef ? getModelDisplayName(turnModelRef, []) : '';

  const liveChunks = renderChunks.map((chunk, chunkIndex) => renderChunk(
    chunk,
    isStreamingTurn && chunkIndex === renderChunks.length - 1 ? ActivityGroupMode.Live : ActivityGroupMode.Folded,
  ));

  return (
    <div className={`py-3 ${COWORK_DETAIL_GUTTER_CLASS}`}>
      <div className={COWORK_DETAIL_CONTENT_CLASS}>
        <div className="flex items-start gap-[14px]">
          {!hideTurnHeader && (
            <Sphere size={22} still className="mt-[1px]" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            {!hideTurnHeader && (turnModelRef || turnTime) && (
              <div className="maties-meta flex min-h-[22px] items-center gap-1.5" data-cowork-search-exclude="true">
                {turnModelRef && <ProviderMark modelRef={turnModelRef} size={14} />}
                {turnModelRef && <TurnModelName modelRef={turnModelRef} fallback={modelName} />}
                {turnModelRef && turnTime && <span aria-hidden>·</span>}
                {turnTime && <span className="tabular-nums">{turnTime}</span>}
              </div>
            )}
            {shouldFoldProcess ? (
              <>
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleProcessToggle}
                    className="flex max-w-full items-center gap-1.5 text-left"
                    aria-expanded={isProcessExpanded}
                  >
                    <span className="maties-caption min-w-0 truncate" style={{ color: '#6b7280' }}>{processLabel}</span>
                    <FoldChevron open={isProcessExpanded} />
                  </button>
                  {isProcessExpanded && (
                    <div className="maties-in flex flex-col gap-3">
                      {processChunks.map((chunk) => renderChunk(chunk, ActivityGroupMode.Open))}
                    </div>
                  )}
                  {!isProcessExpanded && keptResult && (
                    <div style={{ paddingLeft: STEP_INDENT_PX }}>
                      <StepResultCard result={keptResult} failed={keptResultFailed} />
                    </div>
                  )}
                </div>
                {answerChunks.map((chunk) => renderChunk(chunk, ActivityGroupMode.Folded))}
              </>
            ) : (
              liveChunks
            )}
            {isStreamingTurn && (
              <div ref={turnApprovalSlotRef} data-maties-approval-slot={APPROVAL_SLOT_TURN} className="empty:hidden" style={{ paddingLeft: STEP_INDENT_PX }} />
            )}
            {showActivityIndicator && !stepIsLive && (
              <ActivityIndicator
                fingerprint={getTurnActivityFingerprint(turn)}
                hasContent={visibleAssistantItems.length > 0}
                startTimestamp={getTurnStartTimestamp(turn)}
                statusTextOverride={activityStatusOverride}
              />
            )}
            {artifacts && artifacts.length > 0 && (
              <div className="space-y-2 pt-1">
                <VideoArtifactPathList artifacts={videoPathArtifacts} />
                <div className="artifact-preview-card-group w-full overflow-hidden rounded-2xl" style={{ boxShadow: '0 0 0 .5px rgba(30,32,38,.07), 0 8px 24px rgba(16,20,28,.05)' }}>
                  <div className="divide-y divide-border">
                    {visibleArtifactCards.map(artifact => (
                      <ArtifactPreviewCard
                        key={artifact.id}
                        artifact={artifact}
                        localServiceDirectory={localServiceDirectory}
                        onOpenLocalService={onOpenLocalService}
                        onDeployLocalService={onDeployLocalService}
                        onOpenHtmlFile={onOpenHtmlFile}
                        onOpenPreview={onOpenArtifactPreview}
                      />
                    ))}
                  </div>
                  {(hiddenArtifactCardCount > 0 || (artifactCardsExpanded && artifactCards.length > 3)) && (
                    <div className="border-t border-border px-4 py-2 text-center">
                      {hiddenArtifactCardCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setArtifactCardsExpanded(true)}
                          className="maties-button maties-button-ghost"
                        >
                          <span>{i18nService.t('artifactPreviewCardShowMore').replace('{count}', String(hiddenArtifactCardCount))}</span>
                          <ChevronDownIcon className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setArtifactCardsExpanded(false)}
                          className="maties-button maties-button-ghost"
                        >
                          <span>{i18nService.t('artifactPreviewCardShowLess')}</span>
                          <ChevronUpIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/** The model's name from the records the app has, or the reference tidied. */
const TurnModelName: React.FC<{ modelRef: string; fallback: string }> = ({ modelRef, fallback }) => {
  const models = useSelector((state: RootState) => state.model.availableModels as Model[]);
  const name = getModelDisplayName(modelRef, models) || fallback;
  return <span>{name}</span>;
};

export { ContextCompactionDivider };

export default AssistantTurnBlock;
