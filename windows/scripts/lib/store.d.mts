// The types of store.mjs, for the tests (test/store.test.ts).

export interface StoreIdentity {
  identityName: string
  publisher: string
  publisherDisplayName: string
}

export const identityFields: Record<keyof StoreIdentity, string>

export function readStoreIdentity(
  text: string,
): { identity: StoreIdentity } | { missing: string[]; wrong: string[] }

export const TEST_CERTIFICATE_NAME: string

/** electron-builder toolset for the test copy: Windows Kits 10.0.26100. */
export const TEST_SIGN_TOOLSET: string
/** Environment names removed before the build, so another certificate or signtool is not used. */
export const CLEARED_STORE_ENV: readonly string[]

export function storeBuilderConfig(options: {
  test: boolean
  identity: StoreIdentity
  thumbprint: string | null
  output: string
  build: string
}): {
  directories: { output: string }
  appx: StoreIdentity & { artifactName?: string }
  toolsets?: { winCodeSign: string }
  win?: { signtoolOptions: { certificateSha1: string | null } }
  extraMetadata: { simeonBuild: string; description: string }
}

export function psQuote(text: string): string
export function encodeScript(script: string): string
export function testCertificateScript(publisher: string): string
export function trustedScript(thumbprint: string): string
export function trustScript(thumbprint: string, cerPath: string): string
export function installScript(appxPath: string): string
