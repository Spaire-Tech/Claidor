'use client'

import Pill from '@claidor/ui/components/atoms/Pill'
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined'
import ArticleOutlined from '@mui/icons-material/ArticleOutlined'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { LibrarianCitation } from './stream'

export interface SourceCardProps {
  citation: LibrarianCitation
  index: number
}

export const SourceCard = ({ citation, index }: SourceCardProps) => {
  const [expanded, setExpanded] = useState(false)
  const isArticle = citation.source_kind === 'article'

  return (
    <div
      id={`librarian-source-${index}`}
      data-source-id={citation.source_id}
      className="flex scroll-mt-8 flex-col gap-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-xs"
    >
      <div className="flex flex-row items-start gap-x-3">
        <div className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
          {index}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-y-1">
          <span className="text-sm font-medium text-gray-900">
            {citation.title}
          </span>
          <div>
            <Pill
              color={isArticle ? 'blue' : 'purple'}
              className="gap-x-1 px-2 py-0.5"
            >
              {isArticle ? (
                <ArticleOutlined sx={{ fontSize: 12 }} />
              ) : (
                <AccountBalanceOutlined sx={{ fontSize: 12 }} />
              )}
              <span>{isArticle ? 'Texte' : 'CCJA'}</span>
            </Pill>
          </div>
        </div>
      </div>
      <blockquote
        onClick={() => setExpanded((e) => !e)}
        title={expanded ? 'Réduire la citation' : 'Afficher toute la citation'}
        className={twMerge(
          'cursor-pointer border-l-2 border-gray-200 pl-3 text-sm leading-relaxed text-gray-500 italic',
          expanded ? '' : 'line-clamp-3',
        )}
      >
        {citation.quote}
      </blockquote>
    </div>
  )
}
