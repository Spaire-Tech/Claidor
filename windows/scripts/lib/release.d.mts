// The types of release.mjs, for the tests (test/release.test.ts).

export const platform: string
export const minimumWindows: string
export const company: string
export const signers: string[]
export function signersReady(list: unknown): boolean
export function installerName(version: string): string
export function isVersion(value: unknown): boolean
export function signingConfigured(env: Record<string, string | undefined>): boolean
export function feedText(options: {
  version: string
  sha512: string
  size: number
  releaseDate: string
  folder?: string
}): string
export function feedSha512(text: string): string | undefined

interface FileFacts {
  sha256: string
  size: number
}

export function releaseRecord(options: {
  version: string
  build: string
  commit: string
  pubDate: string
  folderUrl: string
  signed: boolean
  exe: FileFacts
  blockmap: FileFacts
}): {
  version: string
  build: string
  commit: string
  platform: string
  minimum_windows: string
  pub_date: string
  signed: boolean
  exe: FileFacts & { url: string }
  blockmap: FileFacts & { url: string }
}

interface Upload {
  file: string
  to: string
  type: string
  noCache?: boolean
}

export function uploads(options: { version: string; s3: string }): {
  folder: Upload[]
  checked: string[]
  pointers: Upload[]
}
