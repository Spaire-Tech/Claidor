import React, { useEffect, useMemo, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkPermissionRequest, CoworkPermissionResult } from '../../types/cowork';
import ApprovalCardShell from './ApprovalCardShell';
import { ApprovalCard } from './CoworkPermissionModal';

interface CoworkQuestionWizardProps {
  permission: CoworkPermissionRequest;
  onRespond: (result: CoworkPermissionResult) => void;
  onMinimize?: () => void;
  /** Keep the wizard mounted (so in-progress answers survive) but visually hidden while minimized. */
  hidden?: boolean;
}

type QuestionOption = {
  label: string;
  description?: string;
};

type QuestionItem = {
  question: string;
  header?: string;
  options: QuestionOption[];
  multiSelect?: boolean;
};

const AUTO_ADVANCE_DELAY_MS = 220;

/** Enter is never the yes. */
const preventEnter = (event: React.KeyboardEvent<HTMLButtonElement>) => {
  if (event.key === 'Enter') event.preventDefault();
};

/**
 * The question's own header belongs in the question, not in a label above
 * it: one thing to read, not two. When the question already carries the
 * header's words, the header adds nothing and goes.
 */
export const composeQuestionText = (question: string, header?: string): string => {
  const trimmedHeader = header?.trim();
  if (!trimmedHeader) return question;
  if (question.toLowerCase().includes(trimmedHeader.toLowerCase())) return question;
  return `${trimmedHeader}: ${question}`;
};

/** The tick at the right of a chosen row: the one mark that says « this one ». */
const ChoiceTick: React.FC<{ selected: boolean }> = ({ selected }) => (
  <span className="flex-shrink-0" style={{ width: 16, height: 16, marginTop: 2 }} aria-hidden>
    {selected && (
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0060d0" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="5,12.5 10,17.5 19,7" />
      </svg>
    )}
  </span>
);

/**
 * Questions from the assistant (docs/maties/design.md): the same card as an
 * approval — the question in Newsreader, the options as full-width rows in
 * one column, one clear action at the bottom right. One question at a time;
 * the answers and the result are exactly what they were.
 */
