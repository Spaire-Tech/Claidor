'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { formatFrenchDate } from '@/components/Librarian/LibrarianAnswer'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import MenuBookOutlined from '@mui/icons-material/MenuBookOutlined'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  CorpusAct,
  CorpusArticleListItem,
  fetchActs,
  fetchVersionArticles,
} from './api'

const LOAD_ERROR = 'Le chargement de la bibliothèque a échoué. Réessayez.'

export interface BibliothequePageProps {
  organization: string
}

const BibliothequePage = ({ organization }: BibliothequePageProps) => {
  const [act, setAct] = useState<CorpusAct | null>(null)
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  )
  const [articles, setArticles] = useState<CorpusArticleListItem[]>([])
  const [articlesLoading, setArticlesLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchActs(controller.signal)
      .then((acts) => {
        const first = acts[0] ?? null
        setAct(first)
        if (first && first.versions.length > 0) {
          setSelectedVersionId(first.versions[0].id)
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(LOAD_ERROR)
        }
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!selectedVersionId) {
      return
    }
    const controller = new AbortController()
    setArticlesLoading(true)
    fetchVersionArticles(selectedVersionId, controller.signal)
      .then((items) => {
        setArticles(items)
        setArticlesLoading(false)
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(LOAD_ERROR)
          setArticlesLoading(false)
        }
      })
    return () => controller.abort()
  }, [selectedVersionId])

  const selectedVersion = useMemo(
    () => act?.versions.find((v) => v.id === selectedVersionId) ?? null,
    [act, selectedVersionId],
  )

  if (error) {
    return (
      <DashboardBody title="Bibliothèque">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      </DashboardBody>
    )
  }

  if (!act) {
    return (
      <DashboardBody title="Bibliothèque">
        <div
          className="flex flex-row items-center gap-x-2 text-sm text-gray-400"
          role="status"
        >
          <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
          Chargement du corpus…
        </div>
      </DashboardBody>
    )
  }

  return (
    <DashboardBody title="Bibliothèque">
      <div className="flex w-full flex-col gap-y-8">
        <div className="flex flex-col gap-y-4">
          <div className="flex flex-col gap-y-1">
            <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
              {act.short_code}
            </span>
            <h1 className="text-2xl font-medium tracking-tight text-gray-900">
              {act.title}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {act.versions.map((version) => (
              <button
                key={version.id}
                type="button"
                onClick={() => setSelectedVersionId(version.id)}
                aria-pressed={version.id === selectedVersionId}
                className={twMerge(
                  'flex cursor-pointer flex-col items-start rounded-2xl border px-4 py-2.5 text-left transition-colors',
                  version.id === selectedVersionId
                    ? 'border-blue-200 bg-blue-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50',
                )}
              >
                <span
                  className={twMerge(
                    'text-sm font-medium',
                    version.id === selectedVersionId
                      ? 'text-blue-700'
                      : 'text-gray-900',
                  )}
                >
                  {act.short_code} {version.label}
                </span>
                <span className="text-xs text-gray-500">
                  {version.in_force_from
                    ? `En vigueur depuis le ${formatFrenchDate(version.in_force_from)}`
                    : 'Date d’entrée en vigueur inconnue'}
                  {' · '}
                  {version.article_count} articles
                </span>
              </button>
            ))}
          </div>
          {selectedVersion?.transitional_rule && (
            <div className="flex flex-row items-start gap-x-2 text-xs leading-relaxed text-gray-500">
              <InfoOutlined
                className="mt-0.5 flex-none text-gray-400"
                sx={{ fontSize: 14 }}
              />
              <span>{selectedVersion.transitional_rule}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 md:flex-row">
          <div className="flex w-full flex-none flex-col gap-y-3 md:w-72">
            <h3 className="text-sm font-medium text-gray-500 uppercase">
              Articles{selectedVersion ? ` — ${selectedVersion.label}` : ''}
            </h3>
            {articlesLoading ? (
              <div
                className="flex flex-row items-center gap-x-2 text-sm text-gray-400"
                role="status"
              >
                <span className="h-2 w-2 animate-pulse rounded-full bg-gray-400" />
                Chargement des articles…
              </div>
            ) : (
              <ul className="flex max-h-[65vh] flex-col gap-y-0.5 overflow-y-auto rounded-2xl border border-gray-200 bg-white p-2">
                {articles.map((article) => (
                  <li key={article.id}>
                    <Link
                      href={`/dashboard/${organization}/bibliotheque/article/${article.id}`}
                      className="flex flex-col rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50"
                    >
                      <span className="text-sm font-medium text-gray-900">
                        Article {article.number}
                      </span>
                      {article.heading && (
                        <span className="truncate text-xs text-gray-500">
                          {article.heading}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
                {articles.length === 0 && (
                  <li className="px-3 py-1.5 text-sm text-gray-500">
                    Aucun article chargé pour cette version.
                  </li>
                )}
              </ul>
            )}
          </div>
          <div className="hidden min-h-[40vh] flex-1 items-center justify-center rounded-2xl border border-dashed border-gray-200 md:flex">
            <div className="flex flex-col items-center gap-y-2 text-gray-400">
              <MenuBookOutlined sx={{ fontSize: 32 }} />
              <span className="text-sm">Sélectionnez un article</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardBody>
  )
}

export default BibliothequePage
