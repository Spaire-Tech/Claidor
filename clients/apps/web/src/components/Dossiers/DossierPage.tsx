'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { formatFrenchDate } from '@/components/Librarian/LibrarianAnswer'
import { markdownOptions } from '@/utils/markdown'
import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined'
import GavelOutlined from '@mui/icons-material/GavelOutlined'
import Markdown from 'markdown-to-jsx'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  CATEGORY_LABELS,
  Dossier,
  DossierCitation,
  DossierQuestion,
  EXTRACTION_LABELS,
  askInDossier,
  fetchDossier,
  fetchQuestions,
} from './api'

const LOAD_ERROR = 'Le chargement du dossier a échoué. Réessayez.'
const ASK_ERROR = "La question n'a pas abouti. Réessayez."

/**
 * A citation, labelled by what it rests on. Facts carry the pièce they were
 * read from; law carries the article or decision. The two are never styled
 * alike — a reader must always know which is which.
 */
const CitationRow = ({ citation }: { citation: DossierCitation }) => {
  const isFact = citation.nature === 'fact'
  return (
    <div
      className={twMerge(
        'flex flex-col gap-y-1 rounded-lg border-l-2 py-2 pl-3',
        isFact
          ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
          : 'dark:bg-polar-800 border-blue-400 bg-blue-50/50',
      )}
    >
      <span className="flex flex-row items-center gap-x-1.5 text-xs font-medium">
        {isFact ? (
          <ArticleOutlined fontSize="inherit" />
        ) : (
          <GavelOutlined fontSize="inherit" />
        )}
        {citation.title}
      </span>
      <span className="dark:text-polar-400 text-xs text-gray-600 italic">
        « {citation.quote} »
      </span>
    </div>
  )
}

const QuestionCard = ({ question }: { question: DossierQuestion }) => (
  <div className="dark:border-polar-700 flex flex-col gap-y-4 rounded-2xl border border-gray-200 p-5">
    <div className="flex flex-col gap-y-1">
      <p className="text-sm font-medium">{question.question}</p>
      <p className="dark:text-polar-500 text-xs text-gray-500">
        {question.asked_by ?? 'Inconnu'} ·{' '}
        {formatFrenchDate(question.created_at)}
        {question.versions_used && question.versions_used.length > 0 && (
          <>
            {' · '}
            {question.versions_used.map((version) => (
              <span
                key={version}
                className="dark:bg-polar-700 ml-1 rounded-full bg-gray-100 px-2 py-0.5"
              >
                AUPSRVE {version}
              </span>
            ))}
          </>
        )}
      </p>
    </div>

    {question.status === 'clarification_requested' && (
      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        {question.answer}
      </div>
    )}

    {question.status === 'answered' && question.answer && (
      <div className="dark:prose-invert prose prose-sm max-w-none">
        <Markdown options={markdownOptions}>{question.answer}</Markdown>
      </div>
    )}

    {question.status === 'failed' && (
      <p className="text-sm text-red-600 dark:text-red-400">
        La réponse n&apos;a pas abouti.
      </p>
    )}

    {question.facts.length > 0 && (
      <div className="flex flex-col gap-y-2">
        <h4 className="dark:text-polar-500 text-xs tracking-wide text-gray-500 uppercase">
          Faits retenus — du dossier
        </h4>
        {question.facts.map((citation) => (
          <CitationRow key={citation.id} citation={citation} />
        ))}
      </div>
    )}

    {question.law.length > 0 && (
      <div className="flex flex-col gap-y-2">
        <h4 className="dark:text-polar-500 text-xs tracking-wide text-gray-500 uppercase">
          Droit applicable — du corpus
        </h4>
        {question.law.map((citation) => (
          <CitationRow key={citation.id} citation={citation} />
        ))}
      </div>
    )}

    {question.authority_label && (
      <p className="dark:text-polar-500 text-xs text-gray-500">
        Autorité : {question.authority_label}
      </p>
    )}
  </div>
)

export interface DossierPageProps {
  organization: string
  dossierId: string
}

