import React from 'react'

/**
 * Markdown-lite for answers: headings become bold lines, horizontal rules
 * drop, table rows read as prose, **bold** renders as <strong>. Shared by
 * the static answer path and the streaming renderer so both agree on the
 * final layout — the end-of-stream swap must not move a single glyph.
 */

export const mdCleanLines = (text: string): string => {
  if (
    !text ||
    (text.indexOf('**') < 0 &&
      text.indexOf('#') < 0 &&
      text.indexOf('---') < 0 &&
      text.indexOf('|') < 0)
  ) {
    return text
  }
  return text
    .split('\n')
    .filter((line) => !/^\s*[-*_]{3,}\s*$/.test(line))
    .filter((line) => !/^\s*\|[\s:|-]+\|\s*$/.test(line))
    .map((line) => {
      const heading = line.match(/^\s*#{1,4}\s+(.*)$/)
      if (heading) return '**' + heading[1] + '**'
      if (/^\s*\|.*\|\s*$/.test(line)) {
        const cells = line
          .split('|')
          .map((cell) => cell.trim())
          .filter(Boolean)
        return '— ' + cells.join(' : ')
      }
      return line
    })
    .join('\n')
}

export const mdLite = (text: string): React.ReactNode => {
  const cleaned = mdCleanLines(text)
  if (typeof cleaned !== 'string') return cleaned
  const parts = cleaned.split(/\*\*([^*]+)\*\*/g)
  if (parts.length === 1) return cleaned
  return parts.map((part, i) =>
    i % 2 === 1 ? React.createElement('strong', { key: i }, part) : part,
  )
}
