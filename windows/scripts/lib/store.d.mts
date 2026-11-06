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
