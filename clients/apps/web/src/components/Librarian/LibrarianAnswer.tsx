'use client'

import { markdownOptions } from '@/utils/markdown'
import GavelOutlined from '@mui/icons-material/GavelOutlined'
import Markdown, { MarkdownToJSX } from 'markdown-to-jsx'
import { memo, useMemo } from 'react'

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

// \s covers the no-break / narrow no-break spaces French typography puts
// before the colon.
const AUTHORITY_PATTERN = /(?:^|\n)[ \t]*(Autorité\s?:.*)$/

/**
 * Extract a final « Autorité : … » line — the authority signal — so it can
 * be rendered as a highlighted pill instead of a plain paragraph.
 */
const splitAuthority = (
  text: string,
): { body: string; authority: string | null } => {
  const trimmed = text.trimEnd()
  const match = trimmed.match(AUTHORITY_PATTERN)
  if (!match || match[1] === undefined) {
    return { body: text, authority: null }
  }
  return {
    body: trimmed.slice(0, trimmed.length - match[1].length),
    authority: match[1].trim(),
  }
}

export const LibrarianAnswer = memo(
  ({ content }: { content: string }) => {
    const { body, authority } = useMemo(
      () => splitAuthority(content),
      [content],
    )

    return (
      <div className="flex flex-col gap-y-4">
        <div className="prose prose-gray flex max-w-none flex-col gap-y-3 text-sm leading-relaxed text-gray-700 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <Markdown options={answerMarkdownOptions}>{body}</Markdown>
        </div>
        {authority && (
          <div className="inline-flex max-w-fit items-center gap-x-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900">
            <GavelOutlined className="text-amber-600" sx={{ fontSize: 16 }} />
            <Markdown options={answerMarkdownOptions}>{authority}</Markdown>
          </div>
        )}
      </div>
    )
  },
  (prevProps, nextProps) => prevProps.content === nextProps.content,
)

LibrarianAnswer.displayName = 'LibrarianAnswer'
