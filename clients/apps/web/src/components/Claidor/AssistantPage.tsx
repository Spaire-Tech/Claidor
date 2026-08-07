'use client'

import {
  formatFrenchDate,
  LibrarianAnswer,
} from '@/components/Librarian/LibrarianAnswer'
import {
  askLibrarian,
  LibrarianAuthority,
  LibrarianCitation,
  LibrarianClarification,
  LibrarianNotConfiguredError,
} from '@/components/Librarian/stream'
import ArrowUpwardOutlined from '@mui/icons-material/ArrowUpwardOutlined'
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined'
import Image from 'next/image'
import { useCallback, useMemo, useRef, useState } from 'react'
import { ArticleGlyph, DecisionGlyph } from './icons'

/**
 * The assistant screen of the v1 design, on the real librarian stream:
 * same version gate, same computed authority, same verified citations as
 * the API — only the clothes are from docs/design.
 */

// The design greets in English; the product speaks French. « L'affaire du
// jour » keeps the matter/affaire double sense of "What's the matter at
// hand?".
const GREETINGS = [
  'Sur quoi travaillons-nous aujourd’hui ?',
  'Quelle question de droit puis-je éclairer ?',
  'Qu’avez-vous sur votre bureau ?',
  'Par où commençons-nous ?',
  'Quelle est l’affaire du jour ?',
]

const EXAMPLE_QUESTIONS = [
  'Dans quel délai contester une saisie-attribution ?',
  'Saisie pratiquée en janvier 2024 : quel texte s’applique ?',
  'Le paiement par le tiers saisi est-il libératoire ?',
]

/**
 * Source scopes. Only the two the corpus actually contains are enabled;
 * the design's other three are visible but honest about not existing yet.
 */
const SOURCES = [
  { id: 'au', label: 'Actes uniformes', color: 'var(--blue)', ready: true },
  { id: 'cj', label: 'Jurisprudence CCJA', color: 'var(--red)', ready: true },
  { id: 'jo', label: 'Journal officiel', color: 'var(--green)', ready: false },
  { id: 'dn', label: 'Droit national', color: 'var(--amber)', ready: false },
  { id: 'web', label: 'Recherche web', color: 'var(--teal)', ready: false },
]

const GENERIC_ERROR = 'La réponse a échoué. Réessayez.'
const NOT_CONFIGURED_ERROR = 'Le bibliothécaire n’est pas configuré.'

const STREAM_ERRORS: Record<string, string> = {
  corpus_empty:
    'La bibliothèque est vide : aucun texte n’a encore été chargé. ' +
    'Réessayer n’y changera rien.',
  answer_failed: GENERIC_ERROR,
}

type Status = 'idle' | 'streaming' | 'done'

