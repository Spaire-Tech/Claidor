/* ============================================================
   EMAIL RENDERER — turns the editor's blocks into bulletproof,
   inbox-safe HTML: table layout, inline styles, bgcolor attrs,
   fluid width + mobile media queries. The editor canvas renders
   with flex/gradient/absolute for a pretty browser preview; real
   inboxes (Gmail/Outlook/Apple Mail, mobile especially) strip all
   of that. This module reproduces the SAME design with techniques
   that actually survive an email client, so the inbox shows what
   the editor shows.
   ============================================================ */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { FONTS, hexA, type Props, type Theme } from './emailData'
import type { Block, BroadcastMeta } from './emailEngine'
import { scrubHtml } from './sanitizeHtml'

// Rich-HTML props are scrubbed (executable markup removed, formatting kept)
// before they ship in the sent email — previously this was an identity
// function and pasted/stored markup went out verbatim.
const esc = (s: any): string => scrubHtml(s)
const escAttr = (s: any): string =>
  String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;')
// Email clients (notably Gmail) don't support CSS custom properties, and an
// unsupported `var()` makes them drop the whole font-family. The editor's font
// stacks lead with `var(--font-x, 'X')` for the app; here we strip the var()
// down to its literal fallback so the email carries a plain, universally-parsed
// stack (e.g. `'Instrument Serif', Georgia, serif`).
const ff = (f: string): string =>
  (FONTS[f] || FONTS.Geist).replace(/var\(\s*--[^,]+,\s*([^)]+)\)/g, '$1')

// Side padding as a left/right pair (top/bottom handled per block via pt/pb).
const px = (p: Props): number => (p.px == null ? 44 : p.px)

type Resolver = (key: string) => string

/* A bulletproof rounded button: a table so padding + radius render in Outlook
   and the whole area is tappable. */
