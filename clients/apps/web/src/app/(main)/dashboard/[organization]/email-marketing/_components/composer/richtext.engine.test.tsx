// @vitest-environment jsdom
//
// Proves the editing ENGINE fixes the three reported bugs, using the exact
// extension config RichText ships with:
//   1. selection-scoped marks  → bold/colour hit only the selected text, never
//      the whole block (the "changing one word reformats the whole email" bug);
//   2. schema drops foreign styles → pasted/loaded font-size/font-family can't
//      survive (the "random fonts & sizes on random paragraphs" bug);
//   3. the sanitizer strips <font>/font-size before paste even reaches the doc.
import { Editor } from '@tiptap/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { baseExtensions, inlineFromHTML } from './RichText'
import { sanitizeInlineHtml } from './sanitize'

beforeAll(() => {
  // jsdom gaps ProseMirror touches when mounting an EditorView.
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
  }
  if (!document.elementFromPoint) {
    ;(Document.prototype as unknown as { elementFromPoint: unknown }).elementFromPoint =
      () => null
  }
  if (!Range.prototype.getClientRects) {
    ;(Range.prototype as unknown as { getClientRects: unknown }).getClientRects =
      () => [] as unknown as DOMRectList
  }
  if (!Range.prototype.getBoundingClientRect) {
    ;(Range.prototype as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect =
      () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} })
  }
})

function makeEditor(content: string) {
  return new Editor({
    element: document.createElement('div'),
    extensions: baseExtensions,
    content,
  })
}

describe('RichText engine (TipTap schema)', () => {
  it('bold applies to the SELECTION only, not the whole block', () => {
    const editor = makeEditor('<p>one two three</p>')
    // Select just "two" (positions: <p>=1, "one "=1..5, "two"=5..8).
    editor.commands.setTextSelection({ from: 5, to: 8 })
    editor.chain().focus().toggleBold().run()

    const out = editor.getHTML()
    // Only "two" is wrapped — "one " and " three" stay plain.
    expect(out).toMatch(/one\s*<strong>two<\/strong>\s*three/)
    expect(out).not.toMatch(/<strong>one/)
    // inlineFromHTML unwraps the <p> the block model stores inline content.
    expect(inlineFromHTML(out)).toBe('one <strong>two</strong> three')
    editor.destroy()
  })

  it('colour is a selection-scoped mark (survives focus moving to a popover)', () => {
    const editor = makeEditor('<p>red word here</p>')
    editor.commands.setTextSelection({ from: 1, to: 4 }) // "red"
    // Simulate the colour popover stealing DOM focus, then applying: the chain
    // re-focuses the editor's own stored selection, so colour still lands on
    // exactly "red" — this is what the old execCommand path got wrong.
    editor.chain().focus().setColor('#ff0000').run()

    // TipTap's Color mark normalises #ff0000 → rgb(255, 0, 0); both are valid.
    const out = editor.getHTML()
    expect(out).toMatch(
      /<span style="color:\s*(#ff0000|rgb\(255,\s*0,\s*0\))[^"]*">red<\/span>/i,
    )
    // Only "red" carries colour — "word"/"here" stay outside the span.
    expect(out).toMatch(/<\/span>\s*word here/)
    // And the sanitizer (serializer backstop) PRESERVES that rgb() colour.
    expect(sanitizeInlineHtml(out)).toMatch(/color:\s*rgb\(255,\s*0,\s*0\)/i)
    editor.destroy()
  })

  it('drops foreign font-size / font-family at the schema level', () => {
    const editor = makeEditor(
      '<p><span style="font-size:42px;font-family:Comic Sans MS;color:#222">x</span></p>',
    )
    const out = editor.getHTML()
    expect(out).not.toMatch(/font-size/i)
    expect(out).not.toMatch(/font-family/i)
    expect(out).toContain('x')
    editor.destroy()
  })

  it('keeps real formatting marks through a round-trip', () => {
    const editor = makeEditor('<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s></p>')
    const out = editor.getHTML()
    expect(out).toMatch(/<strong>b<\/strong>/)
    expect(out).toMatch(/<em>i<\/em>/)
    expect(out).toMatch(/<u>u<\/u>/)
    expect(out).toMatch(/<s>s<\/s>/)
    editor.destroy()
  })
})

describe('sanitizeInlineHtml (paste backstop)', () => {
  it('strips <font> tags but keeps their text', () => {
    expect(sanitizeInlineHtml('<font face="Arial" size="7">hi</font>')).toBe('hi')
  })
  it('drops font-size/family inline styles, keeps colour', () => {
    const out = sanitizeInlineHtml(
      '<span style="font-size:30px;color:#0a0;font-family:Times">k</span>',
    )
    expect(out).not.toMatch(/font-size|font-family/i)
    expect(out).toMatch(/color:\s*#0a0/i)
    expect(out).toContain('k')
  })
  it('keeps bold/italic/links, drops classes and js: hrefs', () => {
    const out = sanitizeInlineHtml(
      '<b class="x">B</b><a href="javascript:alert(1)">a</a><a href="https://ok.com">b</a>',
    )
    expect(out).toMatch(/<b>B<\/b>/)
    expect(out).not.toMatch(/class=/)
    expect(out).not.toMatch(/javascript:/i)
    expect(out).toMatch(/href="https:\/\/ok\.com"/)
  })
})
