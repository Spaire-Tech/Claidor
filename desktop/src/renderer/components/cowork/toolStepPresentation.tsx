import React from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkMessage } from '../../types/cowork';
import { computeDiffStats, type DiffStats, extractDiffFromToolInput } from './DiffView';
import {
  getToolInputString,
  getToolResultRawText,
  getToolStepDisplay,
  hasText,
  isBashLikeToolName,
  isTodoWriteToolName,
  normalizeToolName,
  type ToolGroupItem,
  truncatePreview,
} from './messageDisplayUtils';

/**
 * A step, in plain words (docs/maties/design.md, section 4).
 *
 * The engine's tool names (« exec », « web_fetch », « sessions_spawn ») are
 * its own; the person sees what the step does. One kind per verb, each with
 * a title, an icon, and the sentence for when it fails.
 */
export const ToolStepKind = {
  Read: 'read',
  Write: 'write',
  Edit: 'edit',
  Command: 'command',
  WebSearch: 'web_search',
  WebPage: 'web_page',
  Browser: 'browser',
  Library: 'library',
  FindFiles: 'find_files',
  AgentStart: 'agent_start',
  AgentWait: 'agent_wait',
  Schedule: 'schedule',
  Plan: 'plan',
  Image: 'image',
  Video: 'video',
  Process: 'process',
  Memory: 'memory',
  Question: 'question',
  Tool: 'tool',
} as const;
export type ToolStepKind = typeof ToolStepKind[keyof typeof ToolStepKind];

const KIND_BY_NORMALIZED_NAME: Record<string, ToolStepKind> = {
  read: ToolStepKind.Read,
  readfile: ToolStepKind.Read,
  write: ToolStepKind.Write,
  writefile: ToolStepKind.Write,
  edit: ToolStepKind.Edit,
  editfile: ToolStepKind.Edit,
  multiedit: ToolStepKind.Edit,
  applypatch: ToolStepKind.Edit,
  websearch: ToolStepKind.WebSearch,
  webfetch: ToolStepKind.WebPage,
  fetch: ToolStepKind.WebPage,
  browser: ToolStepKind.Browser,
  searchlibrary: ToolStepKind.Library,
  librarysearch: ToolStepKind.Library,
  glob: ToolStepKind.FindFiles,
  grep: ToolStepKind.FindFiles,
  ls: ToolStepKind.FindFiles,
  sessionsspawn: ToolStepKind.AgentStart,
  task: ToolStepKind.AgentStart,
  sessionsyield: ToolStepKind.AgentWait,
  sessionssend: ToolStepKind.AgentWait,
  cron: ToolStepKind.Schedule,
  todowrite: ToolStepKind.Plan,
  matiesimagegenerate: ToolStepKind.Image,
  matiesvideogenerate: ToolStepKind.Video,
  process: ToolStepKind.Process,
  memorysearch: ToolStepKind.Memory,
  memoryget: ToolStepKind.Memory,
  askuserquestion: ToolStepKind.Question,
};

export const getToolStepKind = (rawToolName: string | undefined): ToolStepKind => {
  if (!rawToolName) return ToolStepKind.Tool;
  if (isBashLikeToolName(rawToolName)) return ToolStepKind.Command;
  if (isTodoWriteToolName(rawToolName)) return ToolStepKind.Plan;
  return KIND_BY_NORMALIZED_NAME[normalizeToolName(rawToolName)] ?? ToolStepKind.Tool;
};

const TITLE_KEY_BY_KIND: Record<ToolStepKind, string> = {
  [ToolStepKind.Read]: 'matiesStepRead',
  [ToolStepKind.Write]: 'matiesStepWrite',
  [ToolStepKind.Edit]: 'matiesStepEdit',
  [ToolStepKind.Command]: 'matiesStepCommand',
  [ToolStepKind.WebSearch]: 'matiesStepWebSearch',
  [ToolStepKind.WebPage]: 'matiesStepWebPage',
  [ToolStepKind.Browser]: 'matiesStepBrowser',
  [ToolStepKind.Library]: 'matiesStepLibrary',
  [ToolStepKind.FindFiles]: 'matiesStepFindFiles',
  [ToolStepKind.AgentStart]: 'matiesStepAgentStart',
  [ToolStepKind.AgentWait]: 'matiesStepAgentWait',
  [ToolStepKind.Schedule]: 'matiesStepSchedule',
  [ToolStepKind.Plan]: 'matiesStepPlan',
  [ToolStepKind.Image]: 'matiesStepImage',
  [ToolStepKind.Video]: 'matiesStepVideo',
  [ToolStepKind.Process]: 'matiesStepProcess',
  [ToolStepKind.Memory]: 'matiesStepMemory',
  [ToolStepKind.Question]: 'matiesStepQuestion',
  [ToolStepKind.Tool]: 'matiesStepTool',
};

