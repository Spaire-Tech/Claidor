'use client'

// The composer's text primitive — a TipTap (ProseMirror) inline editor that
// replaces the old contentEditable + document.execCommand.
//
// Why: execCommand applied formatting to whatever the *document* selection was
// (so the colour popup stealing focus reformatted the whole block), and raw
// contentEditable stored pasted <span style="font-size…"> verbatim (random
// fonts/sizes in the sent email). ProseMirror fixes both structurally:
//   - marks (bold/italic/underline/strike/link/colour) apply to the editor's
//     own selection, restored by .chain().focus() even if a popover stole
//     DOM focus;
//   - paste is parsed through a fixed schema, and transformPastedHTML strips
//     anything outside our allow-list, so foreign fonts/sizes can never enter.
//
// One RichText backs each text-like block body and each list item. It edits
// *inline* content only (one paragraph's worth of marks). Block-level shape
// (heading vs paragraph vs quote vs list) stays in the Block model and is
// applied by the CSS class + the email serializer — the editor just owns the
// marks.

import { Color } from '@tiptap/extension-color'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyle } from '@tiptap/extension-text-style'
import {
  EditorContent,
  Extension,
  useEditor,
  type Editor,
} from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, type CSSProperties } from 'react'

import { sanitizeInlineHtml } from './sanitize'

// Enter inserts a line break instead of splitting into a second paragraph —
// each RichText is a single logical line/paragraph of the block.
const SingleParagraph = Extension.create({
  name: 'singleParagraph',
  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.setHardBreak(),
    }
  },
})

export const baseExtensions = [
  StarterKit.configure({
    // Block-level nodes are handled by the Block model, not inside one field.
    heading: false,
    blockquote: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    link: {
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
    },
  }),
  TextStyle,
  Color,
  SingleParagraph,
]

// Unwrap TipTap's block wrapper(s) back to the inline HTML we store on the
// block. A single paragraph → its inner HTML; the (rare) multi-block case →
// joined with <br>. Empty editor → ''.
export function inlineFromHTML(html: string): string {
  if (typeof document === 'undefined') return html
  const div = document.createElement('div')
  div.innerHTML = html
  const blocks = Array.from(div.children)
  if (blocks.length === 0) return div.innerHTML.trim()
  return blocks
    .map((el) => (el.tagName === 'P' ? el.innerHTML : el.outerHTML))
    .join('<br>')
}

export function RichText({
  html,
  onChange,
  onActive,
  placeholder,
  className,
  style,
  readOnly,
}: {
  html: string
  onChange?: (inlineHtml: string) => void
  /** Register this editor as the active one (drives the bubble menu) on focus. */
  onActive?: (editor: Editor | null) => void
  placeholder?: string
  className?: string
  style?: CSSProperties
  readOnly?: boolean
}) {
  const editor = useEditor({
    editable: !readOnly,
    immediatelyRender: false,
    extensions: placeholder
      ? [...baseExtensions, Placeholder.configure({ placeholder })]
      : baseExtensions,
    content: html || '',
    editorProps: {
      attributes: className ? { class: className } : {},
      // Belt-and-suspenders: strip foreign fonts/sizes before ProseMirror even
      // parses the paste (the schema would drop them too, this makes it certain).
      transformPastedHTML: (h) => sanitizeInlineHtml(h),
    },
    onUpdate: ({ editor }) => onChange?.(inlineFromHTML(editor.getHTML())),
    onFocus: ({ editor }) => onActive?.(editor),
  })

  // External content changes (e.g. a block type swap that rewrites html) sync
  // into the editor — but never while focused (that would fight the caret),
  // and only on a real difference (avoids an update→prop→setContent loop).
  useEffect(() => {
    if (!editor) return
    if (editor.isFocused) return
    if (inlineFromHTML(editor.getHTML()) !== html) {
      editor.commands.setContent(html || '', { emitUpdate: false })
    }
  }, [html, editor])

  if (readOnly) {
    return (
      <div
        className={className}
        style={style}
        dangerouslySetInnerHTML={{ __html: html || '' }}
      />
    )
  }

  return <EditorContent editor={editor} style={style} />
}
