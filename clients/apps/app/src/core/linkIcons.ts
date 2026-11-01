// The site's icon before each link in a message (SimeonCore's LinkIcons.swift;
// the founder, 29 October 2026: "for each link sent in chat, put next to it
// the favicon … but the link stays blue"): which website a link goes to, and
// none for an email's page (Gmail's, Outlook's on the web) or a link to no
// website. The icon is the site's own, never a favicon service's (a person's
// sites stay between them and those sites).

/** "acme.com" from an address or a domain, without "www."; empty when it names no site (`CredentialSite.site`). */
export function credentialSite(value: string): string {
  const text = value.trim()
  if (text === '' || /\s/.test(text)) return ''
  let host: string
  try {
    host = new URL(text.includes('://') ? text : `https://${text}`).hostname
  } catch {
    return ''
  }
  let name = host.toLowerCase()
  while (name.endsWith('.')) name = name.slice(0, -1)
  if (name.startsWith('www.')) name = name.slice(4)
  return name.includes('.') ? name : ''
}

/** Gmail's and Outlook's pages on the web, where a link to an email goes. */
function isEmail(host: string): boolean {
  return (
    host === 'mail.google.com' ||
    host === 'inbox.google.com' ||
    (host.startsWith('outlook.') &&
      (host.endsWith('.office.com') ||
        host.endsWith('.live.com') ||
        host.endsWith('.office365.com')))
  )
}

/** The website a link goes to (`LinkIcons.site`): its host, without "www."; none for an email's page or no website. */
export function siteOf(link: string): string | undefined {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return undefined
  }
  const scheme = url.protocol.replace(/:$/, '').toLowerCase()
  if (scheme !== 'https' && scheme !== 'http') return undefined
  const host = url.hostname.toLowerCase()
  if (host === '' || isEmail(host)) return undefined
  const site = credentialSite(host)
  return site === '' ? undefined : site
}
