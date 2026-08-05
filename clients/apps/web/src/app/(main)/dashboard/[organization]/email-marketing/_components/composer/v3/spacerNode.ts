'use client'

// Spacer block (brick 6) — a custom EmailNode (React Email has none). Atom
// block with a height attribute; renders an empty fixed-height row in the
// editor and inbox-correct HTML via renderToReactEmail.

import { EmailNode } from '@react-email/editor/core'
import { createElement } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Node = EmailNode as any

export const DEFAULT_SPACER_HEIGHT = 24

export const Spacer = Node.create({
  name: 'spacer',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      height: {
        default: DEFAULT_SPACER_HEIGHT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parseHTML: (el: any) =>
          parseInt(el.getAttribute('data-height') || '', 10) ||
          DEFAULT_SPACER_HEIGHT,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderHTML: (attrs: any) => ({ 'data-height': attrs.height }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-spacer]' }]
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderHTML({ node, HTMLAttributes }: any) {
    const h = node?.attrs?.height ?? DEFAULT_SPACER_HEIGHT
    return [
      'div',
      {
        ...HTMLAttributes,
        'data-spacer': '',
        class: 'eb-spacer',
        style: `height:${h}px`,
      },
    ]
  },

  // Email output: a fixed-height row that survives across clients.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderToReactEmail({ node }: any) {
    const h = node.attrs.height ?? DEFAULT_SPACER_HEIGHT
    return createElement(
      'div',
      { style: { height: `${h}px`, lineHeight: `${h}px`, fontSize: '1px' } },
      ' ',
    )
  },
})
