// The Microsoft Store package's identity, as Partner Center gives it
// (Apps and games › Simeon › Product management › Product identity), read
// from windows/store.json and checked before anything is built
// (scripts/store.mjs). None of it is secret: Partner Center shows it to
// anyone with the app, and it is written in every package.

/** Where each value is in Partner Center's Product identity page. */
export const identityFields = {
  identityName: 'Package/Identity/Name',
  publisher: 'Package/Identity/Publisher',
  publisherDisplayName: 'Package/Properties/PublisherDisplayName',
}

/**
 * The identity from store.json's text: `{ identity }` when every value is
 * there and well formed, else `{ missing, wrong }`, the fields to fill in or
 * correct.
 */
export function readStoreIdentity(text) {
  let value
  try {
    value = JSON.parse(text)
  } catch {
    return { missing: [], wrong: ['store.json is not JSON'] }
  }
  const missing = []
  const wrong = []
  const field = (name) => {
    const found = typeof value?.[name] === 'string' ? value[name].trim() : ''
    if (found === '') missing.push(name)
    return found
  }
  const identityName = field('identityName')
  const publisher = field('publisher')
  const publisherDisplayName = field('publisherDisplayName')
  // e.g. "ExampleCo.Simeon": 3 to 50 letters, digits, dots and dashes.
  if (identityName !== '' && !/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) wrong.push('identityName')
  // e.g. "CN=1A2B3C4D-…": a distinguished name, as Partner Center writes it.
  if (publisher !== '' && !/^CN=[^,]+(,\s*[A-Z]+=[^,]+)*$/.test(publisher)) wrong.push('publisher')
  if (publisherDisplayName.length > 256) wrong.push('publisherDisplayName')
  if (missing.length > 0 || wrong.length > 0) return { missing, wrong }
  return { identity: { identityName, publisher, publisherDisplayName } }
}