function emailButton(b: Props, t: Theme, align: string): string {
  if (!b) return ''
  const style = b.style || 'solid'
  const font = ff(b.font || t.font)
  const label = esc(b.text) + (b.arrow ? '&nbsp;&nbsp;→' : '')
  const href = b.href ? escAttr(b.href) : '#'
  const aAlign = b.align || align || 'left'
  // Align-aware margin: `margin:0` (the old value) actively DEFEATS the auto
  // margins CSS clients (Apple Mail, Gmail webmail) use to centre a shrink-to-fit
  // table, so a "centered" button rendered left-aligned. Center needs `0 auto`,
  // right needs `0 0 0 auto`.
  const m = aAlign === 'center' ? '0 auto' : aAlign === 'right' ? '0 0 0 auto' : '0'
  // Wrap the shrink-to-fit pill in a full-width cell that carries BOTH the align
  // attribute (Outlook's Word engine always honours cell align) and text-align
  // (a fallback for clients that drop the inner table's align). The inner pill
  // must stay width-less or it stretches full-width in Outlook.
  const wrap = (pill: string): string =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="${aAlign}" style="text-align:${aAlign}">${pill}</td></tr></table>`
  if (style === 'link') {
    return wrap(
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${aAlign}" style="margin:${m}"><tr><td><a href="${href}" target="_blank" style="font-family:${font};font-size:${b.size || 14}px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:${b.color || t.link};text-decoration:none;border-bottom:1px solid ${b.color || t.link};padding-bottom:3px">${label}</a></td></tr></table>`,
    )
  }
  const radius = b.radius == null ? 999 : b.radius
  const bg = style === 'outline' ? 'transparent' : b.bg || t.button
  const color = b.color || (style === 'outline' ? t.heading : t.buttonText)
  const border = style === 'outline' ? `border:1px solid ${b.border || t.border};` : ''
  return wrap(
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${aAlign}" style="margin:${m}"><tr><td bgcolor="${style === 'outline' ? '' : bg}" style="border-radius:${radius}px;background:${bg};${border}">
    <a href="${href}" target="_blank" style="display:inline-block;font-family:${font};font-size:${b.size || 14.5}px;font-weight:600;letter-spacing:.005em;color:${color};text-decoration:none;padding:15px 30px;border-radius:${radius}px">${label}</a>
  </td></tr></table>`,
  )
}

/* Wrap a block's inner HTML in a full-width row + padded cell. Every cell carries
   its OWN opaque dark bgcolor (defaulting to the email background) — never a
   transparent cell that relies on the inner table painting through it. A
   transparent cell is exactly what a mobile client's dark-mode remap repaints
   toward white, which is the "email turns white on the phone" bug. The `em-bg`
   class lets the dark colour be re-pinned for Outlook.com's dark engine. */
function section(inner: string, p: Props, t: Theme, extra = ''): string {
  const bg = p.bg && p.bg !== 'none' ? p.bg : t.emailBg
  const pad = `padding:${p.pt || 0}px ${px(p)}px ${p.pb || 0}px`
  // A flat linear-gradient is a *background image*. Gmail's mobile dark mode
  // recolours plain-colour cells (turning the dark sections white) but leaves
  // image-backed cells alone — which is why the photo hero survived and these
  // didn't. Painting the same dark colour as a gradient makes the cell read as
  // image-backed, so the dark sticks. bgcolor stays as the universal fallback.
  return `<tr><td class="em-bg em-px" bgcolor="${bg}" style="${pad};background-color:${bg};background-image:linear-gradient(${bg},${bg});${extra}">${inner}</td></tr>`
}

const BLOCK: Record<string, (p: Props, t: Theme, r: Resolver) => string> = {
  coverHero(p, t, r) {
    const img = p.img ? r(p.img) : ''
    const mw = (a: string) =>
      a === 'center' ? 'margin:0 auto;' : a === 'right' ? 'margin-left:auto;margin-right:0;' : ''
    const eyebrow = p.eyebrow
      ? `<p style="margin:0 0 28px;text-align:${p.eyebrowAlign};font-family:${ff(p.eyebrowFont)};font-size:${p.eyebrowSize}px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:${p.eyebrowColor}">${esc(p.eyebrow)}</p>`
      : ''
    // Push the title block toward the bottom of the hero (mirrors the editor's
    // flex space-between) with a vertical spacer sized off the hero height.
    const spacer = Math.max(0, (p.height || 560) - 300)
    let body = `<h1 class="em-hero-h1" style="margin:0;text-align:${p.titleAlign};font-family:${ff(p.titleFont)};font-size:${p.titleSize}px;font-weight:${p.titleFont === 'Geist' ? 700 : 400};line-height:1.02;letter-spacing:${p.titleFont === 'Geist' ? '-2px' : '-.5px'};color:${p.titleColor};${p.titleFont === 'Geist' ? 'text-transform:uppercase;' : ''}">${esc(p.title)}</h1>`
    if (p.instructor)
      body += `<p style="margin:18px 0 0;text-align:${p.instructorAlign};font-family:${ff(p.instructorFont)};font-size:${p.instructorSize}px;font-weight:500;color:${p.instructorColor}">${esc(p.instructor)}</p>`
    if (p.tagline)
      body += `<p style="margin:14px 0 0;max-width:400px;${mw(p.taglineAlign)}text-align:${p.taglineAlign};font-family:${ff(p.taglineFont)};font-size:${p.taglineSize}px;line-height:1.5;color:${p.taglineColor}">${esc(p.tagline)}</p>`
    if (p.showBtn !== false && p.btn)
      body += `<div style="margin-top:32px;text-align:${(p.btn && p.btn.align) || p.titleAlign}">${emailButton(p.btn, t, p.titleAlign)}</div>`
    // Bulletproof hero background: the cover photo + the SAME dark gradient the
    // editor draws, reproduced so it survives real inboxes. Modern clients
    // (Apple Mail, iOS, Gmail) get `background-image: <gradient>, url(photo)`;
    // Outlook (Word engine, which ignores all of that) gets a VML <v:rect> with
    // the photo as a frame fill; everything falls back to the dark bgcolor. This
    // is what makes the sent hero look like the editor instead of a flat block.
    const oc = p.overlayColor || '#0c0a08'
    const ov = p.overlay == null ? 58 : p.overlay
    const grad = `linear-gradient(180deg, ${hexA(oc, ov / 240)} 0%, ${hexA(oc, Math.min(0.92, ov / 95))} 100%)`
    const darkBg = img ? oc : p.overlayColor || '#26211c'
    const heroH = p.height || 560
    const bgStyle = img
      ? `background-color:${darkBg};background-image:${grad}, url('${escAttr(img)}');background-position:center center, center center;background-size:cover, cover;background-repeat:no-repeat, no-repeat;`
      : `background-color:${darkBg};background-image:${grad};background-position:center center;background-size:cover;background-repeat:no-repeat;`
    const content = `<div class="em-hero-pad" style="padding:34px 44px 52px">${eyebrow}<div style="line-height:0;font-size:0;height:${spacer}px">&nbsp;</div>${body}</div>`
    return `<tr><td ${img ? `background="${escAttr(img)}"` : ''} bgcolor="${darkBg}" valign="top" style="${bgStyle}padding:0">
      <!--[if gte mso 9]>
      <v:rect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" fill="true" stroke="false" style="width:640px;height:${heroH}px;">
      <v:fill type="frame" ${img ? `src="${escAttr(img)}"` : ''} color="${darkBg}" />
      <v:textbox inset="0,0,0,0">
      <![endif]-->
      ${content}
      <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
    </td></tr>`
  },

  note(p, t) {
    let h = ''
    if (p.eyebrow)
      h += `<p style="margin:0 0 18px;text-align:${p.headingAlign};font-family:${ff(t.font)};font-size:11px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:${p.eyebrowColor}">${esc(p.eyebrow)}</p>`
    h += `<h2 style="margin:0 0 26px;text-align:${p.headingAlign};font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.1;letter-spacing:-.3px;color:${p.hColor}">${esc(p.heading)}</h2>`
    ;(p.body || []).forEach((para: string, i: number) => {
      h += `<p style="margin:${i ? 16 : 0}px 0 0;text-align:${p.bodyAlign};font-family:${ff(p.bodyFont)};font-size:${p.bodySize}px;line-height:1.65;color:${p.bodyColor}">${esc(para)}</p>`
    })
    if (p.sign)
      h += `<div style="margin-top:30px;text-align:${p.signAlign}"><p style="margin:0;font-family:${ff(p.signFont)};font-size:${p.signSize}px;${p.signFont === 'Geist' ? '' : 'font-style:italic;'}color:${p.hColor}">${esc(p.sign)}</p><p style="margin:4px 0 0;font-family:${ff(t.font)};font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${p.signColor}">${esc(p.signRole)}</p></div>`
    return section(h, p, t)
  },

  meta(p, t) {
    const align = p.align === 'center' ? 'center' : p.align === 'right' ? 'right' : 'left'
    const cells = (p.items || [])
      .map(
        (it: Props, i: number) =>
          `${i ? `<span style="color:${p.divider};padding:0 14px">·</span>` : ''}<span style="font-family:${ff(p.valFont)};font-size:${p.valSize}px;font-weight:500;color:${p.valColor}">${esc(it.v)}</span>`,
      )
      .join('')
    const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${p.divider};border-bottom:1px solid ${p.divider}"><tr><td align="${align}" style="padding:16px 0">${cells}</td></tr></table>`
    return section(inner, p, t)
  },

  lessons(p, t) {
    let h = `<h2 style="margin:0 0 ${p.intro ? 14 : 30}px;text-align:${p.hAlign};font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.1;letter-spacing:-.3px;color:${p.hColor}">${esc(p.heading)}</h2>`
    if (p.intro)
      h += `<p style="margin:0 0 30px;font-family:${ff(t.font)};font-size:15px;line-height:1.6;color:${p.introColor}">${esc(p.intro)}</p>`
    const rows = (p.items || [])
      .map(
        (it: Props, i: number) => `<tr>
        <td width="34" valign="top" style="padding:20px 0;border-top:1px solid ${p.divider};font-family:${ff(p.listFont)};font-size:13px;font-weight:500;color:${p.numColor}">${String(i + 1).padStart(2, '0')}</td>
        <td valign="top" style="padding:20px 0;border-top:1px solid ${p.divider};font-family:${ff(p.listFont)};font-size:${p.titleSize}px;font-weight:500;letter-spacing:-.1px;color:${p.titleColor}">${esc(it.title)}</td>
        <td align="right" valign="top" style="padding:20px 0;border-top:1px solid ${p.divider};font-family:${ff(p.listFont)};font-size:13px;color:${p.metaColor};white-space:nowrap">${esc(it.meta)}</td>
      </tr>`,
      )
      .join('')
    const table = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-bottom:1px solid ${p.divider}">${rows}</table>`
    return section(h + table, p, t)
  },

  progress(p, t) {
    const total = Math.max(1, p.total || 1)
    const pct = Math.max(0, Math.min(100, Math.round(((p.value || 0) / total) * 100)))
    const head = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td align="left" style="font-family:${ff(p.labelFont)};font-size:${p.labelSize}px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${p.labelColor}">${esc(p.label)}</td>
      <td align="right" style="font-family:${ff(p.font)};font-size:12.5px;font-weight:500;color:${p.countColor}">${p.value} of ${total} &nbsp;·&nbsp; ${pct}%</td>
    </tr></table>`
    const bar = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:13px"><tr><td bgcolor="${p.track}" style="background:${p.track};border-radius:999px;font-size:0;line-height:0">
      <table role="presentation" width="${pct}%" cellpadding="0" cellspacing="0" border="0"><tr><td height="4" bgcolor="${p.fill}" style="background:${p.fill};border-radius:999px;height:4px;font-size:0;line-height:0">&nbsp;</td></tr></table>
    </td></tr></table>`
    return section(head + bar, p, t)
  },

  trailer(p, t, r) {
    const img = p.img ? r(p.img) : ''
    const href = p.href ? escAttr(p.href) : ''
    const w = 640 - px(p) * 2
    const h = Math.round(w * 0.5625) // 16:9, mirrors the editor's poster
    const radius = p.radius == null ? 14 : p.radius
    // A round play button centred over the poster — matches the editor. Built as
    // a cell with the poster as background (+ VML for Outlook) and the button
    // centred inside, so it survives clients that strip absolute positioning.
    const playBtn = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto"><tr><td height="60" width="60" align="center" valign="middle" bgcolor="#ffffff" style="width:60px;height:60px;background:#ffffff;border-radius:50%;font-family:Arial,sans-serif;font-size:22px;line-height:60px;color:#1a1a1a;text-align:center">&#9658;</td></tr></table>`
    const poster = img
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td background="${escAttr(img)}" bgcolor="#26211c" height="${h}" align="center" valign="middle" style="background-image:url('${escAttr(img)}');background-size:cover;background-position:center center;background-repeat:no-repeat;height:${h}px;border-radius:${radius}px">
            <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${w}px;height:${h}px;"><v:fill type="frame" src="${escAttr(img)}" color="#26211c" /><v:textbox inset="0,0,0,0"><![endif]-->
            ${playBtn}
            <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
          </td></tr></table>`
      : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${h}" align="center" valign="middle" bgcolor="#26211c" style="height:${h}px;border-radius:${radius}px">${playBtn}</td></tr></table>`
    const linked = href ? `<a href="${href}" target="_blank" style="text-decoration:none">${poster}</a>` : poster
    const caption = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px"><tr>
      <td align="left" style="font-family:${ff(p.labelFont)};font-size:${p.labelSize}px;font-weight:600;color:${p.labelColor}">${esc(p.label)}</td>
      <td align="right" style="font-family:${ff(t.font)};font-size:13px;color:${p.subColor}">${esc(p.sub)}</td>
    </tr></table>`
    return section(linked + caption, p, t)
  },

  instructor(p, t, r) {
    const img = p.img ? r(p.img) : ''
    // Fixed 132×160 crop with object-fit:cover, matching the editor's portrait
    // box (NOT background-image — Gmail strips that and the face would vanish).
    const portrait = img
      ? `<img src="${escAttr(img)}" width="132" height="160" alt="${escAttr(p.name)}" style="display:block;width:132px;height:160px;max-width:100%;object-fit:cover;border-radius:${p.imgRadius}px;border:0"/>`
      : `<table role="presentation" width="132" cellpadding="0" cellspacing="0" border="0"><tr><td height="160" bgcolor="#26211c" style="border-radius:${p.imgRadius}px"></td></tr></table>`
    const txt = `<p style="margin:0 0 10px;font-family:${ff(t.font)};font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${p.roleColor}">${esc(p.role)}</p>
      <p style="margin:0;font-family:${ff(p.nameFont)};font-size:${p.nameSize}px;font-weight:${p.nameFont === 'Geist' ? 600 : 400};letter-spacing:-.4px;line-height:1.05;color:${p.nameColor}">${esc(p.name)}</p>
      <p style="margin:16px 0 0;text-align:${p.bioAlign || p.nameAlign};font-family:${ff(p.bioFont)};font-size:${p.bioSize}px;line-height:1.6;color:${p.bioColor}">${esc(p.bio)}</p>`
    // Explicit 132 / 26-gap / auto columns reproduce the editor's
    // portrait(132) + gap(26) + text(flex:1) geometry exactly.
    const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${p.divider}"><tr><td style="padding-top:36px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td class="em-ins-img" width="132" valign="top" style="width:132px">${portrait}</td>
        <td class="em-ins-gap" width="26" style="width:26px;font-size:0;line-height:0">&nbsp;</td>
        <td class="em-ins-txt" valign="top" style="text-align:${p.nameAlign}">${txt}</td>
      </tr></table>
    </td></tr></table>`
    return section(inner, p, t)
  },

  image(p, t, r) {
    const src = p.src ? r(p.src) : ''
    const inner = src
      ? `<img src="${escAttr(src)}" alt="${escAttr(p.alt)}" width="${p.maxw}" style="display:block;${p.align === 'center' ? 'margin:0 auto;' : p.align === 'right' ? 'margin-left:auto;' : ''}width:100%;max-width:${p.maxw}px;height:auto;border-radius:${p.radius}px;border:0"/>`
      : ''
    const linked = p.href ? `<a href="${escAttr(p.href)}" target="_blank">${inner}</a>` : inner
    return section(`<div style="text-align:${p.align}">${linked}</div>`, p, t)
  },

  heading(p, t) {
    const inner = `<h2 style="margin:0;font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hWeight};color:${p.hColor};letter-spacing:${p.hLs}px;line-height:${p.hLh};text-transform:${p.hTransform};text-align:${p.align}">${esc(p.text)}</h2>`
    return section(inner, p, t)
  },

  text(p, t) {
    const mw = p.maxw
      ? `max-width:${p.maxw}px;${p.align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}`
      : ''
    const inner = `<p style="margin:0;font-family:${ff(p.font)};font-size:${p.size}px;line-height:${p.lh};color:${p.color};text-align:${p.align};${mw}">${esc(p.text)}</p>`
    return section(inner, p, t)
  },

  button(p, t) {
    const inner = emailButton(p, t, p.align)
    const bg = p.blockBg && p.blockBg !== 'none' ? p.blockBg : ''
    return section(inner, { ...p, bg }, t)
  },

  cta(p, t) {
    let inner = `<p style="margin:0 0 14px;font-family:${ff(p.hFont)};font-size:${p.hSize}px;font-weight:${p.hFont === 'Geist' ? 600 : 400};line-height:1.15;letter-spacing:-.3px;color:${p.hColor};text-align:${p.hAlign}">${esc(p.heading)}</p>`
    if (p.body)
      inner += `<p style="margin:0 0 30px;font-family:${ff(p.bodyFont)};font-size:${p.bodySize}px;line-height:1.55;color:${p.bodyColor};text-align:${p.bAlign}">${esc(p.body)}</p>`
    if (p.btn && p.showBtn !== false) inner += emailButton(p.btn, t, p.align)
    const wrap = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${p.divider}"><tr><td align="${p.align}" style="padding-top:56px;text-align:${p.align}">${inner}</td></tr></table>`
    return section(wrap, { ...p, bg: 'none' }, t)
  },

  quote(p, t) {
    const inner = `<p style="margin:0;text-align:${p.align};font-family:${ff(p.font)};font-size:${p.size}px;line-height:1.3;letter-spacing:-.4px;${p.font !== 'Geist' ? 'font-style:italic;' : ''}color:${p.color};max-width:460px;${p.align === 'center' ? 'margin-left:auto;margin-right:auto;' : ''}">${esc(p.text)}</p>
      <p style="margin:18px 0 0;text-align:${p.byAlign};font-family:${ff(p.byFont)};font-size:${p.bySize}px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:${p.byColor}">${esc(p.by)}</p>`
    return section(inner, p, t)
  },

  divider(p, t) {
    const inner = `<table role="presentation" width="${p.width}%" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td style="border-top:${p.thick}px ${p.style} ${p.color};font-size:0;line-height:0">&nbsp;</td></tr></table>`
    return section(inner, p, t)
  },

  spacer(p, t) {
    const bg = p.bg && p.bg !== 'none' ? p.bg : t.emailBg
    return `<tr><td class="em-bg" height="${p.h}" bgcolor="${bg}" style="height:${p.h}px;background-color:${bg};background-image:linear-gradient(${bg},${bg});font-size:0;line-height:0">&nbsp;</td></tr>`
  },

  footer(p, t) {
    // Empty slots are omitted rather than shipped as blank paragraphs — in
    // particular the postal address, which has no default any more (a
    // fabricated default address in real sends was a CAN-SPAM liability).
    const linksLine = esc(p.links)
      ? `<p style="margin:0 0 24px;text-align:${p.linksAlign};font-family:${ff(p.linksFont)};font-size:${p.linksSize}px;font-weight:500;color:${p.linksColor}">${esc(p.links)}</p>`
      : ''
    const addressLine = esc(p.address)
      ? `<p style="margin:0 0 14px;font-family:${ff(p.fpFont)};font-size:11px;line-height:1.5;color:${p.addressColor}">${esc(p.address)}</p>`
      : ''
    const inner = `${linksLine}
      <div style="text-align:${p.fpAlign}">
        <p style="margin:0 ${p.fpAlign === 'center' ? 'auto' : '0'} 8px;max-width:340px;font-family:${ff(p.fpFont)};font-size:${p.fpSize}px;line-height:1.6;color:${p.taglineColor}">${esc(p.tagline)}</p>
        ${addressLine}
        <p style="margin:0;font-family:${ff(p.fpFont)};font-size:11px;color:${p.unsubColor}"><a href="{{unsubscribe_url}}" style="color:${p.unsubColor};text-decoration:underline">${esc(p.unsub)}</a></p>
      </div>`
    const border = p.borderTop ? `border-top:1px solid ${p.borderColor};` : ''
    return section(inner, p, t, border)
  },
}

