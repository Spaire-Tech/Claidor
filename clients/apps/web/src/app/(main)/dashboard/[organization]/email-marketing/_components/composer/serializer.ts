// Block[] → email-ready HTML.
//
// Mirrors the styles applied in composer.css so the email a recipient sees
// looks like the in-editor preview. Styles are inlined since real mail
// clients ignore <style> blocks in most configurations.

import { sanitizeInlineHtml } from './sanitize'
import { CROP_AR, type Block } from './types'

const escapeAttr = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

const wrap = (tag: string, css: string, inner: string, extra = '') =>
  `<${tag} style="${css}"${extra}>${inner}</${tag}>`

const STYLES = {
  body: 'margin:0;padding:0;background:#ffffff;color:#242629;font-family:"Schibsted Grotesk",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%;',
  container: 'max-width:640px;margin:0 auto;padding:40px 24px;',
  text: 'font-size:19px;line-height:1.62;color:#242629;margin:0 0 14px;',
  h1: 'font-size:34px;font-weight:800;line-height:1.15;color:#0c0d10;letter-spacing:-0.02em;margin:24px 0 8px;',
  h2: 'font-size:28px;font-weight:700;line-height:1.25;color:#0c0d10;letter-spacing:-0.015em;margin:22px 0 8px;',
  h3: 'font-size:22px;font-weight:700;line-height:1.3;color:#0c0d10;letter-spacing:-0.01em;margin:18px 0 6px;',
  quote: 'font-size:22px;line-height:1.5;color:#0c0d10;font-weight:500;border-left:3px solid #0c0d10;padding:8px 0 8px 22px;margin:14px 0;',
  // Email clients are aggressive about resetting list styles. Set
  // list-style-type explicitly so bullets/numbers actually render.
  ul: 'margin:0 0 14px;padding:0 0 0 26px;list-style-type:disc;list-style-position:outside;',
  ol: 'margin:0 0 14px;padding:0 0 0 26px;list-style-type:decimal;list-style-position:outside;',
  li: 'font-size:19px;line-height:1.6;color:#242629;padding:3px 0 3px 4px;display:list-item;',
  divider: 'border:none;border-top:1px solid #d8dadd;margin:24px 0;',
  buttonWrap: (align: 'left' | 'center' | 'right') =>
    `text-align:${align};margin:18px 0;`,
  button:
    'display:inline-block;background:#0c0d10;color:#ffffff;font-weight:600;font-size:16px;padding:15px 30px;border-radius:999px;text-decoration:none;',
  imgWrap: (align: 'left' | 'center' | 'full') => {
    if (align === 'center') return 'text-align:center;margin:14px 0;'
    if (align === 'full') return 'text-align:left;margin:14px 0;'
    return 'text-align:left;margin:14px 0;'
  },
  imgWidthPct: (align: 'left' | 'center' | 'full') =>
    align === 'full' ? 100 : align === 'center' ? 78 : 58,
  caption: 'text-align:center;font-size:14px;color:#6b6f76;padding-top:8px;',
}

function renderBlock(b: Block): string {
  switch (b.type) {
    // Text/heading/quote bodies and list items carry user inline HTML. The
    // editor already emits clean marks; sanitize again here so no foreign
    // font-size/family (legacy drafts, odd paste paths) can reach the email.
    case 'text':
      return wrap('p', `${STYLES.text}text-align:${b.talign || 'left'};`, sanitizeInlineHtml(b.html) || '&nbsp;')
    case 'h1':
      return wrap('h1', `${STYLES.h1}text-align:${b.talign || 'left'};`, sanitizeInlineHtml(b.html))
    case 'h2':
      return wrap('h2', `${STYLES.h2}text-align:${b.talign || 'left'};`, sanitizeInlineHtml(b.html))
    case 'h3':
      return wrap('h3', `${STYLES.h3}text-align:${b.talign || 'left'};`, sanitizeInlineHtml(b.html))
    case 'quote':
      return wrap('blockquote', `${STYLES.quote}text-align:${b.talign || 'left'};`, sanitizeInlineHtml(b.html))
    case 'bullet':
      return wrap(
        'ul',
        STYLES.ul,
        b.items.map((it) => wrap('li', STYLES.li, sanitizeInlineHtml(it) || '&nbsp;')).join(''),
      )
    case 'numbered':
      return wrap(
        'ol',
        STYLES.ol,
        b.items.map((it) => wrap('li', STYLES.li, sanitizeInlineHtml(it) || '&nbsp;')).join(''),
      )
    case 'divider':
      return `<hr style="${STYLES.divider}" />`
    case 'button': {
      const wrapCss = STYLES.buttonWrap(b.align)
      const bg = b.bg || '#000000'
      const color = b.color || '#ffffff'
      const btnStyle = `display:inline-block;background:${escapeAttr(bg)};color:${escapeAttr(color)};font-weight:600;font-size:16px;padding:15px 30px;border-radius:999px;text-decoration:none;`
      const inner = b.link
        ? `<a href="${escapeAttr(b.link)}" style="${btnStyle}">${b.text || 'Open link'}</a>`
        : `<span style="${btnStyle}">${b.text || 'View the doc'}</span>`
      return `<div style="${wrapCss}">${inner}</div>`
    }
    case 'file': {
      const meta = `${escapeAttr(b.name)} · ${escapeAttr(b.size)}`
      const cardStyle =
        'display:inline-block;margin:12px 0;padding:12px 16px;border:1px solid #d8dadd;border-radius:12px;background:#ffffff;font-size:14px;color:#0c0d10;'
      const url = b.url
        ? `<a href="${escapeAttr(b.url)}" style="color:#0c0d10;text-decoration:underline;">${meta}</a>`
        : meta
      return `<div style="${cardStyle}">${url}</div>`
    }
    case 'image': {
      if (!b.src) return ''
      const ar = CROP_AR[b.crop || 'orig']
      const widthPct = STYLES.imgWidthPct(b.align)
      const arCss = ar ? `aspect-ratio:${ar};object-fit:cover;` : ''
      const imgStyle = `display:block;border-radius:10px;${arCss}width:${widthPct}%;${b.align === 'center' ? 'margin:0 auto;' : ''}`
      const altAttr = ` alt="${escapeAttr(b.alt || '')}"`
      const imgTag = `<img src="${escapeAttr(b.src)}"${altAttr} style="${imgStyle}" />`
      const wrapped = b.link
        ? `<a href="${escapeAttr(b.link)}" style="text-decoration:none;">${imgTag}</a>`
        : imgTag
      const cap = b.caption ? wrap('div', STYLES.caption, b.caption) : ''
      return wrap('div', STYLES.imgWrap(b.align), wrapped + cap)
    }
  }
}

/**
 * Serialize a draft into the HTML to persist as EmailBroadcast.content_html.
 * The org/branding wrapper is applied separately by the React Email
 * MarketingEmailWrapper on the server.
 */
export function blocksToEmailHtml(blocks: Block[]): string {
  return wrap(
    'div',
    STYLES.container,
    blocks.map(renderBlock).join('\n'),
  )
}
