// HTML hygiene for the design email editor.
//
// Block props store rich HTML on purpose (the format bubble writes <b>/<i>/
// <a>/<font> into contenteditable innerHTML), so plain entity-escaping at
// render time would destroy legitimate formatting. Instead there are two
// distinct passes:
//
//   scrubHtml     — permissive XSS scrub applied wherever stored prop HTML is
//                   re-emitted (the editor canvas AND the sent email). Keeps
//                   formatting; removes anything executable. This is the floor
//                   that was previously missing entirely (esc() was identity),
//                   which made any stored block prop a stored-XSS vector in
//                   the dashboard and let arbitrary markup ship in real mail.
//
//   sanitizePastedHtml — strict allow-list for the paste path. Word / Google
//                   Docs clipboards carry the full styled markup (fonts,
//                   sizes, classes, mso-* soup); pasting used to inject it
//                   verbatim into the stored props and the sent email — the
//                   "random fonts and sizes" bug. Paste keeps only structural
//                   formatting: bold, italic, underline, strikethrough, safe
//                   links, and line breaks.

const EXECUTABLE = new Set([
  'SCRIPT',
  'STYLE',
  'IFRAME',
  'FRAME',
  'FRAMESET',
  'OBJECT',
  'EMBED',
  'LINK',
  'META',
  'BASE',
  'FORM',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
])

const isUnsafeUrl = (v: string): boolean =>
  /^\s*(javascript|vbscript|data:text\/html)/i.test(v)

const escapeText = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Remove everything executable from stored rich HTML, keep the formatting.
 *  Plain strings (no markup) pass through with bare `<`/`&` normalised. */
export function scrubHtml(s: unknown): string {
  const raw = String(s == null ? '' : s)
  if (!raw || !/[<&]/.test(raw)) return raw
  // Non-DOM environment (SSR safety net — the editor and renderer are
  // client-only in practice): fail closed by escaping.
  if (typeof document === 'undefined') return escapeText(raw)
  const tpl = document.createElement('template')
  tpl.innerHTML = raw
  tpl.content
    .querySelectorAll(Array.from(EXECUTABLE).join(','))
    .forEach((n) => n.remove())
  tpl.content.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if (
        (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'srcset') &&
        isUnsafeUrl(attr.value)
      )
        el.removeAttribute(attr.name)
    }
  })
  return tpl.innerHTML
}

// Paste allow-list: structural formatting only.
const KEEP_INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'A'])
const BLOCK_BOUNDARY = new Set([
  'P',
  'DIV',
  'LI',
  'TR',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'BLOCKQUOTE',
  'PRE',
  'SECTION',
  'ARTICLE',
])

function serializeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent || '')
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const el = node as HTMLElement
  const tag = el.tagName
  if (EXECUTABLE.has(tag)) return ''
  const inner = Array.from(el.childNodes).map(serializeNode).join('')
  if (tag === 'BR') return '<br>'
  if (KEEP_INLINE.has(tag)) {
    if (tag === 'A') {
      const href = el.getAttribute('href') || ''
      const safe =
        /^(https?:|mailto:)/i.test(href) && !isUnsafeUrl(href)
          ? href.replace(/"/g, '&quot;')
          : ''
      return safe ? `<a href="${safe}">${inner}</a>` : inner
    }
    const t =
      tag === 'STRONG' ? 'b' : tag === 'EM' ? 'i' : tag === 'STRIKE' || tag === 'DEL' ? 's' : tag.toLowerCase()
    return inner ? `<${t}>${inner}</${t}>` : ''
  }
  // Everything else (spans with styles, fonts, tables, images…) unwraps to its
  // children; block-level elements become line breaks so paragraphs survive.
  return BLOCK_BOUNDARY.has(tag) ? `${inner}<br>` : inner
}

/** Reduce clipboard HTML to bold/italic/underline/strike/safe links/breaks. */
export function sanitizePastedHtml(html: string): string {
  if (typeof document === 'undefined') return escapeText(html)
  const tpl = document.createElement('template')
  tpl.innerHTML = html
  const out = Array.from(tpl.content.childNodes).map(serializeNode).join('')
  // Collapse the trailing block boundary — it would otherwise add a blank line.
  return out.replace(/(<br>\s*)+$/i, '')
}

/** Plain-text clipboard → HTML with line breaks preserved. */
export function pastedTextToHtml(text: string): string {
  return escapeText(text).replace(/\r?\n/g, '<br>')
}
