'use client'

import { markdownOptions } from '@/utils/markdown'
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import GavelOutlined from '@mui/icons-material/GavelOutlined'
import Markdown, { MarkdownToJSX } from 'markdown-to-jsx'
import { memo, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import { LibrarianAuthority } from './stream'

export const SOURCE_ANCHOR_PREFIX = '#librarian-source-'

/**
 * Citation markers are injected into the streamed markdown as regular links
 * pointing to `#librarian-source-<n>`; this override renders them as small
 * [n] badges that scroll to the matching source card.
 */
const answerMarkdownOptions: MarkdownToJSX.Options = {
  ...markdownOptions,
  overrides: {
    ...markdownOptions.overrides,
    a: (props: any) => {
      const href: string = props.href ?? ''
      if (href.startsWith(SOURCE_ANCHOR_PREFIX)) {
        return (
          <a
            href={href}
            className="mx-0.5 align-super text-xs font-medium text-blue-500 no-underline transition-opacity duration-200 hover:opacity-50"
          >
            [{props.children}]
          </a>
        )
      }
      return (
        <a
          {...props}
          rel="noopener noreferrer nofollow"
          target="_blank"
          className="text-blue-400 transition-opacity duration-200 hover:opacity-50"
        />
      )
    },
  },
}

const FRENCH_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

/** Format an ISO date (e.g. "2010-04-08") as a French date, "8 avril 2010". */
export const formatFrenchDate = (isoDate: string): string => {
  const parsed = new Date(
    isoDate.includes('T') ? isoDate : `${isoDate}T00:00:00Z`,
  )
  if (Number.isNaN(parsed.getTime())) {
    return isoDate
  }
  return FRENCH_DATE_FORMAT.format(parsed)
}

export interface LibrarianAnswerProps {
  content: string
  /** Authority signal from the `authority` SSE event, once received. */
  authority?: LibrarianAuthority | null
  /** Acte uniforme versions from the `done` SSE event, e.g. ["1998"]. */
  versionsUsed?: string[]
}

export const LibrarianAnswer = memo(
  ({ content, authority, versionsUsed }: LibrarianAnswerProps) => {
    const [decisionsExpanded, setDecisionsExpanded] = useState(false)
    const hasDecisions =
      authority !== null && authority !== undefined && authority.count > 0

    return (
      <div className="flex flex-col gap-y-4">
        {versionsUsed && versionsUsed.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {versionsUsed.map((version) => (
              <span
                key={version}
                className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-medium tracking-wide text-gray-600"
              >
                AUPSRVE {version}
              </span>
            ))}
          </div>
        )}
        <div className="prose prose-gray flex max-w-none flex-col gap-y-3 text-sm leading-relaxed text-gray-700 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <Markdown options={answerMarkdownOptions}>{content}</Markdown>
        </div>
        {authority && (
          <div className="flex flex-col items-start gap-y-2">
            <button
              type="button"
              onClick={
                hasDecisions
                  ? () => setDecisionsExpanded((expanded) => !expanded)
                  : undefined
              }
              aria-expanded={hasDecisions ? decisionsExpanded : undefined}
              className={twMerge(
                'inline-flex max-w-fit items-center gap-x-2 rounded-full border px-4 py-2 text-sm font-medium',
                hasDecisions
                  ? 'cursor-pointer border-amber-200 bg-amber-50 text-amber-900 transition-colors hover:bg-amber-100'
                  : 'border-gray-200 bg-gray-50 text-gray-500',
              )}
            >
              <GavelOutlined
                className={hasDecisions ? 'text-amber-600' : 'text-gray-400'}
                sx={{ fontSize: 16 }}
              />
              <span>
                {'Autorité : '}
                {authority.label}
              </span>
              {hasDecisions &&
                (decisionsExpanded ? (
                  <ExpandLessOutlined sx={{ fontSize: 16 }} />
                ) : (
                  <ExpandMoreOutlined sx={{ fontSize: 16 }} />
                ))}
            </button>
            {hasDecisions && decisionsExpanded && (
              <ul className="flex flex-col gap-y-1.5 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-3 text-sm text-amber-900">
                {authority.decisions.map((decision) => (
                  <li
                    key={decision.id}
                    className="flex flex-row items-baseline gap-x-2"
                  >
                    <span className="font-medium">
                      {'Décision n° '}
                      {decision.number}
                    </span>
                    <span className="text-amber-700">
                      {formatFrenchDate(decision.decided_on)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    )
  },
)

LibrarianAnswer.displayName = 'LibrarianAnswer'
