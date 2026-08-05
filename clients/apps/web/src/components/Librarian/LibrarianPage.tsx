'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import Button from '@claidor/ui/components/atoms/Button'
import TextArea from '@claidor/ui/components/atoms/TextArea'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import RestartAltOutlined from '@mui/icons-material/RestartAltOutlined'
import { useCallback, useRef, useState } from 'react'
import { LibrarianAnswer, SOURCE_ANCHOR_PREFIX } from './LibrarianAnswer'
import { SourceCard } from './SourceCard'
import {
  askLibrarian,
  LibrarianCitation,
  LibrarianNotConfiguredError,
} from './stream'

const EXAMPLE_QUESTIONS = [
  'Dans quel délai contester une saisie-attribution ?',
  'Saisie pratiquée en janvier 2024 : quel texte s’applique ?',
  'Le paiement par le tiers saisi est-il libératoire ?',
]

const GENERIC_ERROR = 'La réponse a échoué. Réessayez.'
const NOT_CONFIGURED_ERROR = 'Le bibliothécaire n’est pas configuré.'

type Status = 'idle' | 'streaming' | 'done'

const LibrarianPage = () => {
  const [question, setQuestion] = useState('')
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [citations, setCitations] = useState<LibrarianCitation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  const abortRef = useRef<AbortController | null>(null)
  const citationCountRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const ask = useCallback(
    async (rawQuestion: string) => {
      const trimmed = rawQuestion.trim()
      if (!trimmed || status === 'streaming') {
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      citationCountRef.current = 0

      setAskedQuestion(trimmed)
      setQuestion('')
      setAnswer('')
      setCitations([])
      setError(null)
      setStatus('streaming')

      try {
        await askLibrarian(
          trimmed,
          {
            onText: (delta) => setAnswer((current) => current + delta),
            onCitation: (citation) => {
              citationCountRef.current += 1
              const index = citationCountRef.current
              setCitations((current) => [...current, citation])
              // The citation applies at the current end of the streamed
              // text: append a marker link the markdown renderer turns
              // into a [n] badge.
              setAnswer(
                (current) =>
                  `${current}[${index}](${SOURCE_ANCHOR_PREFIX}${index})`,
              )
            },
            onDone: () => setStatus('done'),
            onError: () => {
              setError(GENERIC_ERROR)
              setStatus('done')
            },
          },
          controller.signal,
        )
        setStatus((current) => (current === 'streaming' ? 'done' : current))
      } catch (e) {
        if (controller.signal.aborted) {
          return
        }
        setError(
          e instanceof LibrarianNotConfiguredError
            ? NOT_CONFIGURED_ERROR
            : GENERIC_ERROR,
        )
        setStatus('done')
      }
    },
    [status],
  )

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    citationCountRef.current = 0
    setAskedQuestion(null)
    setQuestion('')
    setAnswer('')
    setCitations([])
    setError(null)
    setStatus('idle')
  }, [])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ask(question)
      }
    },
    [ask, question],
  )

  if (status === 'idle') {
    return (
      <DashboardBody title={null}>
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-y-8 pt-16 md:pt-24">
          <div className="flex flex-col items-center gap-y-3 text-center">
            <h1 className="text-4xl font-medium tracking-tight">Claidor</h1>
            <p className="max-w-lg text-gray-500">
              Posez votre question sur le droit OHADA — réponse sourcée, article
              et jurisprudence à l’appui.
            </p>
          </div>
          <form
            className="relative w-full"
            onSubmit={(e) => {
              e.preventDefault()
              ask(question)
            }}
          >
            <TextArea
              ref={textareaRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Votre question juridique…"
              aria-label="Votre question juridique"
              resizable={false}
              autoFocus
              className="min-h-[120px] pr-14"
            />
            <Button
              type="submit"
              size="icon"
              disabled={question.trim().length === 0}
              className="absolute right-3 bottom-3 rounded-full"
              aria-label="Envoyer la question"
            >
              <ArrowUpwardOutlined sx={{ fontSize: 16 }} />
            </Button>
          </form>
          <div className="flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuestion(example)
                  textareaRef.current?.focus()
                }}
                className="cursor-pointer rounded-full border border-gray-200 bg-white px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody title={null}>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-y-8 pt-8">
        <div className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gray-100 px-4 py-3 text-sm text-gray-900">
            {askedQuestion}
          </div>
        </div>

        {answer.length > 0 && <LibrarianAnswer content={answer} />}

        {status === 'streaming' && (
          <div
            className="flex flex-row items-center gap-x-2 text-sm text-gray-400"
            role="status"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
            {answer.length === 0
              ? 'Le bibliothécaire consulte les textes…'
              : 'Rédaction en cours…'}
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {citations.length > 0 && (
          <div className="flex flex-col gap-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase">
              Sources
            </h3>
            {citations.map((citation, i) => (
              <SourceCard
                key={`${citation.source_id}-${i}`}
                citation={citation}
                index={i + 1}
              />
            ))}
          </div>
        )}

        {status === 'done' && (
          <div>
            <Button variant="secondary" onClick={reset}>
              <RestartAltOutlined className="mr-2" sx={{ fontSize: 16 }} />
              Nouvelle question
            </Button>
          </div>
        )}
      </div>
    </DashboardBody>
  )
}

export default LibrarianPage
