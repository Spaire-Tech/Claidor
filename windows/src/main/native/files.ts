// Windows' own file dialog for the page (the Mac's open panels: the avatar's
// Browse files, "Choose an avatar image"; the screenshots' Add, "Choose
// screenshots to add"): what the page asks is checked here, and only files
// of the kinds it named are read back, each at most 25 MB.

import type { ChosenFile, FileAsk } from '../../../../clients/apps/app/src/desktop/contract'

/** The most a chosen file may weigh to be read back to the page. */
export const chosenFileLimit = 25 * 1024 * 1024

/** The types of the kinds the page may ask for, by extension. */
const types: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  avif: 'image/avif',
}

/** What the page asked, checked; undefined when any part is not what a dialog takes. */
export function readFileAsk(value: unknown): FileAsk | undefined {
  if (typeof value !== 'object' || value == null) return undefined
  const ask = value as Partial<FileAsk>
  if (typeof ask.title !== 'string' || ask.title.length === 0 || ask.title.length > 200) return undefined
  if (typeof ask.filterName !== 'string' || ask.filterName.length === 0 || ask.filterName.length > 100)
    return undefined
  if (!Array.isArray(ask.extensions) || ask.extensions.length === 0 || ask.extensions.length > 20) return undefined
  const extensions = ask.extensions.map((kind) => (typeof kind === 'string' ? kind.toLowerCase() : ''))
  if (!extensions.every((kind) => kind in types)) return undefined
  if (typeof ask.multiple !== 'boolean') return undefined
  if (typeof ask.max !== 'number' || !Number.isInteger(ask.max) || ask.max < 1 || ask.max > 10) return undefined
  return { title: ask.title, filterName: ask.filterName, extensions, multiple: ask.multiple, max: ask.max }
}

/** A chosen file's type by its extension, when it is one of the kinds asked for. */
export function chosenType(name: string, ask: FileAsk): string | undefined {
  const dot = name.lastIndexOf('.')
  const kind = dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
  return ask.extensions.includes(kind) ? types[kind] : undefined
}

export type { ChosenFile }
