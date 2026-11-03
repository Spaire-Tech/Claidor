// The types of signature.mjs, for the app (src/main/updates/engine.ts) and the tests.

export const signatureTimeoutMs: number
export function subjectParts(subject: unknown): Map<string, string> | undefined
export function fullSubject(subject: unknown): boolean
export function sameSubject(a: unknown, b: unknown): boolean
export function powershellPath(env?: Record<string, string | undefined>): string
export function signatureArguments(file: string): string[]
export function judgeSignature(
  answer: { error?: unknown; stdout?: unknown; stderr?: unknown },
  file: string,
  signers: readonly string[],
): string | null

interface Asking {
  program?: string
  args?: string[]
}

export function checkSignature(file: string, signers: readonly string[], asking?: Asking): Promise<string | null>
export function checkSignatureNow(file: string, signers: readonly string[], asking?: Asking): string | null
