'use client'

// Brick 14 — Course data-bound blocks.
//
// ONE custom EmailNode (`courseBlock`) with a `variant` and a `data` snapshot
// of the bound course. Eight variants cover the design's Course group:
// cover / welcome / facts / curriculum / progress / trailer / instructor / cta.
//
//   • renderHTML drives the EDITOR preview. Colours come from the --em-* theme
//     variables (set by brick 12) so the blocks adapt to the active theme.
//   • renderToReactEmail drives the EMAIL output, with concrete light colours.
//   • The block carries no hand-entered copy — it AUTO-FILLS from `data`, which
//     BroadcastEditorV3 keeps live-synced to the current course.

import { EmailNode } from '@react-email/editor/core'
import { createElement, type ReactNode } from 'react'

import { SAMPLE_COURSE, type CourseData } from './courseData'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Node = EmailNode as any

export const COURSE_VARIANTS = [
  'cover',
  'welcome',
  'facts',
  'curriculum',
  'progress',
  'trailer',
  'instructor',
  'cta',
] as const
export type CourseVariant = (typeof COURSE_VARIANTS)[number]

const pct = (c: CourseData) =>
  Math.max(0, Math.min(100, Math.round((c.progress.completed / Math.max(1, c.progress.total)) * 100)))

const heroBg = (img: string | null) =>
  img
    ? `#000 url('${img}') center/cover no-repeat`
    : 'linear-gradient(135deg,#3a2e26,#1a1410)'

// ── EDITOR render (ProseMirror DOM spec; --em-* themed colours) ────────────
const H = 'var(--em-heading,#1d1d1f)'
const T = 'var(--em-text,#43454b)'
const M = 'var(--em-muted,#86868b)'
const BD = 'var(--em-border,rgba(0,0,0,.09))'
const BTN = 'var(--em-button,#141518)'
const BTNT = 'var(--em-button-text,#ffffff)'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Spec = any