const FAILURE_KEY_BY_KIND: Partial<Record<ToolStepKind, string>> = {
  [ToolStepKind.Read]: 'matiesStepFailedRead',
  [ToolStepKind.Write]: 'matiesStepFailedWrite',
  [ToolStepKind.Edit]: 'matiesStepFailedEdit',
  [ToolStepKind.Command]: 'matiesStepFailedCommand',
  [ToolStepKind.WebSearch]: 'matiesStepFailedSearch',
  [ToolStepKind.WebPage]: 'matiesStepFailedPage',
  [ToolStepKind.Browser]: 'matiesStepFailedPage',
  [ToolStepKind.Library]: 'matiesStepFailedSearch',
  [ToolStepKind.FindFiles]: 'matiesStepFailedSearch',
  [ToolStepKind.AgentStart]: 'matiesStepFailedAgent',
  [ToolStepKind.AgentWait]: 'matiesStepFailedAgent',
};

export const getToolStepTitle = (kind: ToolStepKind): string => i18nService.t(TITLE_KEY_BY_KIND[kind]);

/** What failed, in plain words. */
export const getToolStepFailureText = (kind: ToolStepKind): string => (
  i18nService.t(FAILURE_KEY_BY_KIND[kind] ?? 'matiesStepFailedGeneric')
);

const FILE_PATH_KEYS = ['file_path', 'path', 'filePath', 'target_file', 'targetFile'];

export const getFileBasename = (value: string): string => {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  const lastSlash = normalized.lastIndexOf('/');
  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
};

/** The file a read/write/edit step touches, when its input names one. */
export const getToolStepFilePath = (
  rawToolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
): string | null => {
  const kind = getToolStepKind(rawToolName);
  if (kind !== ToolStepKind.Read && kind !== ToolStepKind.Write && kind !== ToolStepKind.Edit) return null;
  if (!toolInput) return null;
  return getToolInputString(toolInput, FILE_PATH_KEYS);
};

/**
 * The step's sub-line: the thing it works on (the file's name, the command,
 * the query), never the engine's tool name. Falls back to the tool's own
 * name only for a tool the app does not know, so the person still sees
 * something specific.
 */
export const getToolStepSubline = (
  rawToolName: string | undefined,
  toolInput: Record<string, unknown> | undefined,
): string | null => {
  const kind = getToolStepKind(rawToolName);
  const input = toolInput ?? {};
  switch (kind) {
    case ToolStepKind.WebSearch:
    case ToolStepKind.Library:
    case ToolStepKind.Memory:
      return getToolInputString(input, ['query', 'q', 'question', 'search']);
    case ToolStepKind.WebPage:
      return getToolInputString(input, ['url', 'href']);
    case ToolStepKind.Browser: {
      const action = getToolInputString(input, ['action']);
      const target = getToolInputString(input, ['url', 'targetUrl', 'selector', 'text']);
      return [action, target].filter(Boolean).join(' · ') || null;
    }
    case ToolStepKind.Image:
    case ToolStepKind.Video:
      return getToolInputString(input, ['prompt', 'description']);
    case ToolStepKind.Question:
      return null;
    case ToolStepKind.Tool: {
      const { summary } = getToolStepDisplay(rawToolName, toolInput);
      return summary ?? (rawToolName ? rawToolName.trim() : null);
    }
    default:
      return getToolStepDisplay(rawToolName, toolInput).summary;
  }
};

