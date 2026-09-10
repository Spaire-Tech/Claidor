import React, { useEffect, useMemo, useRef, useState } from 'react';

import { i18nService } from '../../services/i18n';
import type { CoworkPermissionRequest, CoworkPermissionResult } from '../../types/cowork';
import ApprovalCardShell from './ApprovalCardShell';
import { ApprovalCard, ApprovalConsequence } from './CoworkPermissionModal';

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
 * Questions from the assistant (docs/maties/design.md): the same card as
 * an approval — the question in Newsreader 17.5 px, the options as pills,
 * one selected, « Continue » in blue. One question at a time; the answers
 * and the result are exactly what they were.
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
  const [skippedSteps, setSkippedSteps] = useState<Record<number, boolean>>({});
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSkippedSteps({});
    setCurrentStep(0);
  }, [permission.requestId, toolInput]);

  useEffect(() => () => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
  }, []);

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

  const hasAnswer = (index: number): boolean => {
    const question = questions[index];
    return Boolean(answers[question.question]?.trim()) || Boolean(otherInputs[index]?.trim());
  };

  const isStepResolved = (index: number): boolean => hasAnswer(index) || Boolean(skippedSteps[index]);

  const allResolved = questions.every((_, index) => isStepResolved(index));

  const goToStep = (index: number) => {
    clearPendingAdvance();
    setCurrentStep(Math.max(0, Math.min(index, totalSteps - 1)));
  };

  const handleSelectOption = (question: QuestionItem, optionLabel: string) => {
    setSkippedSteps((prev) => {
      if (!prev[stepIndex]) return prev;
      const next = { ...prev };
      delete next[stepIndex];
      return next;
    });

    if (!question.multiSelect) {
      setAnswers((prev) => ({
        ...prev,
        [question.question]: optionLabel,
      }));
      // Single choice and "Other" are mutually exclusive: clear the custom input when an option is selected
      setOtherInputs((prev) => {
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

  const handleOtherInputChange = (value: string) => {
    setOtherInputs((prev) => ({
      ...prev,
      [stepIndex]: value,
    }));
    if (value.trim()) {
      setSkippedSteps((prev) => {
        if (!prev[stepIndex]) return prev;
        const next = { ...prev };
        delete next[stepIndex];
        return next;
      });
      // Single choice and "Other" are mutually exclusive: deselect the chosen option when a custom answer is typed
      if (!currentQuestion.multiSelect) {
        setAnswers((prev) => {
          if (!(currentQuestion.question in prev)) return prev;
          const next = { ...prev };
          delete next[currentQuestion.question];
          return next;
        });
      }
    }
  };

  const handlePrevious = () => {
    if (!isFirstStep) {
      goToStep(stepIndex - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      goToStep(stepIndex + 1);
    }
  };

  const handleSkip = () => {
    clearPendingAdvance();
    setAnswers((prev) => {
      const newAnswers = { ...prev };
      delete newAnswers[currentQuestion.question];
      return newAnswers;
    });
    setOtherInputs((prev) => {
      const newInputs = { ...prev };
      delete newInputs[stepIndex];
      return newInputs;
    });
    setSkippedSteps((prev) => ({
      ...prev,
      [stepIndex]: true,
    }));

    if (!isLastStep) {
      handleNext();
    }
  };

  const handleSubmit = () => {
    // Merge "Other" inputs into answers
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
  const isOtherActive = Boolean(otherValue.trim());
  const isCurrentSkipped = Boolean(skippedSteps[stepIndex]) && !hasAnswer(stepIndex);

  return (
    <ApprovalCardShell slotKeys={[permission.toolUseId, permission.requestId]} hidden={hidden}>
      <ApprovalCard>
        <div className="flex items-center gap-2" data-cowork-search-exclude="true">
          <span className="maties-meta">
            {totalSteps > 1
              ? i18nService.t('matiesQuestionOf').replace('{index}', String(stepIndex + 1)).replace('{total}', String(totalSteps))
              : i18nService.t('matiesApprovalQuestion')}
          </span>
          {totalSteps > 1 && (
            <span className="flex items-center gap-1" aria-hidden>
              {questions.map((question, index) => {
                const isActive = index === stepIndex;
                const answered = hasAnswer(index);
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => goToStep(index)}
                    title={question.question}
                    style={{
                      width: isActive ? 16 : 6,
                      height: 6,
                      borderRadius: 999,
                      background: isActive ? '#0060d0' : answered ? 'rgba(0,96,208,.35)' : 'rgba(16,22,35,.12)',
                      transition: 'width .18s ease, background .18s ease',
                    }}
                  />
                );
              })}
            </span>
          )}
          {currentQuestion.header && (
            <span className="maties-meta uppercase" style={{ letterSpacing: '.06em', fontSize: 11.5 }}>
              {currentQuestion.header}
            </span>
          )}
          {isCurrentSkipped && (
            <span className="maties-meta">{i18nService.t('coworkQuestionWizardSkipped')}</span>
          )}
        </div>

        <div key={stepIndex} className="maties-in flex flex-col gap-3">
          <div className="maties-prose" style={{ fontSize: 17.5 }}>
            {currentQuestion.question}
          </div>
          {currentQuestion.multiSelect && (
            <div className="maties-caption">{i18nService.t('coworkQuestionWizardMultiSelectHint')}</div>
          )}

          <div className="flex flex-wrap gap-2" role={currentQuestion.multiSelect ? 'group' : 'radiogroup'}>
            {currentQuestion.options.map((option) => {
              const isSelected = selectedValues.includes(option.label);
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleSelectOption(currentQuestion, option.label)}
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

          {/* « Something else »: the person's own words, in the same pill shape. */}
          <label
            className="maties-pill"
            style={{ cursor: 'text', paddingRight: 16, ...(isOtherActive ? { boxShadow: 'inset 0 0 0 1px rgba(0,96,208,.45)' } : undefined) }}
          >
            <span style={{ color: isOtherActive ? '#1c1f23' : '#8f96a0', flex: '0 0 auto' }}>
              {i18nService.t('matiesQuestionOther')}
            </span>
            <input
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
              className="min-w-[160px] flex-1 bg-transparent focus:outline-none"
              style={{ fontSize: 13.5, color: '#1c1f23' }}
            />
          </label>
        </div>

        <ApprovalConsequence>{i18nService.t('matiesConsequenceAnswer')}</ApprovalConsequence>

        <div className="flex flex-wrap items-center gap-2" style={{ paddingTop: 2 }}>
          <button type="button" onClick={handleSkip} className="maties-button maties-button-ghost" style={{ color: '#8f96a0' }}>
            {i18nService.t('matiesQuestionSkip')}
          </button>
          {onMinimize && (
            <button type="button" onClick={onMinimize} className="maties-button maties-button-ghost" style={{ color: '#8f96a0' }}>
              {i18nService.t('matiesLater')}
            </button>
          )}
          <span className="flex-1" />
          <button type="button" onClick={handleDeny} className="maties-button maties-button-ghost">
            {i18nService.t('matiesNotNow')}
          </button>
          {!isFirstStep && (
            <button type="button" onClick={handlePrevious} className="maties-button maties-button-outline">
              {i18nService.t('matiesQuestionBack')}
            </button>
          )}
          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmit}
              onKeyDown={preventEnter}
              disabled={!allResolved}
              className="maties-button maties-button-primary"
              title={!allResolved ? i18nService.t('coworkQuestionWizardAnswerRequired') : undefined}
            >
              {i18nService.t('matiesContinue')}
            </button>
          ) : (
            <button type="button" onClick={handleNext} className="maties-button maties-button-outline">
              {i18nService.t('matiesQuestionNext')}
            </button>
          )}
        </div>
      </ApprovalCard>
    </ApprovalCardShell>
  );
};

export default CoworkQuestionWizard;
