'use client'

import {
  CustomerLessonRead,
  QuizAttemptResult,
  QuizQuestion,
  useSubmitQuizAttempt,
} from '@/hooks/queries/courses'
import CheckCircle from '@mui/icons-material/CheckCircle'
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import ReplayOutlined from '@mui/icons-material/ReplayOutlined'
import { cn } from '@spaire/ui/lib/utils'
import { useMemo, useState } from 'react'

type SelectedByQuestion = Record<string, Set<string>>

const buildInitialSelected = (questions: QuizQuestion[]): SelectedByQuestion => {
  const map: SelectedByQuestion = {}
  for (const q of questions) map[q.id] = new Set()
  return map
}

export const QuizPlayer = ({
  lesson,
  token,
  courseId,
  onPassed,
}: {
  lesson: CustomerLessonRead
  token: string
  courseId: string
  onPassed?: () => void
}) => {
  const content = lesson.content as
    | {
        questions?: QuizQuestion[]
        passing_grade?: number
        hide_answers_on_results?: boolean
        description?: string | null
      }
    | null

  const questions = useMemo(
    () => (content?.questions ?? []) as QuizQuestion[],
    [content?.questions],
  )
  const passingGrade = content?.passing_grade ?? 70
  const hideAnswers = content?.hide_answers_on_results ?? false

  const [selected, setSelected] = useState<SelectedByQuestion>(() =>
    buildInitialSelected(questions),
  )
  const [result, setResult] = useState<QuizAttemptResult | null>(null)
  const submit = useSubmitQuizAttempt(token, courseId)

  const toggleOption = (questionId: string, optionId: string, multi: boolean) => {
    setSelected((prev) => {
      const current = new Set(prev[questionId] ?? [])
      if (multi) {
        if (current.has(optionId)) current.delete(optionId)
        else current.add(optionId)
      } else {
        current.clear()
        current.add(optionId)
      }
      return { ...prev, [questionId]: current }
    })
  }

  // Short-answer is not graded server-side yet; for now we skip it for the
  // "all answered" gate so a quiz containing one isn't permanently blocked.
  // The editor warns instructors about this.
  const allAnswered = questions.every(
    (q) => q.type === 'short_answer' || (selected[q.id]?.size ?? 0) > 0,
  )

  const handleSubmit = async () => {
    try {
      const answers = questions.map((q) => ({
        question_id: q.id,
        selected_option_ids: Array.from(selected[q.id] ?? []),
      }))
      const res = await submit.mutateAsync({ lessonId: lesson.id, answers })
      setResult(res)
      if (res.passed && onPassed) onPassed()
    } catch {
      // mutation surfaces error
    }
  }

  const handleRetry = () => {
    setSelected(buildInitialSelected(questions))
    setResult(null)
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-6 py-10 text-center">
        <p className="text-sm font-medium text-gray-700">
          This quiz has no questions yet
        </p>
        <p className="mt-1 text-xs text-gray-500">
          The instructor hasn't added questions to this quiz.
        </p>
      </div>
    )
  }

  if (result) {
    return (
      <div className="flex flex-col gap-6">
        <div
          className={cn(
            'rounded-2xl border p-6',
            result.passed
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-amber-200 bg-amber-50',
          )}
        >
          <p
            className={cn(
              'text-sm font-medium',
              result.passed ? 'text-emerald-700' : 'text-amber-700',
            )}
          >
            {result.passed ? 'Passed!' : 'Not quite'}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">
            {result.score}% — {result.correct_count} / {result.total_questions}{' '}
            correct
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Passing grade: {result.passing_grade}%
          </p>
        </div>

        {!hideAnswers && (
          <div className="flex flex-col gap-4">
            {questions.map((q, idx) => {
              const answer = result.answers.find((a) => a.question_id === q.id)
              if (!answer) return null
              const selectedIds = selected[q.id] ?? new Set()
              return (
                <div
                  key={q.id}
                  className="rounded-2xl border border-gray-200 bg-white p-5"
                >
                  <p className="text-xs font-medium text-gray-400">
                    Question {idx + 1}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-gray-900">
                    {q.text || '(no text)'}
                  </p>
                  <div className="mt-3 flex flex-col gap-1.5">
                    {q.options.map((option) => {
                      const isCorrect = answer.correct_option_ids.includes(
                        option.id,
                      )
                      const wasSelected = selectedIds.has(option.id)
                      return (
                        <div
                          key={option.id}
                          className={cn(
                            'flex items-start gap-2.5 rounded-xl border px-3 py-2 text-sm',
                            isCorrect
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : wasSelected
                              ? 'border-amber-200 bg-amber-50 text-amber-800'
                              : 'border-gray-100 text-gray-600',
                          )}
                        >
                          <span className="mt-0.5">
                            {isCorrect ? (
                              <CheckCircle sx={{ fontSize: 16 }} />
                            ) : (
                              <CheckCircleOutlined sx={{ fontSize: 16 }} />
                            )}
                          </span>
                          <div className="flex-1">
                            <p>{option.text}</p>
                            {answer.explanations[option.id] && (
                              <p className="mt-0.5 text-xs opacity-80">
                                {answer.explanations[option.id]}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <button
          onClick={handleRetry}
          className="flex items-center justify-center gap-2 self-start rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <ReplayOutlined sx={{ fontSize: 16 }} />
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {content?.description && (
        <p className="text-sm text-gray-600">{content.description}</p>
      )}
      {questions.map((q, idx) => {
        const multi = q.type === 'multiple_select'
        const isShort = q.type === 'short_answer'
        return (
          <div
            key={q.id}
            className="rounded-2xl border border-gray-200 bg-white p-5"
          >
            <p className="text-xs font-medium text-gray-400">
              Question {idx + 1}
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {q.text || 'Question'}
            </p>
            {isShort ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Short-answer questions aren't graded automatically yet — they
                won't count toward your score.
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-1.5">
                {q.options.map((option) => {
                  const checked = (selected[q.id] ?? new Set()).has(option.id)
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(q.id, option.id, multi)}
                      className={cn(
                        'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left text-sm transition-colors',
                        checked
                          ? 'border-blue-500 bg-blue-50 text-blue-900'
                          : 'border-gray-200 hover:border-gray-300',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
                          multi ? 'rounded' : 'rounded-full',
                          checked
                            ? 'bg-blue-500 text-white'
                            : 'border-2 border-gray-300 bg-white',
                        )}
                      >
                        {checked && <CheckCircle sx={{ fontSize: 14 }} />}
                      </span>
                      <span>{option.text}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      <button
        onClick={handleSubmit}
        disabled={!allAnswered || submit.isPending}
        className="self-start rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {submit.isPending ? 'Submitting…' : 'Submit quiz'}
      </button>
    </div>
  )
}
