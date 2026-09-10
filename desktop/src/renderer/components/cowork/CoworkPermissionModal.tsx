import React, { useEffect, useMemo, useState } from 'react';

import { ASK_USER_QUESTION_TOOL_NAME } from '../../../shared/cowork/constants';
import { i18nService } from '../../services/i18n';
import type { CoworkPermissionRequest, CoworkPermissionResult } from '../../types/cowork';
import ApprovalCardShell from './ApprovalCardShell';
import { getToolStepKind, getToolStepTitle } from './toolStepPresentation';

type DangerLevel = 'safe' | 'caution' | 'destructive';

const POSITIVE_CONFIRM_PATTERNS = [
  /\ballow\b/i,
  /\bapprove\b/i,
  /\bconfirm\b/i,
  /\bcontinue\b/i,
  /\byes\b/i,
  /\bdelete\b/i,
] as const;

const NEGATIVE_CONFIRM_PATTERNS = [
  /\bcancel\b/i,
  /\bdeny\b/i,
  /\breject\b/i,
  /\babort\b/i,
  /\bno\b/i,
  /\bstop\b/i,
] as const;

/**
 * The approval card's words, per kind of step (docs/maties/design.md,
 * « Approval »): one plain sentence of what will happen, the action verb,
 * and one line of consequence. The card never says « execute » or
 * « permission ».
 */
const APPROVAL_WORDS_BY_REASON: Record<string, { sentenceKey: string; verbKey: string; consequenceKey: string }> = {
  'recursive-delete': { sentenceKey: 'matiesApprovalDeleteFolder', verbKey: 'matiesDelete', consequenceKey: 'matiesConsequenceIrreversible' },
  'file-delete': { sentenceKey: 'matiesApprovalDeleteFiles', verbKey: 'matiesDelete', consequenceKey: 'matiesConsequenceIrreversible' },
  'git-force-push': { sentenceKey: 'matiesApprovalGitForcePush', verbKey: 'matiesPush', consequenceKey: 'matiesConsequenceIrreversible' },
  'git-reset-hard': { sentenceKey: 'matiesApprovalGitResetHard', verbKey: 'matiesDiscard', consequenceKey: 'matiesConsequenceIrreversible' },
  'disk-overwrite': { sentenceKey: 'matiesApprovalDisk', verbKey: 'matiesRun', consequenceKey: 'matiesConsequenceIrreversible' },
  'disk-format': { sentenceKey: 'matiesApprovalDisk', verbKey: 'matiesRun', consequenceKey: 'matiesConsequenceIrreversible' },
  'git-push': { sentenceKey: 'matiesApprovalGitPush', verbKey: 'matiesPush', consequenceKey: 'matiesConsequenceShared' },
  'process-kill': { sentenceKey: 'matiesApprovalProcessKill', verbKey: 'matiesStop', consequenceKey: 'matiesConsequenceChanges' },
  'permission-change': { sentenceKey: 'matiesApprovalPermissions', verbKey: 'matiesAllow', consequenceKey: 'matiesConsequenceChanges' },
};

/** Fallback detection when dangerLevel is not provided by the adapter */
function detectDangerLevelFromCommand(command: string): DangerLevel {
  const destructivePatterns = [
    /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|--recursive)\b/i,
    /\bgit\s+push\s+.*--force\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bdd\b/i,
    /\bmkfs\b/i,
  ];
  if (destructivePatterns.some(p => p.test(command))) return 'destructive';

  const cautionPatterns = [
    /\b(rm|rmdir|unlink|del|erase|remove-item|trash)\b/i,
    /\bgit\s+push\b/i,
    /\b(kill|killall|pkill)\b/i,
    /\b(chmod|chown)\b/i,
    /\bgit\s+clean\b/i,
    /\bsudo\b/i,
  ];
  if (cautionPatterns.some(p => p.test(command))) return 'caution';

  return 'safe';
}

