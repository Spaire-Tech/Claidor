'use client'

import {
  CourseLessonRead,
  CourseModuleRead,
  CourseRead,
  QuizContent,
  QuizOption,
  QuizQuestion,
  QuizSettings,
  usePreviewAccess,
} from '@/hooks/queries/courses'
import AddOutlined from '@mui/icons-material/AddOutlined'
import CheckCircle from '@mui/icons-material/CheckCircle'
import DeleteOutlineOutlined from '@mui/icons-material/DeleteOutlineOutlined'
import ImageOutlined from '@mui/icons-material/ImageOutlined'
import KeyboardArrowDownOutlined from '@mui/icons-material/KeyboardArrowDownOutlined'
import MoreHorizOutlined from '@mui/icons-material/MoreHorizOutlined'
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined'
import { cn } from '@spaire/ui/lib/utils'
import { useEffect, useState } from 'react'
import { toast } from '../../Toast/use-toast'

type QuestionType = QuizQuestion['type']

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'multiple_choice', label: 'Multiple choice' },
  { value: 'multiple_select', label: 'Multiple select' },
  { value: 'short_answer', label: 'Short answer' },
]

export type QuizSaveBody = {
  title: string
  published: boolean
  content: QuizContent
}

const DEFAULT_SETTINGS: QuizSettings = {
  passing_grade: 70,
  send_email_results: false,
  prevent_complete_without_passing: false,
  hide_answers_on_results: false,
}

const newId = () =>
  globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2)

const newOption = (text = 'Option 1'): QuizOption => ({
  id: newId(),
  text,
  is_correct: false,
  explanation: null,
  image_url: null,
})

const newQuestion = (): QuizQuestion => ({
  id: newId(),
  text: '',
  type: 'multiple_choice',
  graded: true,
  image_url: null,
  options: [newOption('Option 1')],
})

function loadQuiz(lesson: CourseLessonRead): QuizContent {
  const raw = (lesson.content ?? {}) as Partial<QuizContent>
  return {
    title: raw.title ?? lesson.title,
    description: raw.description ?? null,
    thumbnail_url: raw.thumbnail_url ?? null,
    passing_grade: raw.passing_grade ?? DEFAULT_SETTINGS.passing_grade,
    send_email_results:
      raw.send_email_results ?? DEFAULT_SETTINGS.send_email_results,
    prevent_complete_without_passing:
      raw.prevent_complete_without_passing ??
      DEFAULT_SETTINGS.prevent_complete_without_passing,
    hide_answers_on_results:
      raw.hide_answers_on_results ?? DEFAULT_SETTINGS.hide_answers_on_results,
    questions:
      raw.questions && raw.questions.length > 0
        ? raw.questions
        : [newQuestion()],
  }
}