export type ToolStepResult =
  | { type: 'file'; path: string; name: string; diff: DiffStats | null }
  | { type: 'agent'; name: string }
  | { type: 'line'; text: string; number?: string };

const firstMeaningfulLine = (text: string): string | null => {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return truncatePreview(trimmed, 110);
  }
  return null;
};

const findPageTitle = (text: string): string | null => {
  const html = text.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
  if (html) return html[1].trim();
  const labelled = text.match(/^\s*(?:title|Title)\s*[:=]\s*(.{1,200})$/m);
  if (labelled) return labelled[1].trim();
  return null;
};

const countMatches = (text: string, pattern: RegExp): number => (text.match(pattern) ?? []).length;

const getDiffStats = (rawToolName: string, toolInput: Record<string, unknown> | undefined): DiffStats | null => {
  const diffs = extractDiffFromToolInput(rawToolName, toolInput);
  if (diffs && diffs.length > 0) {
    let added = 0;
    let removed = 0;
    for (const diff of diffs) {
      const stats = computeDiffStats(diff.oldStr, diff.newStr);
      added += stats.added;
      removed += stats.removed;
    }
    return { added, removed };
  }
  if (getToolStepKind(rawToolName) === ToolStepKind.Write && typeof toolInput?.content === 'string') {
    const content = toolInput.content;
    return { added: content.length === 0 ? 0 : content.split('\n').length, removed: 0 };
  }
  return null;
};

/**
 * What the step produced, for its result card: a file name with its icon, a
 * page title, a number, a short line.
 */
export const getToolStepResult = (
  group: ToolGroupItem,
  mapText: (value: string) => string = (value) => value,
): ToolStepResult | null => {
  const toolUse = group.toolUse;
  const toolResult: CoworkMessage | null | undefined = group.toolResult;
  const rawToolName = typeof toolUse.metadata?.toolName === 'string' ? toolUse.metadata.toolName : '';
  const toolInput = toolUse.metadata?.toolInput;
  const kind = getToolStepKind(rawToolName);
  const resultText = toolResult ? mapText(getToolResultRawText(toolResult)) : '';
  const isError = Boolean(toolResult?.metadata?.isError || toolResult?.metadata?.error);

  if (isError) {
    const line = hasText(resultText) ? firstMeaningfulLine(resultText) : null;
    return { type: 'line', text: line ?? getToolStepFailureText(kind) };
  }

  const filePath = getToolStepFilePath(rawToolName, toolInput);
  if (filePath) {
    return {
      type: 'file',
      path: filePath,
      name: getFileBasename(filePath),
      diff: kind === ToolStepKind.Read ? null : getDiffStats(rawToolName, toolInput),
    };
  }

  if (!toolResult) return null;

  if (kind === ToolStepKind.AgentStart) {
    const agent = getToolInputString(toolInput ?? {}, ['agentId', 'agent_id', 'label', 'name']);
    if (agent) return { type: 'agent', name: agent };
  }

  if (kind === ToolStepKind.WebPage || kind === ToolStepKind.Browser) {
    const title = hasText(resultText) ? findPageTitle(resultText) : null;
    const url = getToolInputString(toolInput ?? {}, ['url', 'href']);
    if (title) return { type: 'line', text: title };
    if (url) return { type: 'line', text: truncatePreview(url, 110) };
  }

  if (kind === ToolStepKind.WebSearch || kind === ToolStepKind.Library || kind === ToolStepKind.FindFiles) {
    if (hasText(resultText)) {
      const links = countMatches(resultText, /https?:\/\//g);
      const lines = resultText.split('\n').filter((line) => line.trim()).length;
      const count = kind === ToolStepKind.WebSearch ? links : lines;
      if (count > 0) {
        const key = count === 1 ? 'matiesStepResultOne' : 'matiesStepResultMany';
        return {
          type: 'line',
          text: i18nService.t(key).replace('{count}', String(count)),
          number: String(count),
        };
      }
    }
  }

  const line = hasText(resultText) ? firstMeaningfulLine(resultText) : null;
  return { type: 'line', text: line ?? i18nService.t('matiesStepDone') };
};

// ── Icons ────────────────────────────────────────────────────────────────────

const iconProps = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  style: { flex: `0 0 ${size}px` },
  'aria-hidden': true,
});