const CoworkQuestionWizard: React.FC<CoworkQuestionWizardProps> = ({
  permission,
  onRespond,
  onMinimize,
  hidden = false,
}) => {
  const toolInput = useMemo(() => permission.toolInput ?? {}, [permission.toolInput]);

  const questions = useMemo<QuestionItem[]>(() => {
    if (permission.toolName !== 'AskUserQuestion') return [];
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
          options,
          multiSelect: Boolean(record.multiSelect),
        } as QuestionItem;
      })
      .filter(Boolean) as QuestionItem[];
  }, [permission.toolName, toolInput]);

  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({});
  const [openOtherSteps, setOpenOtherSteps] = useState<Record<number, boolean>>({});
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
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
    setOtherInputs({});
    setOpenOtherSteps({});
    setCurrentStep(0);
  }, [permission.requestId, toolInput]);

  useEffect(() => () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
  }, []);

  // The field appears where the person just clicked, ready to be written in.
  useEffect(() => {
    if (openOtherSteps[currentStep]) {
      otherInputRef.current?.focus();
    }
  }, [openOtherSteps, currentStep]);

  if (questions.length === 0) {
    return null;
  }

  const totalSteps = questions.length;
  const stepIndex = Math.min(currentStep, totalSteps - 1);
  const currentQuestion = questions[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === totalSteps - 1;

  const clearPendingAdvance = () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  };

  const getSelectedValues = (question: QuestionItem): string[] => {
    const rawValue = answers[question.question] ?? '';
    if (!rawValue) return [];
    if (!question.multiSelect) return [rawValue];
    return rawValue
      .split('|||')
      .map((value) => value.trim())
      .filter(Boolean);
  };

  const goToStep = (index: number) => {
    clearPendingAdvance();
    setCurrentStep(Math.max(0, Math.min(index, totalSteps - 1)));
  };

  const closeOtherIfEmpty = () => {
    setOpenOtherSteps((prev) => {
      if (!prev[stepIndex] || otherInputs[stepIndex]?.trim()) return prev;
      const next = { ...prev };
      delete next[stepIndex];
      return next;
    });
  };

  const handleSelectOption = (question: QuestionItem, optionLabel: string) => {
    if (!question.multiSelect) {
      setAnswers((prev) => ({
        ...prev,
        [question.question]: optionLabel,
      }));
      // Single choice and "Something else" are mutually exclusive: clear the custom input when an option is selected
      setOtherInputs((prev) => {
        if (!prev[stepIndex]) return prev;
        const next = { ...prev };
        delete next[stepIndex];
        return next;
      });
      setOpenOtherSteps((prev) => {
        if (!prev[stepIndex]) return prev;
        const next = { ...prev };
        delete next[stepIndex];
        return next;
      });

      // Auto-advance to the next question after a single-choice selection (brief pause to show the selection feedback)
      clearPendingAdvance();
      advanceTimerRef.current = setTimeout(() => {
        advanceTimerRef.current = null;
        setCurrentStep((prevStep) => {
          const nextStep = prevStep + 1;
          return nextStep < questions.length ? nextStep : prevStep;
        });
      }, AUTO_ADVANCE_DELAY_MS);
    } else {
      setAnswers((prev) => {
        const rawValue = prev[question.question] ?? '';

        if (!rawValue.trim()) {
          return {
            ...prev,
            [question.question]: optionLabel,
          };
        }

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

        if (current.size === 0) {
          const newAnswers = { ...prev };
          delete newAnswers[question.question];
          return newAnswers;
        }

        return {
          ...prev,
          [question.question]: Array.from(current).join('|||'),
        };
      });
    }
  };

  const handleToggleOther = () => {
    clearPendingAdvance();
    setOpenOtherSteps((prev) => {
      const next = { ...prev };
      if (prev[stepIndex] && !otherInputs[stepIndex]?.trim()) {
        delete next[stepIndex];
      } else {
        next[stepIndex] = true;
      }
      return next;
    });
  };

  const handleOtherInputChange = (value: string) => {
    setOtherInputs((prev) => ({
      ...prev,
      [stepIndex]: value,
    }));
    if (value.trim() && !currentQuestion.multiSelect) {
      // Single choice and "Something else" are mutually exclusive: deselect the chosen option when a custom answer is typed
      setAnswers((prev) => {
        if (!(currentQuestion.question in prev)) return prev;
        const next = { ...prev };
        delete next[currentQuestion.question];
        return next;
      });
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      closeOtherIfEmpty();
      goToStep(stepIndex - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      closeOtherIfEmpty();
      goToStep(stepIndex + 1);
    }
  };

  const handleSubmit = () => {
    // Merge "Something else" inputs into answers
    const finalAnswers = { ...answers };
    Object.entries(otherInputs).forEach(([index, otherValue]) => {
      const question = questions[Number(index)];
      if (question && otherValue.trim()) {
        if (question.multiSelect) {
          const existingAnswers = finalAnswers[question.question]?.split('|||').map(a => a.trim()).filter(Boolean) || [];
          finalAnswers[question.question] = [...existingAnswers, otherValue.trim()].join('|||');
        } else {
          finalAnswers[question.question] = otherValue.trim();
        }
      }
    });

    onRespond({
      behavior: 'allow',
      updatedInput: {
        ...(toolInput && typeof toolInput === 'object' ? toolInput : {}),
        answers: finalAnswers,
      },
    });
  };

  const handleDeny = () => {
    onRespond({
      behavior: 'deny',
      message: 'Permission denied',
    });
  };

  const selectedValues = getSelectedValues(currentQuestion);
  const otherValue = otherInputs[stepIndex] ?? '';
  const hasOtherAnswer = Boolean(otherValue.trim());
  const isOtherOpen = Boolean(openOtherSteps[stepIndex]) || hasOtherAnswer;

  return (
    <ApprovalCardShell slotKeys={[permission.toolUseId, permission.requestId]} hidden={hidden}>
      <ApprovalCard>
        {(totalSteps > 1 || onMinimize) && (
          <div className="flex items-center gap-2" data-cowork-search-exclude="true">
            {totalSteps > 1 && (
              <span className="maties-meta">
                {i18nService.t('matiesQuestionProgress')
                  .replace('{index}', String(stepIndex + 1))
                  .replace('{total}', String(totalSteps))}
              </span>
            )}
            <span className="flex-1" />
            {/* « Later » is one small control out of the way, not a button beside the answer. */}
            {onMinimize && (
              <button
                type="button"
                onClick={onMinimize}
                className="maties-icon-button"
                style={{ borderRadius: 999, marginRight: -4, marginTop: -4 }}
                title={i18nService.t('matiesAnswerLater')}
                aria-label={i18nService.t('matiesAnswerLater')}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            )}
          </div>
        )}

        <div key={stepIndex} className="maties-in flex flex-col gap-4">
          <div className="maties-prose" style={{ fontSize: 17.5 }}>
            {composeQuestionText(currentQuestion.question, currentQuestion.header)}
          </div>
          {currentQuestion.multiSelect && (
            <div className="maties-caption">{i18nService.t('coworkQuestionWizardMultiSelectHint')}</div>
          )}

          <div className="flex flex-col gap-2" role="group">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedValues.includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleSelectOption(currentQuestion, option.label)}
                  className="maties-choice-row"
                  aria-pressed={isSelected}
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="maties-choice-label">{option.label}</span>
                    {option.description && (
                      <span className="maties-choice-description">{option.description}</span>
                    )}
                  </span>
                  <ChoiceTick selected={isSelected} />
                </button>
              );
            })}

            {/* « Something else »: the last row, and the field appears only when it is chosen. */}
            {isOtherOpen ? (
              <label className="maties-choice-row" data-selected={hasOtherAnswer} style={{ cursor: 'text' }}>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="maties-choice-label">{i18nService.t('matiesQuestionOther')}</span>
                  <input
                    ref={otherInputRef}
                    type="text"
                    value={otherValue}
                    onChange={(e) => handleOtherInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter moves on; it never submits the whole set of answers.
                      if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                      e.preventDefault();
                      if (!isLastStep) handleNext();
                    }}
                    placeholder={i18nService.t('matiesQuestionOtherPlaceholder')}
                    className="w-full bg-transparent focus:outline-none"
                    style={{ fontSize: 13.5, color: '#1c1f23' }}
                  />
                </span>
                <ChoiceTick selected={hasOtherAnswer} />
              </label>
            ) : (
              <button
                type="button"
                onClick={handleToggleOther}
                className="maties-choice-row"
                aria-pressed={false}
              >
                <span className="maties-choice-label min-w-0 flex-1">{i18nService.t('matiesQuestionOther')}</span>
                <ChoiceTick selected={false} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ paddingTop: 6 }}>
          {!isFirstStep && (
            <button
              type="button"
              onClick={handlePrevious}
              className="maties-button maties-button-ghost"
              style={{ color: '#8f96a0' }}
            >
              {i18nService.t('matiesQuestionBack')}
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={handleDeny} className="maties-button maties-button-ghost">
            {i18nService.t('matiesNotNow')}
          </button>
          <button
            type="button"
            onClick={isLastStep ? handleSubmit : handleNext}
            onKeyDown={preventEnter}
            className="maties-button maties-button-primary"
          >
            {i18nService.t(isLastStep ? 'matiesQuestionDone' : 'matiesQuestionNext')}
          </button>
        </div>
      </ApprovalCard>
    </ApprovalCardShell>
  );
};

export default CoworkQuestionWizard;