const DossierPage = ({ organization, dossierId }: DossierPageProps) => {
  const [dossier, setDossier] = useState<Dossier | null>(null)
  const [questions, setQuestions] = useState<DossierQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)

  const load = useCallback(
    (signal?: AbortSignal) =>
      Promise.all([
        fetchDossier(dossierId, signal),
        fetchQuestions(dossierId, signal),
      ])
        .then(([d, q]) => {
          setDossier(d)
          setQuestions(q)
          setError(null)
        })
        .catch(() => {
          if (!signal?.aborted) setError(LOAD_ERROR)
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false)
        }),
    [dossierId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const ask = async () => {
    const question = draft.trim()
    if (question.length < 3) return
    setAsking(true)
    try {
      const answered = await askInDossier(dossierId, { question })
      setQuestions((previous) => [answered, ...previous])
      setDraft('')
    } catch {
      setError(ASK_ERROR)
    } finally {
      setAsking(false)
    }
  }

  if (loading) {
    return (
      <DashboardBody title="Dossier">
        <p className="dark:text-polar-500 text-sm text-gray-500">Chargement…</p>
      </DashboardBody>
    )
  }

  if (!dossier) {
    return (
      <DashboardBody title="Dossier">
        <p className="text-sm text-red-600 dark:text-red-400">
          {error ?? 'Dossier introuvable.'}
        </p>
        <Link
          href={`/dashboard/${organization}/dossiers`}
          className="text-sm text-blue-500"
        >
          Retour aux dossiers
        </Link>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody
      title={dossier.name}
      wrapperClassName="!max-w-6xl"
      className="!max-w-6xl"
    >
      <div className="flex flex-col gap-y-6 lg:flex-row lg:gap-x-8 lg:gap-y-0">
        {/* The file */}
        <aside className="flex w-full shrink-0 flex-col gap-y-4 lg:w-80">
          <div className="flex flex-col gap-y-1">
            <h3 className="text-sm font-medium">Le dossier</h3>
            <p className="dark:text-polar-500 text-xs text-gray-500">
              {dossier.client_name ?? 'Client non renseigné'} ·{' '}
              {dossier.members.length} avocat
              {dossier.members.length > 1 ? 's' : ''}
            </p>
          </div>

          <div className="dark:divide-polar-700 dark:border-polar-700 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {dossier.documents.length === 0 ? (
              <p className="dark:text-polar-500 p-4 text-xs text-gray-500">
                Aucune pièce. Les pièces versées ici sont lues par Claidor
                lorsqu&apos;il répond dans ce dossier.
              </p>
            ) : (
              dossier.documents.map((document) => (
                <div key={document.id} className="flex flex-col gap-y-1 p-3">
                  <span className="text-xs font-medium">
                    {document.piece_number !== null && (
                      <span className="dark:text-polar-500 text-gray-500">
                        Pièce n° {document.piece_number} —{' '}
                      </span>
                    )}
                    {document.title}
                  </span>
                  <span className="dark:text-polar-500 flex flex-row items-center gap-x-1 text-[11px] text-gray-500">
                    {CATEGORY_LABELS[document.category]}
                    {!document.readable && (
                      <span className="flex flex-row items-center gap-x-1 text-amber-600 dark:text-amber-400">
                        <ErrorOutlineOutlined fontSize="inherit" />
                        {EXTRACTION_LABELS[document.extraction_status]}
                      </span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>

          <p className="dark:text-polar-500 text-[11px] text-gray-500">
            Une pièce non lisible reste au dossier pour l&apos;équipe, mais
            n&apos;est jamais utilisée comme source d&apos;une réponse.
          </p>
        </aside>

        {/* The ask box and the shared record */}
        <section className="flex min-w-0 flex-1 flex-col gap-y-6">
          <div className="dark:border-polar-700 flex flex-col gap-y-3 rounded-2xl border border-gray-200 p-5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  ask()
                }
              }}
              rows={3}
              disabled={asking}
              placeholder="Posez une question sur cette affaire — Claidor lit les pièces et le corpus."
              className="dark:border-polar-600 dark:bg-polar-800 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none disabled:opacity-60"
            />
            <div className="flex flex-row items-center justify-between">
              <p className="dark:text-polar-500 text-xs text-gray-500">
                Les faits viennent du dossier, le droit du corpus — chacun est
                cité séparément.
              </p>
              <button
                type="button"
                disabled={asking || draft.trim().length < 3}
                onClick={ask}
                className="dark:bg-polar-50 shrink-0 rounded-full bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:text-gray-900"
              >
                {asking ? 'Recherche…' : 'Demander'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-y-4">
            <h3 className="text-sm font-medium">
              Historique du dossier
              {questions.length > 0 && (
                <span className="dark:text-polar-500 ml-2 text-xs font-normal text-gray-500">
                  {questions.length} question
                  {questions.length > 1 ? 's' : ''}
                </span>
              )}
            </h3>
            {questions.length === 0 ? (
              <p className="dark:text-polar-500 text-sm text-gray-500">
                Rien encore. Chaque question posée ici reste attachée au
                dossier, avec sa réponse et ses sources.
              </p>
            ) : (
              questions.map((question) => (
                <QuestionCard key={question.id} question={question} />
              ))
            )}
          </div>
        </section>
      </div>
    </DashboardBody>
  )
}

export default DossierPage
