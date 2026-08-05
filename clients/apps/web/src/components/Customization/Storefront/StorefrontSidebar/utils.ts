// --- Focal point helpers ---

export const focalPointToObjectPosition = (focal: string): string => {
  // "X% Y%" is stored directly as CSS object-position
  if (focal.includes('%')) return focal
  // Legacy named values
  const map: Record<string, string> = {
    'top-left': 'left top',
    top: 'center top',
    'top-right': 'right top',
    left: 'left center',
    center: 'center center',
    right: 'right center',
    'bottom-left': 'left bottom',
    bottom: 'center bottom',
    'bottom-right': 'right bottom',
  }
  return map[focal] ?? 'center center'
}

export const parseFocalPosition = (
  raw: string,
): { x: number; y: number } => {
  if (raw.includes('%') && raw.includes(' ')) {
    const [px, py] = raw.split(' ')
    return { x: parseFloat(px), y: parseFloat(py) }
  }
  const named: Record<string, { x: number; y: number }> = {
    'top-left': { x: 0, y: 0 },
    top: { x: 50, y: 0 },
    'top-right': { x: 100, y: 0 },
    left: { x: 0, y: 50 },
    center: { x: 50, y: 50 },
    right: { x: 100, y: 50 },
    'bottom-left': { x: 0, y: 100 },
    bottom: { x: 50, y: 100 },
    'bottom-right': { x: 100, y: 100 },
  }
  return named[raw] ?? { x: 50, y: 50 }
}

// --- Social URL helpers ---

// Normalize a user-typed URL: prepend https:// if no scheme is present
// (so 'instagram.com/me' becomes 'https://instagram.com/me'), trim
// surrounding whitespace.
export const normalizeSocialUrl = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed // mailto:, etc.
  return `https://${trimmed}`
}

export const isValidSocialUrl = (raw: string): boolean => {
  const trimmed = raw.trim()
  if (!trimmed) return true // empty is fine; cleaned out before save
  try {
    const u = new URL(normalizeSocialUrl(trimmed))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

