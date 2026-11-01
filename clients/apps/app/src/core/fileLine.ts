// A file card's line under its name (SimeonCore's `FileLine` in Trays.swift;
// the window's `xvn`, from `readAttachmentText`): its size as the window
// writes it (`Eft`), "Couldn't read file" when the computer has none,
// nothing while it is read.

import { type JSONValue, int, isObject } from './json'
import { t } from './l10n'
import { wordsLanguage } from './words'

export function missingFileLine(): string {
  return t("Couldn't read file")
}

/** `toFixed`: a tie goes up, as JavaScript rounds. */
function fixed(value: number, digits: number): string {
  const scale = digits === 0 ? 1 : 10
  return (Math.round(value * scale) / scale).toFixed(digits)
}

/** `fixed` with the decimal mark of the app's language ("1,3" in French). */
function decimal(value: number, digits: number): string {
  let mark = '.'
  try {
    mark =
      new Intl.NumberFormat(wordsLanguage())
        .formatToParts(1.5)
        .find((part) => part.type === 'decimal')?.value ?? '.'
  } catch {
    // A language the browser can't format in: the English mark.
  }
  return fixed(value, digits).replace('.', mark)
}

/** "512 B", "1.3 KB" under 10 KB, "42 KB", "3.4 MB". */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return t`${bytes} B`
  if (bytes < 1024 * 1024)
    return t`${decimal(bytes / 1024, bytes < 10 * 1024 ? 1 : 0)} KB`
  return t`${decimal(bytes / (1024 * 1024), 1)} MB`
}

/** The line for the computer's answer: null is no file; text or binary carry the size. */
export function fileLine(answer: JSONValue | undefined): string {
  const bytes = isObject(answer) ? int(answer.bytes) : undefined
  return bytes == null ? missingFileLine() : fileSize(bytes)
}
