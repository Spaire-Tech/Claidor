// What the composer takes (SimeonCore's `AttachmentLimits`; the window's
// staging, `j9n`, `q9n`, `attachment-limits.ts`): six files at most, each up
// to 25 MB (200 MB for a video), none empty; and the line it shows for five
// seconds when some are left out.

import { fileExtension } from './filePreview'
import { t } from './l10n'

export const maxStaged = 6
export const byteLimit = 25 * 1024 * 1024
export const videoByteLimit = 200 * 1024 * 1024
const videoExtensions = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm'])
/** How long the composer shows the line (`chat-attachment-notice`). */
export const noticeSeconds = 5

export type Refusal = 'tooLarge' | 'empty' | 'failed'

export function isVideo(name: string): boolean {
  return videoExtensions.has(fileExtension(name) ?? '')
}

export function limitFor(name: string): number {
  return isVideo(name) ? videoByteLimit : byteLimit
}

/** Why a file of `size` bytes can't be attached, if it can't. */
export function refusal(name: string, size: number): Refusal | undefined {
  if (size === 0) return 'empty'
  return size > limitFor(name) ? 'tooLarge' : undefined
}

/** How many of `incoming` fit beside `staged`, and the line for the rest ("Only 6 attachments allowed — 2 weren't added."). */
export function admit(
  incoming: number,
  staged: number,
): { accepted: number; notice?: string } {
  const accepted = Math.min(incoming, Math.max(0, maxStaged - staged))
  const left = incoming - accepted
  if (left <= 0) return { accepted }
  return {
    accepted,
    notice:
      left === 1
        ? t`Only ${maxStaged} attachments allowed — ${left} wasn't added.`
        : t`Only ${maxStaged} attachments allowed — ${left} weren't added.`,
  }
}

/** The line for the files that could not be attached: one by name, else how many. */
export function refusedNotice(
  refused: { name: string; reason: Refusal }[],
): string | undefined {
  const first = refused[0]
  if (!first) return undefined
  if (refused.length === 1) {
    const name = first.name
    switch (first.reason) {
      case 'tooLarge':
        return isVideo(name)
          ? t`"${name}" is too large to attach (max 200 MB for video).`
          : t`"${name}" is too large to attach (max 25 MB).`
      case 'empty':
        return t`"${name}" is empty, so it wasn't attached.`
      case 'failed':
        return t`Couldn't attach "${name}".`
    }
  }
  const count = refused.length
  if (refused.every((item) => item.reason === 'tooLarge'))
    return t`${count} files are too large to attach (max 25 MB, or 200 MB for video).`
  return t`${count} files couldn't be attached.`
}
