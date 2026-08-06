'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { formatFrenchDate } from '@/components/Librarian/LibrarianAnswer'
import Pill from '@claidor/ui/components/atoms/Pill'
import ArrowBackOutlined from '@mui/icons-material/ArrowBackOutlined'
import OpenInNewOutlined from '@mui/icons-material/OpenInNewOutlined'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CorpusDecisionDetail, fetchDecision } from './api'

const LOAD_ERROR = 'Le chargement de la décision a échoué. Réessayez.'

export interface DecisionPageProps {
  organization: string
  decisionId: string
}

const DecisionPage = ({ organization, decisionId }: DecisionPageProps) => {
  const [decision, setDecision] = useState<CorpusDecisionDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setDecision(null)
    setError(null)
    fetchDecision(decisionId, controller.signal)
      .then(setDecision)
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(LOAD_ERROR)
        }
      })
    return () => controller.abort()
  }, [decisionId])

  if (error) {
    return (
      <DashboardBody title="Bibliothèque">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      </DashboardBody>
    )
  }

  if (!decision) {
    return (
      <DashboardBody title="Bibliothèque">
        <div
          className="flex flex-row items-center gap-x-2 text-sm text-gray-400"
          role="status"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          Chargement de la décision…
        </div>
      </DashboardBody>
    )
  }

  const paragraphs = decision.full_text
    ? decision.full_text.split(/\n{2,}/).filter((p) => p.trim().length > 0)
    : []

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
          <h1 className="text-2xl font-medium tracking-tight text-gray-900">
            CCJA, n° {decision.number} du{' '}
            {formatFrenchDate(decision.decided_on)}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {decision.chamber && (
              <Pill color="gray" className="px-2 py-0.5">
                {decision.chamber}
              </Pill>
            )}
            {decision.ohadata_code && (
              <Pill color="purple" className="px-2 py-0.5">
                Ohadata {decision.ohadata_code}
              </Pill>
            )}
          </div>
        </div>

        {decision.summary && (
          <blockquote className="border-l-2 border-gray-200 pl-4 text-sm leading-relaxed text-gray-600 italic">
            {decision.summary}
          </blockquote>
        )}

        {decision.articles.length > 0 && (
          <div className="flex flex-col gap-y-3">
            <h3 className="text-sm font-medium text-gray-500 uppercase">
              Articles visés
            </h3>
            <div className="flex flex-wrap gap-2">
              {decision.articles.map((article) => (
                <Link
                  key={article.article_id}
                  href={`/dashboard/${organization}/bibliotheque/article/${article.article_id}`}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  Article {article.number} ({article.version_label})
                </Link>
              ))}
            </div>
          </div>
        )}

        {paragraphs.length > 0 && (
          <div className="flex flex-col gap-y-4 rounded-2xl border border-gray-200 bg-white p-6">
            {paragraphs.map((paragraph, i) => (
              <p
                key={i}
                className="text-sm leading-relaxed whitespace-pre-wrap text-gray-700"
              >
                {paragraph}
              </p>
            ))}
          </div>
        )}

        {decision.source_url && (
          <a
            href={decision.source_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="inline-flex items-center gap-x-1.5 text-xs text-gray-400 transition-colors hover:text-gray-600"
          >
            <OpenInNewOutlined sx={{ fontSize: 12 }} />
            Consulter la décision sur Juricaf
          </a>
        )}
      </div>
    </DashboardBody>
  )
}

export default DecisionPage
