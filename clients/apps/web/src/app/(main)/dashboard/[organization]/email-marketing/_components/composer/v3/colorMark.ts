'use client'

// Custom text-colour mark (brick 5).
//
// React Email ships no colour mark, and composeReactEmail only renders marks
// that are EmailMark instances — so a plain @tiptap color mark would be
// dropped from the email. This defines colour as a first-class EmailMark with
// renderToReactEmail, so the colour survives into inbox-correct HTML.

import { EmailMark } from '@react-email/editor/core'
import { createElement } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Mark = EmailMark as any

export const TextColor = Mark.create({
  name: 'textColor',

  addOptions() {
    return {}
  },

  addAttributes() {
    return {
      color: {
        default: null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        parseHTML: (el: any) =>
          el.style?.color || el.getAttribute?.('data-color') || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderHTML: (attrs: any) =>
          attrs.color ? { style: `color: ${attrs.color}` } : {},
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getAttrs: (el: any) => (el.style?.color ? {} : false),
      },
    ]
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderHTML({ HTMLAttributes }: any) {
    return ['span', HTMLAttributes, 0]
  },

  // Email output: a colour-only span (React Email inlines the style).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderToReactEmail({ mark, children }: any) {
    return createElement('span', { style: { color: mark.attrs.color } }, children)
  },

  addCommands() {
    return {
      setTextColor:
        (color: string) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ chain }: any) =>
          chain().setMark('textColor', { color }).run(),
      unsetTextColor:
        () =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ({ chain }: any) =>
          chain().unsetMark('textColor').run(),
    }
  },
})

// Brand-ish preset palette for the swatch picker.
export const COLOR_PRESETS = [
  '#1d1d1f',
  '#6e6e73',
  '#0066cc',
  '#127c2b',
  '#b25e00',
  '#c0392b',
  '#8e44ad',
  '#0b7285',
]