/** Fallback reason when the adapter gives none: the same buckets it uses. */
function detectDangerReasonFromCommand(command: string): string {
  if (/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f?|--recursive)\b/i.test(command)) return 'recursive-delete';
  if (/\bgit\s+push\s+.*--force\b/i.test(command)) return 'git-force-push';
  if (/\bgit\s+reset\s+--hard\b/i.test(command)) return 'git-reset-hard';
  if (/\b(dd|mkfs)\b/i.test(command)) return 'disk-overwrite';
  if (/\b(rm|rmdir|unlink|del|erase|remove-item|trash)\b/i.test(command)) return 'file-delete';
  if (/\bgit\s+push\b/i.test(command)) return 'git-push';
  if (/\b(kill|killall|pkill)\b/i.test(command)) return 'process-kill';
  if (/\b(chmod|chown)\b/i.test(command)) return 'permission-change';
  return '';
}

interface CoworkPermissionModalProps {
  permission: CoworkPermissionRequest;
  onRespond: (result: CoworkPermissionResult) => void;
  onMinimize?: () => void;
  /** Keep the card mounted (so in-progress answers survive) but visually hidden while minimized. */
  hidden?: boolean;
}

type QuestionOption = {
  label: string;
  description?: string;
};

const renderTextWithLinks = (text: string): React.ReactNode[] => {
  const pattern = /\[([^\]]+)\]\(([^)]+)\)|~~([^~]+)~~/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1] && match[2]) {
      const linkText = match[1];
      const linkUrl = match[2];
      parts.push(
        <a
          key={match.index}
          href="#"
          onClick={(e) => {
            e.preventDefault();
            (window as any).electron?.shell?.openExternal(linkUrl);
          }}
          style={{ color: '#1c1f23', textDecoration: 'underline', textUnderlineOffset: 2 }}
        >
          {linkText}
        </a>
      );
    } else if (match[3]) {
      parts.push(
        <span key={match.index} style={{ color: '#8f96a0' }}>
          {match[3]}
        </span>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

const renderSubtitleWithHighlight = (text: string): React.ReactNode[] => {
  const boldPattern = /\*\*([^*]+)\*\*/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} style={{ fontWeight: 500, color: '#1c1f23' }}>
        {match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
};

type QuestionItem = {
  question: string;
  header?: string;
  title?: string;
  subtitle?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

const looksPositiveConfirmOption = (label: string): boolean => {
  return POSITIVE_CONFIRM_PATTERNS.some((pattern) => pattern.test(label));
};

const looksNegativeConfirmOption = (label: string): boolean => {
  return NEGATIVE_CONFIRM_PATTERNS.some((pattern) => pattern.test(label));
};

const resolveConfirmModeButtons = (question: QuestionItem): { primary: QuestionOption; secondary: QuestionOption } => {
  const [firstOption, secondOption] = question.options;
  if (!firstOption || !secondOption) {
    throw new Error('Confirm mode requires exactly two options.');
  }

  const firstIsNegative = looksNegativeConfirmOption(firstOption.label);
  const secondIsNegative = looksNegativeConfirmOption(secondOption.label);
  if (firstIsNegative && !secondIsNegative) {
    return { primary: secondOption, secondary: firstOption };
  }

  const firstIsPositive = looksPositiveConfirmOption(firstOption.label);
  const secondIsPositive = looksPositiveConfirmOption(secondOption.label);
  if (!firstIsPositive && secondIsPositive) {
    return { primary: secondOption, secondary: firstOption };
  }

  return { primary: firstOption, secondary: secondOption };
};

/** Enter is never the yes: the blue button only answers to a click or the space bar. */
const preventEnter = (event: React.KeyboardEvent<HTMLButtonElement>) => {
  if (event.key === 'Enter') event.preventDefault();
};

// ── The card's pieces ────────────────────────────────────────────────────────

export const ApprovalSentence: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 15, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.4, color: '#1c1f23', textWrap: 'pretty' }}>
    {children}
  </div>
);

