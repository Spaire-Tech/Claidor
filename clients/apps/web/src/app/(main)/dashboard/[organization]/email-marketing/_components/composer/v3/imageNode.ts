'use client'

// Image block (brick 7) — a custom EmailNode (React Email's image is a private
// upload-factory, not an exported node). Atom block with src / alt / href /
// align. Empty state shows an upload placeholder in the editor; renders a
// real <img> (optionally linked, aligned) to inbox-correct HTML.

import { EmailNode } from '@react-email/editor/core'
import { createElement } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Node = EmailNode as any

export type ImageAlign = 'left' | 'center' | 'full'

const widthFor = (align: ImageAlign) =>
  align === 'full' ? '100%' : align === 'center' ? '78%' : '58%'

export const Image = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      href: { default: '' },
      align: { default: 'center' },
    }
  },

  parseHTML() {
    return [
      { tag: 'div[data-image]' },
      {
        tag: 'img[src]',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getAttrs: (el: any) => ({
          src: el.getAttribute('src'),
          alt: el.getAttribute('alt') || '',
        }),
      },
    ]
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderHTML({ node }: any) {
    const { src, alt, align } = node.attrs as {
      src: string | null
      alt: string
      align: ImageAlign
    }
    if (!src) {
      return [
        'div',
        { 'data-image': '', class: 'eb-imgph' },
        'Click “Upload image” in the panel →',
      ]
    }
    const w = widthFor(align)
    return [
      'div',
      { 'data-image': '', class: 'eb-img a-' + align },
      [
        'img',
        {
          src,
          alt,
          class: 'b-img-real',
          style: `width:${w};display:block;border-radius:10px;${
            align === 'center' ? 'margin:0 auto;' : ''
          }`,
        },
      ],
    ]
  },

  // Email output: a real <img>, optionally linked, in an alignment wrapper.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderToReactEmail({ node }: any) {
    const { src, alt, href, align } = node.attrs as {
      src: string | null
      alt: string
      href: string
      align: ImageAlign
    }
    if (!src) return createElement('div')
    const img = createElement('img', {
      src,
      alt,
      style: {
        width: widthFor(align),
        display: 'block',
        borderRadius: '10px',
        ...(align === 'center' ? { margin: '0 auto' } : {}),
      },
    })
    const inner = href ? createElement('a', { href }, img) : img
    return createElement(
      'div',
      { style: { textAlign: align === 'center' ? 'center' : 'left', margin: '14px 0' } },
      inner,
    )
  },
})
