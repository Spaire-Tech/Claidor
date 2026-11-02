// A connector page's own words and links (SimeonCore's `ConnectorPage`,
// ConnectorPages.swift; the founder, 29 October 2026, after ChatGPT's
// plugin pages): who makes it, a few lines on what an agent does with it,
// three messages a person might send their agent naming it (shown on the
// page's card, the name in its colour with its logo as in a chat; they do
// nothing when clicked), and its maker's site, privacy policy and terms. The
// most-used connectors first; one without a page keeps its catalog line.
//
// The pages themselves are the core's, made into a table by
// scripts/make-connector-pages.mjs (`writtenConnectorPages.ts`).

import { t } from './l10n'
import { writtenPage } from './writtenConnectorPages'

export { written } from './writtenConnectorPages'

export interface ConnectorPage {
  maker: string
  about: string
  examples: string[]
  /** The maker's site, privacy policy and terms (https, each checked when written). */
  website: string
  privacy: string
  terms: string
}

/** The page of a catalog entry (its id, as `gmail`), in the app's language (`ConnectorPage.page(for:)`). */
export function connectorPage(id: string): ConnectorPage | undefined {
  return writtenPage(id)
}

/** Under the name: "By Google" (`byline`). */
export function byline(page: ConnectorPage): string {
  return t`By ${page.maker}`
}

/** The page's Information and its lines. */
export const informationWords = {
  information: () => t('Information'),
  category: () => t('Category'),
  developer: () => t('Developer'),
  website: () => t('Website'),
  privacy: () => t('Privacy Policy'),
  terms: () => t('Terms of Service'),
}

/** A link's address as Information shows it: the host without "www." (`policies.google.com`); the address itself when it has none (`ConnectorPage.shown`). */
export function shownAddress(address: string): string {
  let host = ''
  try {
    host = new URL(address).hostname
  } catch {
    // Not an address with a host.
  }
  if (host === '') host = address
  return host.startsWith('www.') ? host.slice(4) : host
}
