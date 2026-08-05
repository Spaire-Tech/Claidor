// Shared formatters for analytics deltas. The aggregate API returns
// percent-changes (`*_pct`) for counts and absolute point-changes
// (`*_pt`) for rates; tiles render whichever applies in the design's
// "+12.4% last 30 days" / "+2.1pt vs industry" copy.

const fmtSigned = (n: number, suffix: string, fractionDigits = 1): string => {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(fractionDigits)}${suffix}`
}

export const fmtPctDelta = (
  delta: number | null | undefined,
): string | undefined => {
  if (delta === null || delta === undefined) return undefined
  if (!Number.isFinite(delta)) return undefined
  return fmtSigned(delta, '%')
}

export const fmtPtDelta = (
  delta: number | null | undefined,
): string | undefined => {
  if (delta === null || delta === undefined) return undefined
  if (!Number.isFinite(delta)) return undefined
  return fmtSigned(delta, 'pt', 2)
}
