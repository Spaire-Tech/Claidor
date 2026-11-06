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
export function psQuote(text: string): string
export function encodeScript(script: string): string
export function testCertificateScript(publisher: string): string
export function trustedScript(thumbprint: string): string
export function trustScript(thumbprint: string, cerPath: string): string
export function installScript(appxPath: string): string