/** The exact thing, in JetBrains Mono on #f6f7f9, scrollable if long. */
export const ApprovalExact: React.FC<{ text: string; label?: string }> = ({ text, label }) => (
  <div className="maties-inset" style={{ padding: '10px 14px', maxHeight: 180, overflow: 'auto' }} aria-label={label}>
    <pre className="maties-mono whitespace-pre-wrap break-words" style={{ fontSize: 12.5, lineHeight: 1.55, color: '#1c1f23', margin: 0 }}>
      {text}
    </pre>
  </div>
);

export const ApprovalConsequence: React.FC<{ children: React.ReactNode; tone?: 'plain' | 'warn' }> = ({ children, tone = 'plain' }) => (
  <div style={{ fontSize: 13.5, letterSpacing: '-.006em', lineHeight: 1.45, color: tone === 'warn' ? '#c8790a' : '#4a4f57' }}>
    {children}
  </div>
);

export const ApprovalButtons: React.FC<{
  onNotNow: () => void;
  notNowLabel?: string;
  onYes: () => void;
  yesLabel: string;
  yesDisabled?: boolean;
  onLater?: () => void;
  leading?: React.ReactNode;
}> = ({ onNotNow, notNowLabel, onYes, yesLabel, yesDisabled = false, onLater, leading }) => (
  <div className="flex flex-wrap items-center gap-2" style={{ paddingTop: 2 }}>
    {leading}
    {onLater && (
      <button type="button" onClick={onLater} className="maties-button maties-button-ghost" style={{ color: '#8f96a0' }}>
        {i18nService.t('matiesLater')}
      </button>
    )}
    <span className="flex-1" />
    <button type="button" onClick={onNotNow} className="maties-button maties-button-ghost">
      {notNowLabel ?? i18nService.t('matiesNotNow')}
    </button>
    <button
      type="button"
      onClick={onYes}
      onKeyDown={preventEnter}
      disabled={yesDisabled}
      className="maties-button maties-button-primary"
    >
      {yesLabel}
    </button>
  </div>
);

export const ApprovalCard: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="maties-card flex flex-col gap-3" style={{ padding: '16px 18px 14px 18px', alignSelf: 'stretch' }}>
    {children}
  </div>
);

// ── CoworkPermissionModal ────────────────────────────────────────────────────

/**
 * The approval (docs/maties/design.md, « Approval »). The name is
 * historical: it is no longer a modal but the step's result card. The
 * request, the answers and `onRespond` are exactly what they were.
 */
