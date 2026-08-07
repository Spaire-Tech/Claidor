'use client'

import { DashboardBody } from '@/components/Claidor/Body'
import { formatFrenchDate } from '@/components/Librarian/LibrarianAnswer'
import Pill from '@claidor/ui/components/atoms/Pill'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import GavelOutlined from '@mui/icons-material/GavelOutlined'
import SwapHorizOutlined from '@mui/icons-material/SwapHorizOutlined'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CorpusArticleDetail, fetchArticle, RELATION_LABELS } from './api'

const LOAD_ERROR = 'Le chargement de l’article a échoué. Réessayez.'

const provenanceLine = (article: CorpusArticleDetail): string | null => {
  const provenance = article.provenance
  if (!provenance?.source) {
    return null
  }
  const crosscheck = provenance.authority_crosscheck
  const verification = crosscheck
    ? crosscheck.startsWith('pending')
      ? 'vérification J.O. en attente'
      : `vérification : ${crosscheck}`
    : null
  return `Source : ${provenance.source}${verification ? ` — ${verification}` : ''}`
}

export interface ArticlePageProps {
  organization: string
  articleId: string
}

const ArticlePage = ({ organization, articleId }: ArticlePageProps) => {
  const [article, setArticle] = useState<CorpusArticleDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setArticle(null)
    setError(null)
    fetchArticle(articleId, controller.signal)
      .then(setArticle)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(LOAD_ERROR)
        }
      })
    return () => controller.abort()
  }, [articleId])

  if (error) {
    return (
      <DashboardBody title="Bibliothèque">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      </DashboardBody>
    )
  }

  if (!article) {
    return (
      <DashboardBody title="Bibliothèque">
        <div
          className="flex flex-row items-center gap-x-2 text-sm text-gray-400"
          role="status"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          Chargement de l’article…
        </div>
      </DashboardBody>
    )
  }

  const provenance = provenanceLine(article)

  return (
    <DashboardBody title="Bibliothèque">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-y-8">
        <div className="flex flex-col gap-y-3">
          <Link
            href={`/dashboard/${organization}/bibliotheque`}
            className="inline-flex items-center gap-x-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900"
          >
            <ArrowBackOutlined sx={{ fontSize: 14 }} />
            Bibliothèque
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-medium tracking-tight text-gray-900">
              Article {article.number}
            </h1>
            <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium tracking-wide text-gray-600">
              {article.act_short_code} {article.version_label}
            </span>
          </div>
          {article.heading && (
            <p className="text-sm text-gray-500">{article.heading}</p>
          )}
        </div>

        <div className="flex flex-col gap-y-4 rounded-2xl border border-gray-200 bg-white p-6">
          {article.alineas.map((alinea, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700"
            >
              {alinea}
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-y-3">
          <h3 className="flex items-center gap-x-2 text-sm font-medium text-gray-500 uppercase">
            <SwapHorizOutlined sx={{ fontSize: 16 }} />
            Versions
          </h3>
          {article.equivalences.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune correspondance connue dans l’autre version.
            </p>
          ) : (
            <ul className="flex flex-col gap-y-2">
              {article.equivalences.map((equivalence) => (
                <li
                  key={`${equivalence.article_id}-${equivalence.relation}`}
                  className="flex flex-col gap-y-1 rounded-2xl border border-gray-200 bg-white p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/dashboard/${organization}/bibliotheque/article/${equivalence.article_id}`}
                      className="text-sm font-medium text-blue-500 transition-opacity hover:opacity-70"
                    >
                      Article {equivalence.number} — {article.act_short_code}{' '}
                      {equivalence.version_label}
                    </Link>
                    <Pill color="blue" className="px-2 py-0.5">
                      {RELATION_LABELS[equivalence.relation] ??
                        equivalence.relation}
                    </Pill>
                  </div>
                  {equivalence.note && (
                    <p className="text-xs leading-relaxed text-gray-500">
                      {equivalence.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-y-3">
          <h3 className="flex items-center gap-x-2 text-sm font-medium text-gray-500 uppercase">
            <GavelOutlined sx={{ fontSize: 16 }} />
            Jurisprudence ({article.decisions.length}{' '}
            {article.decisions.length > 1 ? 'décisions' : 'décision'} dans le
            corpus chargé)
          </h3>
          {article.decisions.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune décision liée à cet article dans le corpus chargé.
            </p>
          ) : (
            <ul className="flex flex-col gap-y-2">
              {article.decisions.map((decision) => (
                <li key={decision.id}>
                  <Link
                    href={`/dashboard/${organization}/bibliotheque/decision/${decision.id}`}
                    className="flex flex-col gap-y-1 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 transition-colors hover:bg-amber-50"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-amber-900">
                        CCJA, n° {decision.number}
                      </span>
                      <span className="text-xs text-amber-700">
                        {formatFrenchDate(decision.decided_on)}
                      </span>
                    </div>
                    {decision.summary && (
                      <p className="line-clamp-3 text-xs leading-relaxed text-amber-800">
                        {decision.summary}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {provenance && <p className="text-xs text-gray-400">{provenance}</p>}
      </div>
    </DashboardBody>
  )
}

export default ArticlePage
