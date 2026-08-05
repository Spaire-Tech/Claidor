// Inline HTML sanitizer for composer text.
//
// Two jobs, one allow-list:
//   1. transformPastedHTML in the TipTap editors — so pasting from Docs/Word/
//      web can't drag foreign font-size / font-family / line-height into the
//      email (the root cause of "random fonts & sizes on random paragraphs").
//   2. A defensive backstop in the serializer for any legacy/dirty content.
//
// We keep only inline formatting that maps to our schema (bold/italic/
// underline/strike/links) plus an explicit text colour. Everything else —
// <font> tags, class/id, and every inline style except `color` — is stripped.

const ALLOWED_TAGS = new Set([
  'B',
  'STRONG',
  'I',
  'EM',
  'U',
  'S',
  'STRIKE',
  'DEL',
  'A',
  'BR',
  'SPAN',
  'P',
  'DIV',
])

// A safe colour token: hex, a CSS named colour, or an rgb/rgba/hsl/hsla()
// function. TipTap's Color mark normalises hex to rgb(), so rgb() MUST pass —
// while url()/expression()/var() and anything else are rejected.
const SAFE_COLOR =
  /^(#[0-9a-f]{3,8}|[a-z]+|(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%/\s]+\))$/i

// Only `color` survives from inline styles — never font-size/family/line-height,
// which are what made paragraphs render at random sizes.
function keepColorOnly(style: string): string {
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)
  if (!m) return ''
  const value = m[1].trim()
  if (!SAFE_COLOR.test(value)) return ''
  return `color:${value}`
}

function clean(node: Element) {
  // Depth-first so we can unwrap/remove while walking a stable child list.
  for (const child of Array.from(node.children)) clean(child)

  const tag = node.tagName
  if (!ALLOWED_TAGS.has(tag)) {
    // Unwrap unknown tags (e.g. <font>): keep their text, drop the element.
    const parent = node.parentNode
    if (parent) {
      while (node.firstChild) parent.insertBefore(node.firstChild, node)
      parent.removeChild(node)
    }
    return
  }

  // Strip every attribute except href (on <a>) and a colour-only style.
  for (const attr of Array.from(node.attributes)) {
    const name = attr.name.toLowerCase()
    if (name === 'href' && tag === 'A') {
      const href = attr.value.trim()
      // Drop javascript:/data: links.
      if (/^\s*(javascript|data|vbscript):/i.test(href)) {
        node.removeAttribute(attr.name)
      }
      continue
    }
    if (name === 'style') {
      const kept = keepColorOnly(attr.value)
      if (kept) node.setAttribute('style', kept)
      else node.removeAttribute('style')
      continue
    }
    node.removeAttribute(attr.name)
  }

  if (tag === 'A') {
    node.setAttribute('rel', 'noopener noreferrer')
    node.setAttribute('target', '_blank')
  }
}

/**
 * Sanitize an inline HTML fragment to the composer's allow-list. Returns the
 * input unchanged when there's no DOM available (SSR) — callers only invoke it
 * client-side (paste handlers, send-time serialization).
 */
export function sanitizeInlineHtml(html: string): string {
  if (!html) return ''
  if (typeof document === 'undefined') return html
  const root = document.createElement('div')
  root.innerHTML = html
  clean(root)
  return root.innerHTML
}