function editorSpec(variant: CourseVariant, c: CourseData): Spec {
  const wrap = (style: string, ...kids: Spec[]): Spec => [
    'div',
    { class: 'eb-course eb-' + variant, 'data-course': variant, style },
    ...kids,
  ]
  switch (variant) {
    case 'cover':
      return [
        'div',
        {
          class: 'eb-course eb-cover',
          'data-course': 'cover',
          style: `position:relative;min-height:380px;background:${heroBg(c.heroImage)};overflow:hidden`,
        },
        ['div', { style: 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,10,8,.15) 0%,rgba(0,0,0,0) 42%,rgba(12,10,8,.86) 100%)' }],
        [
          'div',
          { style: 'position:relative;min-height:380px;display:flex;flex-direction:column;justify-content:space-between;padding:34px 44px 48px' },
          ['span', { style: 'font-size:11px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:#fff;opacity:.85' }, c.eyebrow],
          [
            'div',
            {},
            ['h1', { style: 'margin:0;font-size:52px;font-weight:700;line-height:1;letter-spacing:-1.5px;color:#fff' }, c.title],
            ['p', { style: 'margin:16px 0 0;font-size:14.5px;font-weight:500;color:#fff;opacity:.8' }, 'with ' + c.instructor.name],
            ['p', { style: 'margin:12px 0 0;max-width:400px;font-size:15px;line-height:1.5;color:#fff;opacity:.72' }, c.tagline],
            ['div', { style: 'margin-top:28px' }, ['a', { href: c.ctaHref, style: 'display:inline-block;text-decoration:none;background:#fff;color:#141518;border-radius:999px;padding:13px 24px;font-size:15px;font-weight:600' }, c.ctaText]],
          ],
        ],
      ]
    case 'welcome':
      return wrap(
        'padding:56px 44px',
        ['h2', { style: `margin:0 0 24px;font-size:34px;font-weight:700;line-height:1.1;letter-spacing:-.5px;color:${H}` }, c.welcomeHeading || 'Welcome — you’re in.'],
        ...c.welcome.map((p, i) => ['p', { style: `margin:${i ? 14 : 0}px 0 0;font-size:17px;line-height:1.65;color:${T}` }, p]),
        [
          'div',
          { style: 'margin-top:28px' },
          ['p', { style: `margin:0;font-size:22px;font-style:italic;color:${H}` }, c.instructor.name],
          ['p', { style: `margin:4px 0 0;font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${M}` }, c.instructor.role],
        ],
      )
    case 'facts': {
      const cells: Spec[] = []
      const parts = [`${c.lessons.length} lessons`, c.totalDuration, c.level]
      parts.forEach((v, i) => {
        if (i) cells.push(['span', { style: `color:${M};opacity:.7` }, '·'])
        cells.push(['span', { style: `font-size:13px;font-weight:500;letter-spacing:.02em;color:${H}` }, v])
      })
      return wrap('padding:8px 44px', [
        'div',
        { style: `display:flex;gap:14px;align-items:center;border-top:1px solid ${BD};border-bottom:1px solid ${BD};padding:16px 0` },
        ...cells,
      ])
    }
    case 'curriculum':
      return wrap(
        'padding:48px 44px',
        ['h2', { style: `margin:0 0 28px;font-size:30px;font-weight:700;line-height:1.1;color:${H}` }, 'What you’ll learn'],
        [
          'div',
          { style: `border-bottom:1px solid ${BD}` },
          ...c.lessons.map((it, i) => [
            'div',
            { style: `display:flex;align-items:baseline;gap:20px;padding:18px 0;border-top:1px solid ${BD}` },
            ['span', { style: `flex:none;width:22px;font-size:13px;font-weight:500;color:${M};font-variant-numeric:tabular-nums` }, String(i + 1).padStart(2, '0')],
            ['span', { style: `flex:1;min-width:0;font-size:16px;font-weight:500;letter-spacing:-.1px;color:${H}` }, it.title],
            ['span', { style: `flex:none;font-size:13px;color:${M};font-variant-numeric:tabular-nums` }, it.duration],
          ]),
        ],
      )
    case 'progress': {
      const p = pct(c)
      return wrap(
        'padding:36px 44px',
        [
          'div',
          { style: 'display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:13px' },
          ['span', { style: `font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${M}` }, 'Your progress'],
          ['span', { style: `font-size:12.5px;font-weight:500;color:${H};font-variant-numeric:tabular-nums` }, `${c.progress.completed} of ${c.progress.total} · ${p}%`],
        ],
        ['div', { style: `height:4px;border-radius:999px;background:${BD};overflow:hidden` }, ['div', { style: `height:100%;width:${p}%;background:${H};border-radius:999px` }]],
      )
    }
    case 'trailer': {
      const img = c.trailerImage || c.heroImage
      return wrap('padding:24px 44px', [
        'div',
        {},
        [
          'div',
          { style: `position:relative;border-radius:4px;overflow:hidden;background:${heroBg(img)};aspect-ratio:16/9` },
          ['div', { style: 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.05),rgba(0,0,0,.3))' }],
          ['div', { style: 'position:absolute;inset:0;margin:auto;width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px' }, '▶'],
        ],
        [
          'div',
          { style: 'margin-top:14px;display:flex;align-items:baseline;justify-content:space-between' },
          ['span', { style: `font-size:14px;font-weight:600;color:${H}` }, 'Watch the trailer'],
          ['span', { style: `font-size:13px;color:${M}` }, '2 min'],
        ],
      ])
    }
    case 'instructor': {
      const portrait = c.instructor.avatar
        ? ['img', { src: c.instructor.avatar, alt: c.instructor.name, style: 'width:120px;height:150px;object-fit:cover;border-radius:4px;display:block' }]
        : ['div', { style: `width:120px;height:150px;border-radius:4px;background:${BD};flex:none` }]
      return wrap('padding:48px 44px', [
        'div',
        { style: `border-top:1px solid ${BD};padding-top:32px` },
        [
          'div',
          { style: 'display:flex;gap:24px;align-items:flex-start' },
          ['div', { style: 'flex:none' }, portrait],
          [
            'div',
            { style: 'flex:1;min-width:0' },
            ['p', { style: `margin:0 0 8px;font-size:11px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:${M}` }, c.instructor.role],
            ['p', { style: `margin:0;font-size:28px;font-weight:600;letter-spacing:-.4px;line-height:1.05;color:${H}` }, c.instructor.name],
            ['p', { style: `margin:14px 0 0;font-size:15px;line-height:1.6;color:${T}` }, c.instructor.bio],
          ],
        ],
      ])
    }
    case 'cta':
      return wrap(
        'padding:44px;text-align:center',
        ['h2', { style: `margin:0 0 18px;font-size:26px;font-weight:700;line-height:1.15;color:${H}` }, 'Ready to begin?'],
        ['a', { href: c.ctaHref, style: `display:inline-block;text-decoration:none;background:${BTN};color:${BTNT};border-radius:999px;padding:14px 28px;font-size:15px;font-weight:600` }, c.ctaText],
      )
  }
}

