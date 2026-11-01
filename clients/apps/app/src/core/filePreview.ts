// What the preview does with a file (SimeonCore's FilePreview.swift, from the
// window's own `file-preview-kind.ts`, `media-extensions.ts` and
// `attachment-preview.ts`): a file's kind from its name, whether its card
// opens a preview, and the pieces of a name. The viewers come with step 2c's
// second part.

/** How a file opens (`getFilePreviewKind`). */
export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'table'
  | 'json'
  | 'markdown'
  | 'docx'
  | 'text'
  | 'unknown'

/** The most the preview reads of a file (`ATTACHMENT_PREVIEW_BYTE_CAP`): larger shows "too large". */
export const byteCap = 25 * 1024 * 1024

const images = new Set([
  'avif',
  'bmp',
  'gif',
  'ico',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'webp',
])
const videos = new Set(['m4v', 'mov', 'mp4', 'ogv', 'webm'])
const audio = new Set([
  'aac',
  'flac',
  'm4a',
  'mp3',
  'oga',
  'ogg',
  'opus',
  'wav',
  'weba',
])
const tables = new Set(['csv', 'tsv', 'xlsx', 'xls'])
const markdown = new Set(['md', 'markdown', 'mdx'])
const texts = new Set(
  (
    'txt text log md markdown mdx rst adoc tex json jsonc json5 ndjson csv tsv ' +
    'xml yaml yml toml ini cfg conf env properties plist gradle html htm css scss ' +
    'sass less svg js jsx mjs cjs ts tsx mts cts py pyi rb go rs java kt ' +
    'kts c h cc cpp cxx hpp hh cs php swift scala dart lua pl pm r sql ' +
    'graphql gql proto vue svelte astro sh bash zsh fish bat ps1 tf tfvars ' +
    'dockerfile diff patch'
  ).split(' '),
)
/** The language highlight.js colours a file in (`Awn`). */
const languages: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  pyi: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  scala: 'scala',
  dart: 'dart',
  lua: 'lua',
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
  json: 'json',
  jsonc: 'json',
  json5: 'json',
  ndjson: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'properties',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  svg: 'xml',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  vue: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  bat: 'dos',
  ps1: 'powershell',
  tf: 'terraform',
  tfvars: 'terraform',
  dockerfile: 'dockerfile',
  diff: 'diff',
  patch: 'diff',
}

/** A name's extension in small letters, none for none (`attachmentExtension`: the last dot of the last part, not first or last). */
export function fileExtension(nameOrPath: string): string | undefined {
  const base = nameOrPath.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return undefined
  return base.slice(dot + 1).toLowerCase()
}

export function fileKind(nameOrPath: string): FileKind {
  const ext = fileExtension(nameOrPath)
  if (ext == null) return 'unknown'
  if (images.has(ext)) return 'image'
  if (videos.has(ext)) return 'video'
  if (audio.has(ext)) return 'audio'
  if (ext === 'pdf') return 'pdf'
  if (tables.has(ext)) return 'table'
  if (ext === 'json') return 'json'
  if (markdown.has(ext)) return 'markdown'
  if (ext === 'docx') return 'docx'
  if (texts.has(ext)) return 'text'
  return 'unknown'
}

/** The highlight.js language for a file, none to show it plain (`Pwn`). */
export function fileLanguage(nameOrPath: string): string | undefined {
  const ext = fileExtension(nameOrPath)
  return ext == null ? undefined : languages[ext]
}

/**
 * Whether a file card opens a preview (`Nvn`'s `B`): never for an unknown
 * kind; text, Markdown and JSON only once the computer has read them as
 * text (`readsAsText`, unknown until it answers).
 */
export function opensPreview(kind: FileKind, readsAsText?: boolean): boolean {
  switch (kind) {
    case 'unknown':
      return false
    case 'text':
    case 'markdown':
    case 'json':
      return readsAsText === true
    default:
      return true
  }
}

/** "Launch review" and ".docx" (`Nft`): no extension for a leading or trailing dot. */
export function splitName(name: string): { base: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

/** `%20` read as a space; the text as it is when it is not a valid escape. */
function unescaped(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/** The last part of a path or address, `%20` read as a space (`R5e`). */
export function lastPart(source: string): string {
  let path = source
  if (/^[a-z][a-z0-9+.-]*:/i.test(source)) {
    try {
      const url = new URL(source)
      if (url.pathname !== '') path = url.pathname
    } catch {
      // Not an address: the text is the path.
    }
  }
  path = unescaped(path)
  return path.split(/[/\\]/).filter(Boolean).pop() ?? source
}

/** Where a file is on the computer: a `file://` address's path, or the path as it is. */
export function computerPath(url: string): string {
  if (!url.startsWith('file://')) return url
  try {
    return unescaped(new URL(url).pathname)
  } catch {
    return url.slice(7)
  }
}

/**
 * The name Save offers (`resolveSuggestedDownloadName`): the card's when its
 * kind matches the file's (or the file is `.bin` and the name has no kind),
 * else the file's own, else "download".
 */
export function downloadName(suggested: string, file: string): string {
  const own = lastPart(file)
  const ownKind = fileExtension(own) ?? ''
  const suggestedKind = fileExtension(suggested) ?? ''
  const trimmed = suggested.trim()
  if (
    trimmed !== '' &&
    (suggestedKind === ownKind || (ownKind === 'bin' && suggestedKind === ''))
  )
    return trimmed
  if (own !== '' && own !== '/') return own
  return 'download'
}