/** The tool's icon, 18 px beside the title, stroked in the surrounding colour. */
export const ToolStepIcon: React.FC<{ kind: ToolStepKind; size?: number; className?: string }> = ({
  kind,
  size = 18,
  className,
}) => {
  const props = { ...iconProps(size), className };
  switch (kind) {
    case ToolStepKind.Read:
      return (
        <svg {...props}>
          <path d="M6 3.5h7.5L19 9v11.5H6z" />
          <polyline points="13.2,3.6 13.2,9.2 18.8,9.2" />
          <line x1="9" y1="13" x2="15.5" y2="13" />
          <line x1="9" y1="16.5" x2="14" y2="16.5" />
        </svg>
      );
    case ToolStepKind.Write:
      return (
        <svg {...props}>
          <path d="M6 3.5h7.5L19 9v11.5H6z" />
          <polyline points="13.2,3.6 13.2,9.2 18.8,9.2" />
          <line x1="12.5" y1="12" x2="12.5" y2="18" />
          <line x1="9.5" y1="15" x2="15.5" y2="15" />
        </svg>
      );
    case ToolStepKind.Edit:
      return (
        <svg {...props}>
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
          <line x1="14.5" y1="6" x2="18" y2="9.5" />
        </svg>
      );
    case ToolStepKind.Command:
    case ToolStepKind.Process:
      return (
        <svg {...props}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
          <polyline points="7.5,9 10.5,12 7.5,15" />
          <line x1="12.5" y1="15" x2="16.5" y2="15" />
        </svg>
      );
    case ToolStepKind.WebSearch:
    case ToolStepKind.Library:
    case ToolStepKind.FindFiles:
    case ToolStepKind.Memory:
      return kind === ToolStepKind.Library ? (
        <svg {...props}>
          <path d="M4.5 5.5h4v13h-4z" />
          <path d="M10 5.5h4v13h-4z" />
          <path d="M15.6 6.2l3.6.9-2.8 11.3-3.3-1z" />
        </svg>
      ) : (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.6" />
          <line x1="16" y1="16" x2="20.5" y2="20.5" />
        </svg>
      );
    case ToolStepKind.WebPage:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <line x1="3.5" y1="12" x2="20.5" y2="12" />
          <path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
        </svg>
      );
    case ToolStepKind.Browser:
      return (
        <svg {...props}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
          <line x1="3.5" y1="9" x2="20.5" y2="9" />
          <circle cx="7" cy="6.8" r=".6" />
          <circle cx="9.6" cy="6.8" r=".6" />
        </svg>
      );
    case ToolStepKind.AgentStart:
    case ToolStepKind.AgentWait:
      return (
        <svg {...props}>
          <rect x="3.5" y="7.5" width="17" height="11.5" rx="2.2" />
          <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
          <line x1="3.5" y1="12.6" x2="20.5" y2="12.6" />
        </svg>
      );
    case ToolStepKind.Schedule:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.4" />
          <polyline points="12,7.4 12,12 15.4,14" />
        </svg>
      );
    case ToolStepKind.Plan:
      return (
        <svg {...props}>
          <polyline points="4.5,7 6.5,9 10,5.5" />
          <line x1="13" y1="7.3" x2="19.5" y2="7.3" />
          <polyline points="4.5,13.5 6.5,15.5 10,12" />
          <line x1="13" y1="13.8" x2="19.5" y2="13.8" />
          <line x1="13" y1="19.5" x2="19.5" y2="19.5" />
        </svg>
      );
    case ToolStepKind.Image:
    case ToolStepKind.Video:
      return (
        <svg {...props}>
          <rect x="3.5" y="5" width="17" height="14" rx="2.2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M20.5 15.5l-4.5-4.5-6 6.5" />
        </svg>
      );
    case ToolStepKind.Question:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1.9-1.1 1.8" />
          <circle cx="12" cy="16.8" r=".5" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <path d="M14 6.5l3.5 3.5L9 18.5H5.5V15z" />
          <path d="M18.5 3.5l2 2" />
          <line x1="16" y1="9" x2="19.5" y2="5.5" />
        </svg>
      );
  }
};