export function buildEmailHTML(
  blocks: Block[],
  theme: Theme,
  broadcast: BroadcastMeta,
  resolveAsset: Resolver = (k) => k,
): string {
  // Defend against a saved email whose email/backdrop background is 'none'
  // (older saves, before the picker disallowed it): a transparent page
  // background renders as bgcolor="none" / white-broken in the inbox. Coerce
  // to a real colour so the sent email always has a solid page.
  const t: Theme = {
    ...theme,
    emailBg: theme.emailBg && theme.emailBg !== 'none' ? theme.emailBg : '#ffffff',
    outerBg: theme.outerBg && theme.outerBg !== 'none' ? theme.outerBg : '#ffffff',
  }
  const body = blocks
    .map((b) => (BLOCK[b.type] ? BLOCK[b.type](b.props, t, resolveAsset) : ''))
    .join('\n')
    // Links typed via the format bubble arrive as bare <a> tags inside rich
    // text; the document-level a{text-decoration:none} reset would render
    // them indistinguishable from plain text in the inbox (the editor shows
    // the browser's default link styling, so what you saw was NOT what they
    // got). Give any style-less anchor the theme's link colour + underline;
    // anchors the renderers author (buttons, unsubscribe) carry their own
    // style attribute and are untouched.
    .replace(
      /<a (?![^>]*style=)/gi,
      `<a style="color:${t.link};text-decoration:underline;text-underline-offset:2px" `,
    )
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>${escAttr(broadcast.subject)}</title>
<!-- Web fonts for clients that honour them (Apple Mail, iOS) so the email shows
     the real Instrument Serif / Geist; Gmail & Outlook ignore these and fall
     back to Georgia/system per the inline font stacks. -->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet"/>
<!--<![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap');
  /* The email is ONE fixed design with explicit colours on every element, and
     must look identical no matter the recipient's system dark/light setting.
     Declaring "light dark" previously told clients the email supported a dark
     scheme, so in dark mode Apple Mail / iOS picked "dark" and — since we ship
     no dark-specific styles — applied its OWN colour adaptation, recolouring
     the design (the "it changes with the phone's mode" bug, mobile only).
     "color-scheme: only light" opts out of that adaptation entirely: the UA
     renders our authored colours as-is in every system mode. It does NOT
     lighten a dark design — it only stops the client from re-tinting it.
     (Gmail's app applies its own transform and ignores this; nothing in the
     HTML can fully opt out of Gmail dark mode.) */
  :root,html,body{color-scheme:only light}
  html,body{margin:0!important;padding:0!important;width:100%!important}
  *{-ms-text-size-adjust:100%;-webkit-text-size-adjust:100%}
  table{border-collapse:collapse!important;mso-table-lspace:0;mso-table-rspace:0}
  img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic}
  a{text-decoration:none}
  @media only screen and (max-width:620px){
    .em-outer{padding-left:8px!important;padding-right:8px!important}
    .em-px{padding-left:26px!important;padding-right:26px!important}
    .em-hero-pad{padding-left:26px!important;padding-right:26px!important;padding-bottom:40px!important}
    .em-hero-h1{font-size:42px!important;letter-spacing:-1px!important}
    .em-ins-img{display:block!important;width:132px!important;padding-bottom:18px!important}
    .em-ins-gap{display:none!important}
    .em-ins-txt{display:block!important;width:100%!important}
  }
</style>
</head>
<body class="em-body" style="margin:0;padding:0;background-color:${t.outerBg};background-image:linear-gradient(${t.outerBg},${t.outerBg})">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escAttr(broadcast.preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.outerBg}" style="background-color:${t.outerBg};background-image:linear-gradient(${t.outerBg},${t.outerBg})">
  <tr><td class="em-outer" align="center" style="padding:24px 12px">
    <!--[if mso]>
    <table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="640">
    <![endif]-->
    <table role="presentation" class="em-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${t.emailBg}" style="width:100%;max-width:640px;background-color:${t.emailBg};background-image:linear-gradient(${t.emailBg},${t.emailBg});border-radius:12px;overflow:hidden">
      ${body}
    </table>
    <!--[if mso]>
    </td></tr></table>
    <![endif]-->
  </td></tr>
</table>
</body>
</html>`
}