export const AssistantPage = () => {
  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [],
  )

  const [question, setQuestion] = useState('')
  const [askedQuestion, setAskedQuestion] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [, setCitations] = useState<LibrarianCitation[]>([])
  const [clarification, setClarification] =
    useState<LibrarianClarification | null>(null)
  const [authority, setAuthority] = useState<LibrarianAuthority | null>(null)
  const [versionsUsed, setVersionsUsed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')

  const abortRef = useRef<AbortController | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const ask = useCallback(
    async (rawQuestion: string, answerBothVersions: boolean = false) => {
      const trimmed = rawQuestion.trim()
      if (!trimmed || status === 'streaming') {
        return
      }

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setAskedQuestion(trimmed)
      setQuestion('')
      setAnswer('')
      setCitations([])
      setClarification(null)
      setAuthority(null)
      setVersionsUsed([])
      setError(null)
      setStatus('streaming')

      try {
        await askLibrarian(
          trimmed,
          {
            onText: (delta) => setAnswer((current) => current + delta),
            onCitation: (citation) =>
              setCitations((current) => [...current, citation]),
            onClarification: (received) => setClarification(received),
            onAuthority: (received) => setAuthority(received),
            onDone: (done) => setVersionsUsed(done.versions_used),
            onError: (code) => {
              setError(STREAM_ERRORS[code] ?? GENERIC_ERROR)
              setStatus('done')
            },
          },
          controller.signal,
          answerBothVersions,
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

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        ask(question)
      }
    },
    [ask, question],
  )

  const canSend = question.trim().length > 0

  const inputCard = (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault()
        ask(question)
      }}
    >
      <div
        className="w-full rounded-[14px]"
        style={{
          border: '1px solid var(--b3)',
          background: 'var(--surface)',
          boxShadow: '0 2px 12px var(--sh3)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Posez votre question de droit OHADA…"
          aria-label="Votre question juridique"
          rows={3}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[14.5px] outline-none"
          style={{ color: 'var(--ink)' }}
          autoFocus
        />
        <div className="flex items-center gap-2 px-3 pb-3">
          <div className="flex flex-wrap items-center gap-[6px]">
            {SOURCES.map((s) => (
              <span
                key={s.id}
                title={s.ready ? undefined : 'Bientôt disponible'}
                className="flex items-center gap-[6px] rounded-full px-[10px] py-[4px] text-[12px]"
                style={{
                  border: `1px solid ${s.ready ? 'var(--b3)' : 'var(--b1)'}`,
                  color: s.ready ? 'var(--t1)' : 'var(--t5)',
                }}
              >
                <span
                  className="h-[6px] w-[6px] rounded-full"
                  style={{
                    background: s.ready ? s.color : 'var(--b4)',
                  }}
                />
                {s.label}
                {!s.ready && (
                  <span style={{ color: 'var(--t6)' }}>· bientôt</span>
                )}
              </span>
            ))}
          </div>
          <div className="flex-1" />
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Envoyer la question"
            className="flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-full disabled:cursor-default"
            style={{
              background: canSend ? 'var(--accent)' : 'var(--btnoff)',
              color: canSend ? 'var(--on-accent)' : 'var(--t5)',
            }}
          >
            <ArrowUpwardOutlined sx={{ fontSize: 16 }} />
          </button>
        </div>
      </div>
    </form>
  )

  if (status === 'idle') {
    return (
      <div className="flex flex-1 flex-col items-center overflow-y-auto px-8 pt-[9vh] pb-8">
        <div className="flex w-full max-w-[820px] flex-col items-center">
          <Image
            src="/claidor-mark.png"
            alt="Claidor"
            width={64}
            height={64}
            priority
          />
          <h1 className="claidor-serif mt-[18px] text-center text-[30px] font-semibold">
            {greeting}
          </h1>
          <div className="mt-[6vh] w-full">{inputCard}</div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {EXAMPLE_QUESTIONS.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => {
                  setQuestion(example)
                  textareaRef.current?.focus()
                }}
                className="claidor-hover-row cursor-pointer rounded-full px-4 py-2 text-[13px]"
                style={{
                  border: '1px solid var(--b2)',
                  color: 'var(--t2)',
                }}
              >
                {example}
              </button>
            ))}
          </div>
          <div
            className="mt-10 flex items-center gap-4 text-[12px]"
            style={{ color: 'var(--t5)' }}
          >
            <span className="flex items-center gap-[5px]">
              <span style={{ color: 'var(--blue)' }}>
                <ArticleGlyph size={13} />
              </span>
              11 actes uniformes · 17 versions
            </span>
            <span className="flex items-center gap-[5px]">
              <span style={{ color: 'var(--red)' }}>
                <DecisionGlyph size={13} />
              </span>
              Jurisprudence CCJA vérifiée
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-y-7 px-8 pt-10 pb-16">
        <div className="flex justify-end">
          <div
            className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-[14px]"
            style={{ background: 'var(--s6)', color: 'var(--ink)' }}
          >
            {askedQuestion}
          </div>
        </div>

        {answer.length > 0 && (
          <LibrarianAnswer
            content={answer}
            authority={authority}
            versionsUsed={versionsUsed}
          />
        )}

        {clarification && (
          <div
            className="flex flex-col gap-y-4 rounded-2xl p-5"
            style={{
              border: '1px solid var(--b3)',
              background: 'var(--surface)',
            }}
          >
            <div className="flex flex-row items-start gap-x-3">
              <HelpOutlineOutlined
                className="mt-0.5 flex-none"
                sx={{ fontSize: 20, color: 'var(--t3)' }}
              />
              <div className="flex min-w-0 flex-col gap-y-1">
                <p
                  className="text-[14px] leading-relaxed"
                  style={{ color: 'var(--ink)' }}
                >
                  {clarification.message}
                </p>
                {clarification.cutoff && (
                  <p className="text-[12px]" style={{ color: 'var(--t4)' }}>
                    Date charnière : {formatFrenchDate(clarification.cutoff)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="claidor-hover-row cursor-pointer rounded-lg px-3 py-[7px] text-[13px] font-medium"
                style={{ border: '1px solid var(--b3)', color: 'var(--ink)' }}
              >
                Préciser la date
              </button>
              <button
                type="button"
                onClick={() => askedQuestion && ask(askedQuestion, true)}
                className="claidor-hover-row cursor-pointer rounded-lg px-3 py-[7px] text-[13px] font-medium"
                style={{ border: '1px solid var(--b3)', color: 'var(--ink)' }}
              >
                Répondre pour les deux régimes (1998 et 2023)
              </button>
            </div>
          </div>
        )}

        {status === 'streaming' && (
          <div
            className="flex flex-row items-center gap-x-2 text-[13px]"
            style={{ color: 'var(--t4)' }}
            role="status"
          >
            <span
              className="h-2 w-2 animate-pulse rounded-full"
              style={{ background: 'var(--t5)' }}
            />
            {answer.length === 0
              ? 'Le bibliothécaire consulte les textes…'
              : 'Rédaction en cours…'}
          </div>
        )}

        {error && (
          <div
            className="rounded-xl px-4 py-3 text-[13.5px]"
            style={{
              border: '1px solid var(--red)',
              color: 'var(--red2)',
              background: 'var(--s1)',
            }}
          >
            {error}
          </div>
        )}

        {status === 'done' && <div className="w-full">{inputCard}</div>}
      </div>
    </div>
  )
}