export function QuizDetail({
  lesson,
  module,
  course,
  onSave,
  onDelete,
  isSaving,
}: {
  lesson: CourseLessonRead
  module: CourseModuleRead
  course: CourseRead
  onSave: (body: QuizSaveBody) => void
  onDelete: () => void
  isSaving: boolean
}) {
  const [tab, setTab] = useState<'questions' | 'settings' | 'results'>(
    'questions',
  )
  const [quiz, setQuiz] = useState<QuizContent>(() => loadQuiz(lesson))
  const [published, setPublished] = useState(lesson.published)
  const previewAccess = usePreviewAccess()

  useEffect(() => {
    setQuiz(loadQuiz(lesson))
    setPublished(lesson.published)
    // Re-sync when the lesson identity OR the server's published flag
    // changes; otherwise a successful save's refetch can leave the local
    // toggle stuck on the stale value.
  }, [lesson.id, lesson.published])

  const updateQuiz = (patch: Partial<QuizContent>) =>
    setQuiz((prev) => ({ ...prev, ...patch }))

  const updateQuestion = (id: string, patch: Partial<QuizQuestion>) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === id ? { ...q, ...patch } : q,
      ),
    }))

  const addQuestion = () =>
    setQuiz((prev) => ({
      ...prev,
      questions: [...prev.questions, newQuestion()],
    }))

  const removeQuestion = (id: string) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== id),
    }))

  const addOption = (questionId: string) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: [
                ...q.options,
                newOption(`Option ${q.options.length + 1}`),
              ],
            }
          : q,
      ),
    }))

  const updateOption = (
    questionId: string,
    optionId: string,
    patch: Partial<QuizOption>,
  ) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((o) =>
                o.id === optionId ? { ...o, ...patch } : o,
              ),
            }
          : q,
      ),
    }))

  const setCorrect = (
    questionId: string,
    optionId: string,
    type: QuestionType,
  ) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q) => {
        if (q.id !== questionId) return q
        if (type === 'multiple_choice') {
          return {
            ...q,
            options: q.options.map((o) => ({
              ...o,
              is_correct: o.id === optionId,
            })),
          }
        }
        return {
          ...q,
          options: q.options.map((o) =>
            o.id === optionId ? { ...o, is_correct: !o.is_correct } : o,
          ),
        }
      }),
    }))

  const removeOption = (questionId: string, optionId: string) =>
    setQuiz((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === questionId
          ? { ...q, options: q.options.filter((o) => o.id !== optionId) }
          : q,
      ),
    }))

  const handleSave = () => {
    onSave({
      title: quiz.title || lesson.title,
      published,
      content: quiz,
    })
  }

  const isAnyGradedAnswerable = quiz.questions.every((q) =>
    q.graded ? q.options.some((o) => o.is_correct) : true,
  )

  const handlePreview = async () => {
    try {
      const { portal_url } = await previewAccess.mutateAsync(course.id)
      const url = new URL(portal_url, window.location.origin)
      url.searchParams.set('lesson', lesson.id)
      window.open(url.toString(), '_blank', 'noopener,noreferrer')
    } catch {
      // Opening the portal without a session token would just land on the
      // sign-in screen — surface the failure instead.
      toast({ title: 'Could not open the preview. Please try again.' })
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-gray-50">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-50 px-8 py-4">
        <input
          value={quiz.title ?? ''}
          onChange={(e) => updateQuiz({ title: e.target.value })}
          placeholder="Untitled quiz"
          className="max-w-md flex-1 bg-transparent text-xl font-bold text-gray-900 focus:outline-none"
        />
        <div className="ml-auto flex items-center gap-2">
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium',
              published
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-600',
            )}
          >
            {published ? '● Published' : '◷ Draft'}
            <button
              onClick={() => setPublished((v) => !v)}
              className="ml-1 text-gray-400 hover:text-gray-700"
              title="Toggle"
            >
              <KeyboardArrowDownOutlined sx={{ fontSize: 14 }} />
            </button>
          </span>
          <button
            onClick={handlePreview}
            disabled={previewAccess.isPending}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
            title="Preview"
          >
            <VisibilityOutlined fontSize="small" />
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !isAnyGradedAnswerable}
            className="rounded-full bg-gray-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="border-b border-gray-200 bg-gray-50 px-8">
        <div className="mx-auto flex max-w-3xl items-center gap-6">
          {(
            [
              { id: 'questions', label: 'Questions' },
              { id: 'settings', label: 'Settings' },
              { id: 'results', label: 'Results' },
            ] as const
          ).map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative pt-2 pb-3 text-sm transition-colors',
                  active
                    ? 'font-semibold text-gray-900'
                    : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {t.label}
                {active && (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gray-900" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 px-8 py-8">
        {tab === 'questions' && (
          <div className="flex flex-col gap-4">
            {quiz.questions.map((question, idx) => (
              <QuestionCard
                key={question.id}
                index={idx}
                question={question}
                onChange={(patch) => updateQuestion(question.id, patch)}
                onRemove={() => removeQuestion(question.id)}
                onAddOption={() => addOption(question.id)}
                onUpdateOption={(optionId, patch) =>
                  updateOption(question.id, optionId, patch)
                }
                onRemoveOption={(optionId) =>
                  removeOption(question.id, optionId)
                }
                onSetCorrect={(optionId) =>
                  setCorrect(question.id, optionId, question.type)
                }
                disableRemove={quiz.questions.length === 1}
              />
            ))}
            <button
              onClick={addQuestion}
              className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-200 px-4 py-4 text-sm font-medium text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600"
            >
              <AddOutlined sx={{ fontSize: 18 }} />
              Add question
            </button>
          </div>
        )}
        {tab === 'settings' && (
          <SettingsPanel quiz={quiz} onChange={updateQuiz} />
        )}
        {tab === 'results' && (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-white px-6 text-center">
            <div>
              <p className="text-sm font-medium text-gray-700">
                No results yet
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Once students take this quiz, attempts and grades will show up
                here.
              </p>
            </div>
          </div>
        )}

        <div className="mt-10 flex items-center justify-between border-t border-gray-100 pt-6">
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700"
          >
            <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
            Delete Quiz
          </button>
        </div>
      </div>
    </div>
  )
}

function QuestionCard({
  index,
  question,
  onChange,
  onRemove,
  onAddOption,
  onUpdateOption,
  onRemoveOption,
  onSetCorrect,
  disableRemove,
}: {
  index: number
  question: QuizQuestion
  onChange: (patch: Partial<QuizQuestion>) => void
  onRemove: () => void
  onAddOption: () => void
  onUpdateOption: (optionId: string, patch: Partial<QuizOption>) => void
  onRemoveOption: (optionId: string) => void
  onSetCorrect: (optionId: string) => void
  disableRemove: boolean
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  const isMulti = question.type === 'multiple_select'
  const isShort = question.type === 'short_answer'

  return (
    <div className="rounded-2xl border border-gray-200 bg-white">
      <div className="px-6 pt-5 pb-6">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">
            Question {index + 1}
          </p>
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <MoreHorizOutlined sx={{ fontSize: 18 }} />
            </button>
            {moreOpen && (
              <div className="absolute top-full right-0 z-30 mt-1 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                <button
                  onClick={() => {
                    setMoreOpen(false)
                    if (!disableRemove) onRemove()
                  }}
                  disabled={disableRemove}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <DeleteOutlineOutlined sx={{ fontSize: 15 }} />
                  Delete question
                </button>
              </div>
            )}
          </div>
        </div>

        <textarea
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          placeholder="Question"
          rows={3}
          className="focus:border-ce-accent focus:ring-ce-accent-ring mb-4 w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:outline-none"
        />

        <select
          value={question.type}
          onChange={(e) => onChange({ type: e.target.value as QuestionType })}
          className="focus:border-ce-accent focus:ring-ce-accent-ring mb-5 w-full appearance-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 focus:ring-2 focus:outline-none"
        >
          {QUESTION_TYPES.map((qt) => (
            <option key={qt.value} value={qt.value}>
              {qt.label}
            </option>
          ))}
        </select>

        <div className="mb-5 flex items-center gap-3">
          <Toggle
            checked={question.graded}
            onChange={(v) => onChange({ graded: v })}
          />
          <span className="text-sm font-medium text-gray-700">
            Graded question
          </span>
          {question.graded && !isShort && (
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              ● Auto-graded
            </span>
          )}
        </div>

        {!isShort && (
          <>
            <p className="mb-2 text-xs text-gray-400">Responses</p>
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <div key={option.id} className="flex items-start gap-2">
                  <button
                    onClick={() => onSetCorrect(option.id)}
                    className={cn(
                      'mt-2 flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
                      isMulti ? 'rounded' : 'rounded-full',
                      option.is_correct
                        ? 'bg-emerald-500 text-white'
                        : 'border-2 border-gray-300 text-transparent hover:border-gray-400',
                    )}
                    title={
                      option.is_correct ? 'Correct answer' : 'Mark correct'
                    }
                  >
                    {option.is_correct && <CheckCircle sx={{ fontSize: 14 }} />}
                  </button>
                  <div className="flex flex-1 flex-col gap-1.5">
                    <input
                      value={option.text}
                      onChange={(e) =>
                        onUpdateOption(option.id, { text: e.target.value })
                      }
                      placeholder="Option text"
                      className="focus:border-ce-accent focus:ring-ce-accent-ring rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 focus:ring-2 focus:outline-none"
                    />
                    <input
                      value={option.explanation ?? ''}
                      onChange={(e) =>
                        onUpdateOption(option.id, {
                          explanation: e.target.value || null,
                        })
                      }
                      placeholder="Add explanation (optional)"
                      className="rounded-xl border border-transparent px-3.5 py-1.5 text-xs text-gray-500 placeholder:text-gray-400 hover:bg-gray-50 focus:border-gray-200 focus:outline-none"
                    />
                  </div>
                  {question.options.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveOption(option.id)}
                      className="mt-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Remove option"
                    >
                      <DeleteOutlineOutlined sx={{ fontSize: 16 }} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={onAddOption}
              className="mt-3 flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900"
            >
              <AddOutlined sx={{ fontSize: 16 }} />
              Add option
            </button>
          </>
        )}
        {isShort && (
          <p className="rounded-xl bg-gray-50 px-4 py-3 text-xs text-gray-500">
            Short answer responses are collected from students but not
            auto-graded.
          </p>
        )}
      </div>
    </div>
  )
}

function SettingsPanel({
  quiz,
  onChange,
}: {
  quiz: QuizContent
  onChange: (patch: Partial<QuizContent>) => void
}) {
  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        label="Details"
        hint="Manage your quiz's general details, including its title, description, and thumbnail."
      >
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <input
              value={quiz.title ?? ''}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder="Untitled quiz"
              className="focus:border-ce-accent focus:ring-ce-accent-ring w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:outline-none"
            />
          </Field>
          <Field label="Description">
            <textarea
              value={quiz.description ?? ''}
              onChange={(e) =>
                onChange({ description: e.target.value || null })
              }
              placeholder="Describe your quiz"
              rows={3}
              className="focus:border-ce-accent focus:ring-ce-accent-ring w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:outline-none"
            />
          </Field>
          <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white">
              {quiz.thumbnail_url ? (
                <img
                  src={quiz.thumbnail_url}
                  alt="Quiz thumbnail"
                  className="h-full w-full rounded-lg object-cover"
                />
              ) : (
                <ImageOutlined
                  className="text-gray-300"
                  sx={{ fontSize: 28 }}
                />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-700">
                Please use .jpg or .png with non-transparent background.
                Recommended dimensions of{' '}
                <span className="font-semibold">1280×720</span>.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Image upload coming soon — set thumbnail at the lesson level for
                now.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        label="Grading"
        hint="Manage settings for passing grades, sending results and displaying correct answers."
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Passing grade</p>
              <p className="mt-0.5 text-xs text-gray-500">
                The minimum percentage of correct answers required to pass. Mark
                individual questions as ungraded to exclude them from scoring.
              </p>
            </div>
            <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5">
              <input
                type="number"
                min={0}
                max={100}
                value={quiz.passing_grade}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10)
                  const next = Number.isFinite(parsed)
                    ? Math.max(0, Math.min(100, parsed))
                    : 0
                  onChange({ passing_grade: next })
                }}
                className="w-12 bg-transparent text-right text-sm focus:outline-none"
              />
              <span className="text-xs text-gray-500">%</span>
            </div>
          </div>

          <Checkbox
            checked={quiz.send_email_results}
            onChange={(v) => onChange({ send_email_results: v })}
            label="Send email to member with link to results."
            helper="(You can customize it in Email templates)"
          />
          <Checkbox
            checked={quiz.prevent_complete_without_passing}
            onChange={(v) => onChange({ prevent_complete_without_passing: v })}
            label="Prevent member from marking quiz as complete without a passing grade."
          />

          <div className="flex items-start gap-3 border-t border-gray-100 pt-4">
            <Toggle
              checked={quiz.hide_answers_on_results}
              onChange={(v) => onChange({ hide_answers_on_results: v })}
            />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Hide answers on results page
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Members will not be able to view correct answers when they
                choose an incorrect response.
              </p>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  )
}

function SettingsSection({
  label,
  hint,
  children,
}: {
  label: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-[180px_1fr]">
      <div>
        <h3 className="text-base font-bold text-gray-900">{label}</h3>
        <p className="mt-1 text-xs text-gray-500">{hint}</p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-gray-700">{label}</label>
      {children}
    </div>
  )
}

function Checkbox({
  checked,
  onChange,
  label,
  helper,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  helper?: string
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className="flex items-start gap-2.5 text-left"
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors',
          checked
            ? 'border-gray-900 bg-gray-900 text-white'
            : 'border-gray-300 bg-white',
        )}
      >
        {checked && <CheckCircle sx={{ fontSize: 11 }} />}
      </span>
      <span className="text-sm text-gray-700">
        {label} {helper && <span className="text-gray-400">{helper}</span>}
      </span>
    </button>
  )
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none',
        checked ? 'bg-ce-accent' : 'bg-gray-200',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}