// ── EMAIL render (concrete light colours; inbox-correct) ───────────────────
const eH = '#1d1d1f'
const eT = '#43454b'
const eM = '#86868b'
const eBD = '#e6e6e6'

const div = (style: React.CSSProperties, ...kids: ReactNode[]) =>
  createElement('div', { style }, ...kids)
const txt = (tag: string, style: React.CSSProperties, child: ReactNode) =>
  createElement(tag, { style }, child)

function emailEl(variant: CourseVariant, c: CourseData): ReactNode {
  switch (variant) {
    case 'cover':
      return div(
        { position: 'relative', background: c.heroImage ? `#000` : '#221b16', padding: '34px 44px 48px', minHeight: 320, color: '#fff' },
        txt('div', { fontSize: 11, fontWeight: 600, letterSpacing: '.26em', textTransform: 'uppercase', opacity: 0.85 }, c.eyebrow),
        txt('h1', { margin: '120px 0 0', fontSize: 48, fontWeight: 700, lineHeight: 1, letterSpacing: '-1.5px' }, c.title),
        txt('p', { margin: '16px 0 0', fontSize: 14.5, fontWeight: 500, opacity: 0.8 }, 'with ' + c.instructor.name),
        txt('p', { margin: '12px 0 0', maxWidth: 400, fontSize: 15, lineHeight: 1.5, opacity: 0.72 }, c.tagline),
        createElement('a', { href: c.ctaHref, style: { display: 'inline-block', marginTop: 28, textDecoration: 'none', background: '#fff', color: '#141518', borderRadius: 999, padding: '13px 24px', fontSize: 15, fontWeight: 600 } }, c.ctaText),
      )
    case 'welcome':
      return div(
        { padding: '56px 44px' },
        txt('h2', { margin: '0 0 24px', fontSize: 34, fontWeight: 700, lineHeight: 1.1, color: eH }, c.welcomeHeading || 'Welcome — you’re in.'),
        ...c.welcome.map((p, i) =>
          createElement('p', { key: i, style: { margin: `${i ? 14 : 0}px 0 0`, fontSize: 17, lineHeight: 1.65, color: eT } }, p),
        ),
        div(
          { marginTop: 28 },
          txt('p', { margin: 0, fontSize: 22, fontStyle: 'italic', color: eH }, c.instructor.name),
          txt('p', { margin: '4px 0 0', fontSize: 12, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: eM }, c.instructor.role),
        ),
      )
    case 'facts':
      return div(
        { padding: '8px 44px' },
        div(
          { borderTop: `1px solid ${eBD}`, borderBottom: `1px solid ${eBD}`, padding: '16px 0', fontSize: 13, fontWeight: 500, color: eH },
          `${c.lessons.length} lessons  ·  ${c.totalDuration}  ·  ${c.level}`,
        ),
      )
    case 'curriculum':
      return div(
        { padding: '48px 44px' },
        txt('h2', { margin: '0 0 28px', fontSize: 30, fontWeight: 700, color: eH }, 'What you’ll learn'),
        div(
          { borderBottom: `1px solid ${eBD}` },
          ...c.lessons.map((it, i) =>
            createElement(
              'div',
              { key: i, style: { display: 'flex', gap: 20, padding: '18px 0', borderTop: `1px solid ${eBD}` } },
              txt('span', { width: 22, fontSize: 13, fontWeight: 500, color: eM }, String(i + 1).padStart(2, '0')),
              txt('span', { flex: 1, fontSize: 16, fontWeight: 500, color: eH }, it.title),
              txt('span', { fontSize: 13, color: eM }, it.duration),
            ),
          ),
        ),
      )
    case 'progress': {
      const p = pct(c)
      return div(
        { padding: '36px 44px' },
        div(
          { display: 'flex', justifyContent: 'space-between', marginBottom: 13 },
          txt('span', { fontSize: 11, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: eM }, 'Your progress'),
          txt('span', { fontSize: 12.5, fontWeight: 500, color: eH }, `${c.progress.completed} of ${c.progress.total} · ${p}%`),
        ),
        div({ height: 4, borderRadius: 999, background: eBD, overflow: 'hidden' }, div({ height: '100%', width: `${p}%`, background: eH, borderRadius: 999 })),
      )
    }
    case 'trailer':
      return div(
        { padding: '24px 44px' },
        div({ position: 'relative', borderRadius: 4, background: '#221b16', aspectRatio: '16/9' }),
        div(
          { marginTop: 14, display: 'flex', justifyContent: 'space-between' },
          txt('span', { fontSize: 14, fontWeight: 600, color: eH }, 'Watch the trailer'),
          txt('span', { fontSize: 13, color: eM }, '2 min'),
        ),
      )
    case 'instructor':
      return div(
        { padding: '48px 44px' },
        div(
          { borderTop: `1px solid ${eBD}`, paddingTop: 32, display: 'flex', gap: 24 },
          c.instructor.avatar
            ? createElement('img', { src: c.instructor.avatar, alt: c.instructor.name, style: { width: 120, height: 150, objectFit: 'cover', borderRadius: 4 } })
            : div({ width: 120, height: 150, borderRadius: 4, background: eBD }),
          div(
            { flex: 1 },
            txt('p', { margin: '0 0 8px', fontSize: 11, fontWeight: 600, letterSpacing: '.16em', textTransform: 'uppercase', color: eM }, c.instructor.role),
            txt('p', { margin: 0, fontSize: 28, fontWeight: 600, color: eH }, c.instructor.name),
            txt('p', { margin: '14px 0 0', fontSize: 15, lineHeight: 1.6, color: eT }, c.instructor.bio),
          ),
        ),
      )
    case 'cta':
      return div(
        { padding: 44, textAlign: 'center' },
        txt('h2', { margin: '0 0 18px', fontSize: 26, fontWeight: 700, color: eH }, 'Ready to begin?'),
        createElement('a', { href: c.ctaHref, style: { display: 'inline-block', textDecoration: 'none', background: '#141518', color: '#fff', borderRadius: 999, padding: '14px 28px', fontSize: 15, fontWeight: 600 } }, c.ctaText),
      )
  }
}

const dataOf = (node: { attrs: { data: CourseData | null } }): CourseData =>
  node.attrs.data ?? SAMPLE_COURSE

export const CourseBlock = Node.create({
  name: 'courseBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      variant: { default: 'cover' },
      // The bound course snapshot. Kept live-synced by BroadcastEditorV3 and
      // serialised into getJSON so saved emails carry the data.
      data: {
        default: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parseHTML: (el: any) => {
          const raw = el.getAttribute('data-course-json')
          try {
            return raw ? JSON.parse(raw) : null
          } catch {
            return null
          }
        },
        renderHTML: (attrs: { data: CourseData | null }) =>
          attrs.data ? { 'data-course-json': JSON.stringify(attrs.data) } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-course]' }]
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderHTML({ node }: any) {
    return editorSpec(node.attrs.variant as CourseVariant, dataOf(node))
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderToReactEmail({ node }: any) {
    return emailEl(node.attrs.variant as CourseVariant, dataOf(node))
  },
})
