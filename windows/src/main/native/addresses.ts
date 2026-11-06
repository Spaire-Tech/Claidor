// Which addresses the app may read a picture from, and how a page's head names
// its icons: the core's `LinkPreviewPolicy` (LinkMetadata.swift), written
// again for the main process. Only `https:` on port 443, no name or password
// in it; a host with a dot that is not "localhost" nor ends in a private
// suffix, or a public IP address. The host's addresses are looked up before
// each request too (stricter than the Mac's), so a public name that points
// inside the PC's network is refused.

import { BlockList, isIP } from 'node:net'

export const maxURLLength = 2_048
export const maxRedirects = 5
export const htmlByteLimit = 512 * 1024
export const imageByteLimit = 2 * 1024 * 1024

const nonPublicSuffixes = [
  '.localhost',
  '.local',
  '.internal',
  '.lan',
  '.home',
  '.corp',
  '.cluster',
  '.svc',
  '.arpa',
  '.onion',
]

/** Private, reserved and multicast addresses (the core's block list). */
const blocked = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  blocked.addSubnet(network, prefix, 'ipv4')
for (const [network, prefix] of [
  // (No ::ffff:0:0/96 here: Node's list would then block every IPv4 address; a mapped one is judged as IPv4 below.)
  ['::', 127],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const)
  blocked.addSubnet(network, prefix, 'ipv6')

/** A private, reserved or multicast address; anything that is not an address is refused too. */
export function isBlockedAddress(address: string): boolean {
  const kind = isIP(address)
  if (kind === 4) return blocked.check(address, 'ipv4')
  if (kind === 6) {
    // An IPv4 address written as IPv6 ("::ffff:10.0.0.1") is judged as the IPv4 one.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)
    if (mapped) return blocked.check(mapped[1]!, 'ipv4')
    return blocked.check(address, 'ipv6')
  }
  return true
}

function normalizedHost(host: string): string {
  let value = host
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1)
  value = value.toLowerCase()
  while (value.endsWith('.')) value = value.slice(0, -1)
  return value
}

function isBlockedHostname(host: string): boolean {
  return (
    host === '' ||
    !host.includes('.') ||
    host === 'localhost' ||
    nonPublicSuffixes.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix))
  )
}

/** An address a picture may be read from (`LinkPreviewPolicy.safeURL`), or undefined. */
export function safeURL(raw: string): URL | undefined {
  if (raw.length > maxURLLength) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return undefined
  if (url.port !== '' && url.port !== '443') return undefined
  const host = normalizedHost(url.hostname)
  if (isIP(host) !== 0) return isBlockedAddress(host) ? undefined : url
  return isBlockedHostname(host) ? undefined : url
}

/** `href` against the page's own address, if what it names may be read (`LinkPreviewPolicy.absolute`). */
export function absolute(href: string, base: URL): string | undefined {
  try {
    const url = safeURL(new URL(href, base).href)
    return url?.href
  } catch {
    return undefined
  }
}

/** The entities a head uses: &amp; &lt; &gt; &quot; &apos; &nbsp; and numbered ones. */
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (whole, digits: string) => {
      const code = Number(digits)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    })
    .replace(/&#x([0-9a-f]+);/gi, (whole, digits: string) => {
      const code = Number.parseInt(digits, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    })
    .replace(/&(amp|#38);/gi, '&')
    .replace(/&(lt|#60);/gi, '<')
    .replace(/&(gt|#62);/gi, '>')
    .replace(/&(quot|#34);/gi, '"')
    .replace(/&(apos|#39);/gi, "'")
    .replace(/&nbsp;/gi, ' ')
}

/** A tag's attribute, quoted or not. */
export function attribute(tag: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escaped}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag)
  return match ? (match[2] ?? match[3] ?? match[4]) : undefined
}

/** The first `<link>` whose `rel` has one of `rels`: its href (`LinkPreviewPolicy.linkHref`). */
export function linkHref(html: string, rels: readonly string[]): string | undefined {
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(tag, 'rel')
    if (!rel) continue
    const tokens = rel.toLowerCase().split(/\s+/)
    if (!rels.some((wanted) => tokens.includes(wanted))) continue
    const href = attribute(tag, 'href')
    if (href === undefined) continue
    return decodeEntities(href).trim()
  }
  return undefined
}

/** A saved login's site as the core keys it (`CredentialSite.site`): its host, lower case, without "www."; "" when it names none. */
export function siteKey(value: string): string {
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