const CoworkPermissionModal: React.FC<CoworkPermissionModalProps> = ({
  permission,
  onRespond,
  onMinimize,
  hidden = false,
}) => {
  const toolInput = useMemo(() => permission.toolInput ?? {}, [permission.toolInput]);

  const questions = useMemo<QuestionItem[]>(() => {
    if (permission.toolName !== ASK_USER_QUESTION_TOOL_NAME) return [];
    if (!toolInput || typeof toolInput !== 'object') return [];
    const rawQuestions = (toolInput as Record<string, unknown>).questions;
    if (!Array.isArray(rawQuestions)) return [];

    return rawQuestions
      .map((question) => {
        if (!question || typeof question !== 'object') return null;
        const record = question as Record<string, unknown>;
        const options = Array.isArray(record.options)
          ? record.options
              .map((option) => {
                if (!option || typeof option !== 'object') return null;
                const optionRecord = option as Record<string, unknown>;
                if (typeof optionRecord.label !== 'string') return null;
                return {
                  label: optionRecord.label,
                  description: typeof optionRecord.description === 'string'
                    ? optionRecord.description
                    : undefined,
                } as QuestionOption;
              })
              .filter(Boolean) as QuestionOption[]
          : [];

        if (typeof record.question !== 'string' || options.length === 0) {
          return null;
        }

        return {
          question: record.question,
          header: typeof record.header === 'string' ? record.header : undefined,
          title: typeof record.title === 'string' ? record.title : undefined,
          subtitle: typeof record.subtitle === 'string' ? record.subtitle : undefined,
          options,
          multiSelect: Boolean(record.multiSelect),
        } as QuestionItem;
      })
      .filter(Boolean) as QuestionItem[];
  }, [permission.toolName, toolInput]);

  const isQuestionTool = questions.length > 0;

  // Detect simple confirm mode: 1 question with exactly 2 options.
  // In this case, render a compact two-button dialog, but preserve the actual
  // option labels instead of assuming fixed allow/deny semantics.
  const isConfirmMode = isQuestionTool
    && questions.length === 1
    && questions[0].options.length === 2
    && !questions[0].multiSelect;

  const confirmModeButtons = useMemo(() => {
    if (!isConfirmMode) return null;
    return resolveConfirmModeButtons(questions[0]);
  }, [isConfirmMode, questions]);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isQuestionTool) {
      setAnswers({});
      return;
    }

    const rawAnswers = (toolInput as Record<string, unknown>).answers;
    if (rawAnswers && typeof rawAnswers === 'object') {
      const initial: Record<string, string> = {};
      Object.entries(rawAnswers as Record<string, unknown>).forEach(([key, value]) => {
        if (typeof value === 'string') {
          initial[key] = value;
        }
      });
      setAnswers(initial);
    } else {
      setAnswers({});
    }
  }, [isQuestionTool, permission.requestId, toolInput]);

  const formatToolInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  const requestedCommand = useMemo(() => {
    if (!toolInput || typeof toolInput !== 'object') {
      return '';
    }
    const context = (toolInput as Record<string, unknown>).context;
    if (!context || typeof context !== 'object') {
      return '';
    }
    const requestedToolInput = (context as Record<string, unknown>).requestedToolInput;
    if (!requestedToolInput || typeof requestedToolInput !== 'object') {
      return '';
    }
    const command = (requestedToolInput as Record<string, unknown>).command;
    return typeof command === 'string' ? command.trim() : '';
  }, [toolInput]);

  const buildQuestionAnswerResult = (question: string, answer: string): CoworkPermissionResult => {
    return {
      behavior: 'allow',
      updatedInput: {
        ...(toolInput && typeof toolInput === 'object' ? toolInput : {}),
        answers: { [question]: answer },
      },
    };
  };

  const isBashTool = permission.toolName === 'Bash';
  const isPluginApproval = (toolInput as Record<string, unknown>).approvalKind === 'plugin';

  const { dangerLevel, dangerReason } = useMemo(() => {
    const questionText = isConfirmMode ? questions[0]?.question ?? '' : '';
    const looksLikeDeleteQuestion = requestedCommand
      ? detectDangerLevelFromCommand(requestedCommand) !== 'safe'
      : /\b(delete|remove|rm|unlink|rmdir|erase|del)\b/i.test(questionText);

    if (permission.toolName === ASK_USER_QUESTION_TOOL_NAME && looksLikeDeleteQuestion) {
      return { dangerLevel: 'caution' as DangerLevel, dangerReason: 'file-delete' };
    }
    if (!isBashTool) {
      return { dangerLevel: 'safe' as DangerLevel, dangerReason: '' };
    }
    const input = permission.toolInput as Record<string, unknown>;
    const command = String(input?.command ?? '');

    // Prefer adapter-provided level, fall back to local detection
    const level = (typeof input?.dangerLevel === 'string' && ['safe', 'caution', 'destructive'].includes(input.dangerLevel))
      ? input.dangerLevel as DangerLevel
      : detectDangerLevelFromCommand(command);

    const reason = typeof input?.dangerReason === 'string' && input.dangerReason
      ? input.dangerReason
      : detectDangerReasonFromCommand(command);

    return { dangerLevel: level, dangerReason: reason };
  }, [isBashTool, isConfirmMode, permission.toolName, permission.toolInput, questions, requestedCommand]);

  const getSelectedValues = (question: QuestionItem): string[] => {
    const rawValue = answers[question.question] ?? '';
    if (!rawValue) return [];
    if (!question.multiSelect) return [rawValue];
    return rawValue
      .split('|||')
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const handleSelectOption = (question: QuestionItem, optionLabel: string) => {
    setAnswers((prev) => {
      if (!question.multiSelect) {
        return { ...prev, [question.question]: optionLabel };
      }

      const rawValue = prev[question.question] ?? '';
      const current = new Set(
        rawValue
          .split('|||')
          .map((value) => value.trim())
          .filter(Boolean)
      );
      if (current.has(optionLabel)) {
        current.delete(optionLabel);
      } else {
        current.add(optionLabel);
      }

      return {
        ...prev,
        [question.question]: Array.from(current).join('|||'),
      };
    });
  };

  const isComplete = isQuestionTool && !isConfirmMode
    ? questions.every((question) => (answers[question.question] ?? '').trim())
    : true;

  const handleConfirmModeSelect = (optionLabel: string) => {
    if (!isConfirmMode) return;
    onRespond(buildQuestionAnswerResult(questions[0].question, optionLabel));
  };

  const handleApprove = () => {
    if (isConfirmMode) {
      handleConfirmModeSelect(confirmModeButtons?.primary.label ?? questions[0].options[0].label);
      return;
    }

    if (isQuestionTool) {
      if (!isComplete) return;
      onRespond({
        behavior: 'allow',
        updatedInput: {
          ...(toolInput && typeof toolInput === 'object' ? toolInput : {}),
          answers,
        },
      });
      return;
    }

    onRespond({
      behavior: 'allow',
      updatedInput: toolInput && typeof toolInput === 'object' ? toolInput : {},
    });
  };

  const handleDeny = () => {
    onRespond({
      behavior: 'deny',
      message: 'Permission denied',
    });
  };

  // ── The words ──────────────────────────────────────────────────────────────

  const words = (() => {
    if (isConfirmMode) {
      const question = questions[0];
      return {
        sentence: question.title ?? i18nService.t('matiesApprovalQuestion'),
        exact: requestedCommand || null,
        consequence: dangerReason && APPROVAL_WORDS_BY_REASON[dangerReason]
          ? i18nService.t(APPROVAL_WORDS_BY_REASON[dangerReason].consequenceKey)
          : null,
        verb: confirmModeButtons?.primary.label ?? i18nService.t('matiesContinue'),
        notNow: confirmModeButtons?.secondary.label ?? i18nService.t('matiesNotNow'),
      };
    }
    if (isQuestionTool) {
      return {
        sentence: i18nService.t('matiesApprovalQuestion'),
        exact: requestedCommand || null,
        consequence: i18nService.t('matiesConsequenceAnswer'),
        verb: i18nService.t('matiesContinue'),
        notNow: i18nService.t('matiesNotNow'),
      };
    }
    if (isBashTool) {
      const input = permission.toolInput as Record<string, unknown>;
      const command = String(input?.command ?? '').trim();
      const cwd = typeof input?.cwd === 'string' && input.cwd.trim() ? input.cwd.trim() : '';
      const known = APPROVAL_WORDS_BY_REASON[dangerReason];
      const sentence = known ? i18nService.t(known.sentenceKey) : i18nService.t('matiesApprovalCommand');
      const consequence = known
        ? i18nService.t(known.consequenceKey)
        : i18nService.t(dangerLevel === 'safe' ? 'matiesConsequenceRuns' : 'matiesConsequenceChanges');
      return {
        sentence,
        exact: cwd ? `${command}\n\n${i18nService.t('matiesApprovalInFolder').replace('{folder}', cwd)}` : command,
        consequence,
        verb: i18nService.t(known ? known.verbKey : 'matiesRun'),
        notNow: i18nService.t('matiesNotNow'),
      };
    }
    if (isPluginApproval) {
      const input = permission.toolInput as Record<string, unknown>;
      const title = typeof input.title === 'string' && input.title.trim() ? input.title.trim() : null;
      const description = typeof input.description === 'string' && input.description.trim() ? input.description.trim() : null;
      const tool = typeof input.toolName === 'string' && input.toolName.trim() ? input.toolName.trim() : permission.toolName;
      return {
        sentence: title ?? i18nService.t('matiesApprovalPlugin').replace('{tool}', tool),
        exact: description,
        consequence: i18nService.t('matiesConsequenceRuns'),
        verb: i18nService.t('matiesAllow'),
        notNow: i18nService.t('matiesNotNow'),
      };
    }
    const kind = getToolStepKind(permission.toolName);
    return {
      sentence: `${i18nService.t('matiesApprovalGeneric')} — ${getToolStepTitle(kind).toLowerCase()}`,
      exact: formatToolInput(permission.toolInput),
      consequence: i18nService.t('matiesConsequenceRuns'),
      verb: i18nService.t('matiesAllow'),
      notNow: i18nService.t('matiesNotNow'),
    };
  })();

  const consequenceTone = dangerLevel === 'destructive' ? 'warn' : 'plain';

  return (
    <ApprovalCardShell slotKeys={[permission.toolUseId, permission.requestId]} hidden={hidden}>
      <ApprovalCard>
        <ApprovalSentence>
          {isConfirmMode ? renderTextWithLinks(words.sentence) : words.sentence}
        </ApprovalSentence>
        {isConfirmMode && questions[0].subtitle && (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#4a4f57' }}>
            {renderSubtitleWithHighlight(questions[0].subtitle)}
          </div>
        )}
        {isConfirmMode && questions[0].title && questions[0].question !== questions[0].title && (
          <div style={{ fontSize: 14, lineHeight: 1.5, color: '#4a4f57', whiteSpace: 'pre-wrap' }}>
            {renderTextWithLinks(questions[0].question)}
          </div>
        )}
        {isQuestionTool && !isConfirmMode && questions.map((question) => {
          const selectedValues = getSelectedValues(question);
          return (
            <div key={question.question} className="flex flex-col gap-3">
              <div className="maties-prose" style={{ fontSize: 17.5 }}>
                {question.header && (
                  <span className="maties-meta mr-2 uppercase" style={{ fontFamily: 'Instrument Sans, sans-serif', letterSpacing: '.06em', fontSize: 11.5 }}>
                    {question.header}
                  </span>
                )}
                {question.question}
              </div>
              <div className="flex flex-wrap gap-2" role={question.multiSelect ? 'group' : 'radiogroup'}>
                {question.options.map((option) => {
                  const isSelected = selectedValues.includes(option.label);
                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleSelectOption(question, option.label)}
                      className="maties-pill"
                      aria-pressed={isSelected}
                      title={option.description}
                    >
                      <span>{option.label}</span>
                      {option.description && (
                        <span style={{ fontSize: 12.5, opacity: .7 }}>{option.description}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
        {words.exact && <ApprovalExact text={words.exact} />}
        {words.consequence && (
          <ApprovalConsequence tone={consequenceTone}>{words.consequence}</ApprovalConsequence>
        )}
        <ApprovalButtons
          onNotNow={isConfirmMode && confirmModeButtons ? () => handleConfirmModeSelect(confirmModeButtons.secondary.label) : handleDeny}
          notNowLabel={words.notNow}
          onYes={handleApprove}
          yesLabel={words.verb}
          yesDisabled={!isComplete}
          onLater={onMinimize}
        />
      </ApprovalCard>
    </ApprovalCardShell>
  );
};

export default CoworkPermissionModal;
