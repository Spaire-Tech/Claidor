// @vitest-environment jsdom
import { Editor } from '@tiptap/react'
import { beforeAll, describe, expect, it } from 'vitest'

import { SAMPLE_COURSE, type CourseData } from './courseData'
import {
  deleteBlock,
  duplicateBlock,
  emailExtensions,
  emailHtml,
  insertBlock,
  insertBlockAt,
  insertCourseBlock,
  moveBlock,
  moveBlockTo,
  setBlockAttr,
  setTextColor,
  syncCourseBlocks,
  toggleBold,
  topBlocks,
} from './engine'

beforeAll(() => {
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

function makeEditor() {
  return new Editor({
    element: document.createElement('div'),
    // Same extension set the live editor uses (incl. the custom colour mark).
    extensions: emailExtensions(),
    content: '',
  })
}

describe('v3 engine: insert + email output', () => {
  it('inserts Heading / Text / Button and they survive to email HTML', async () => {
    const editor = makeEditor()

    expect(insertBlock(editor, 'heading')).toBe(true)
    expect(insertBlock(editor, 'text')).toBe(true)
    expect(insertBlock(editor, 'button')).toBe(true)

    const doc = editor.getHTML()
    expect(doc).toMatch(/<h2[ >]/i)
    expect(doc).toMatch(/Write something/)
    expect(doc).toMatch(/Heading/)

    const html = await emailHtml(editor)
    // inbox-correct document
    expect(html).toMatch(/<!DOCTYPE html/i)
    expect(html).toContain('Heading')
    expect(html).toContain('Write something')
    expect(html).toContain('Button')
    // the button becomes a real link in the email
    expect(html).toMatch(/href="https:\/\/example\.com"/)

    editor.destroy()
  })

  it('bold toggles as a mark on the selection', () => {
    const editor = makeEditor()
    insertBlock(editor, 'text')
    editor.commands.selectAll()
    expect(toggleBold(editor)).toBe(true)
    expect(editor.getHTML()).toMatch(/<strong>/)
    editor.destroy()
  })

  it('italic / underline / strike / link marks round-trip', async () => {
    const editor = makeEditor()
    editor.commands.setContent('<p>format me</p>')
    editor.commands.selectAll()
    editor.chain().focus().toggleItalic().run()
    editor.chain().focus().toggleStrike().run()
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .setLink({ href: 'https://spaire.test/m' } as any)
      .run()
    const doc = editor.getHTML()
    expect(doc).toMatch(/<em>|<i>/)
    expect(doc).toMatch(/<s>|<strike>/)
    const html = await emailHtml(editor)
    expect(html).toMatch(/href="https:\/\/spaire\.test\/m"/)
    editor.destroy()
  })

  it('Quote / Divider / Spacer insert and survive to email HTML', async () => {
    const editor = makeEditor()
    expect(insertBlock(editor, 'quote')).toBe(true)
    expect(insertBlock(editor, 'divider')).toBe(true)
    expect(insertBlock(editor, 'spacer')).toBe(true)

    const doc = editor.getHTML()
    expect(doc).toMatch(/<blockquote/i)
    expect(doc).toMatch(/<hr/i)
    expect(doc).toMatch(/data-spacer/i)

    const html = await emailHtml(editor)
    expect(html).toMatch(/A line worth remembering/)
    expect(html).toMatch(/<blockquote|<hr/i)
    editor.destroy()
  })

  it('Image block: src/alt/link survive to email HTML as <img>', async () => {
    const editor = makeEditor()
    expect(insertBlock(editor, 'image')).toBe(true)
    const idx = topBlocks(editor).findIndex((b) => b.node.type.name === 'image')
    expect(idx).toBeGreaterThanOrEqual(0)

    // empty image → no <img> yet (placeholder only)
    expect(await emailHtml(editor)).not.toMatch(/<img/i)

    setBlockAttr(editor, idx, {
      src: 'https://cdn.test/p.png',
      alt: 'A pie',
      href: 'https://spaire.test/shop',
    })
    const html = await emailHtml(editor)
    expect(html).toMatch(/<img[^>]+src="https:\/\/cdn\.test\/p\.png"/i)
    expect(html).toMatch(/alt="A pie"/i)
    expect(html).toMatch(/href="https:\/\/spaire\.test\/shop"/i)
    editor.destroy()
  })

  it('alignment + button colours survive to email HTML', async () => {
    const editor = makeEditor()
    editor.commands.setContent('<p>centre me</p>')
    const pIdx = topBlocks(editor).findIndex((b) =>
      (b.node.textContent as string)?.includes('centre'),
    )
    setBlockAttr(editor, pIdx, { alignment: 'center' })

    insertBlock(editor, 'button')
    const bIdx = topBlocks(editor).findIndex((b) => b.node.type.name === 'button')
    setBlockAttr(editor, bIdx, {
      style: 'background-color:#127c2b;color:#ffffff',
    })

    const html = await emailHtml(editor)
    expect(html).toMatch(/text-align:\s*center/i)
    expect(html).toMatch(/(#127c2b|rgb\(18,\s*124,\s*43\))/i)
    editor.destroy()
  })

  it('merge token {{first_name}} survives intact to email HTML', async () => {
    const editor = makeEditor()
    editor.commands.setContent('<p>Hi there</p>')
    // place the cursor and insert the token (what a merge chip does) — the
    // braces must reach the email unescaped so the backend can swap them per
    // subscriber at send.
    editor.commands.selectAll()
    editor.chain().focus().insertContent('{{first_name}}').run()
    expect(editor.getHTML()).toContain('{{first_name}}')
    const html = await emailHtml(editor)
    expect(html).toContain('{{first_name}}')
    editor.destroy()
  })

  it('course blocks auto-fill from the bound course in email HTML', async () => {
    const editor = makeEditor()
    expect(insertCourseBlock(editor, 'cover', SAMPLE_COURSE)).toBe(true)
    expect(insertCourseBlock(editor, 'curriculum', SAMPLE_COURSE)).toBe(true)
    expect(insertCourseBlock(editor, 'instructor', SAMPLE_COURSE)).toBe(true)

    const html = await emailHtml(editor)
    // bound course data reaches the inbox-correct output, no manual entry
    expect(html).toContain('Southern Cooking') // cover title
    expect(html).toContain('The Kitchen Series') // eyebrow
    expect(html).toContain('Low &amp; Slow Braises') // a curriculum lesson
    expect(html).toContain('Adaeze Bello') // instructor name
    editor.destroy()
  })

  it('syncCourseBlocks live-updates every course block to the new course', async () => {
    const editor = makeEditor()
    insertCourseBlock(editor, 'cover', SAMPLE_COURSE)
    insertCourseBlock(editor, 'curriculum', SAMPLE_COURSE)
    expect(await emailHtml(editor)).toContain('Southern Cooking')

    const next: CourseData = {
      ...SAMPLE_COURSE,
      title: 'Knife Skills 101',
      lessons: [{ title: 'The Rock Chop', duration: '11 min' }],
    }
    expect(syncCourseBlocks(editor, next)).toBe(2) // both blocks updated

    const html = await emailHtml(editor)
    expect(html).toContain('Knife Skills 101')
    expect(html).toContain('The Rock Chop')
    expect(html).not.toContain('Southern Cooking')
    expect(html).not.toContain('Low &amp; Slow Braises')
    editor.destroy()
  })

  it('text colour (custom EmailMark) survives to email HTML', async () => {
    const editor = makeEditor()
    editor.commands.setContent('<p>colour me</p>')
    editor.commands.selectAll()
    expect(setTextColor(editor, '#0066cc')).toBe(true)
    const html = await emailHtml(editor)
    expect(html).toContain('colour me')
    expect(html).toMatch(/color:\s*(#0066cc|rgb\(0,\s*102,\s*204\))/i)
    editor.destroy()
  })
})

describe('v3 engine: block move / duplicate / delete', () => {
  // Order in the email doc by first-occurrence of marker text.
  const order = (editor: Editor, marks: string[]) =>
    marks
      .map((m) => ({ m, i: editor.getHTML().indexOf(m) }))
      .filter((x) => x.i >= 0)
      .sort((a, b) => a.i - b.i)
      .map((x) => x.m)
  const idxOf = (editor: Editor, text: string) =>
    topBlocks(editor).find((b) => (b.node.textContent as string)?.includes(text))
      ?.index ?? -1

  it('moves a block up/down, swapping order', () => {
    const editor = makeEditor()
    editor.commands.setContent('<h2>ALPHA</h2><p>BRAVO</p>')
    expect(order(editor, ['ALPHA', 'BRAVO'])).toEqual(['ALPHA', 'BRAVO'])

    expect(moveBlock(editor, idxOf(editor, 'ALPHA'), 'down')).toBe(true)
    expect(order(editor, ['ALPHA', 'BRAVO'])).toEqual(['BRAVO', 'ALPHA'])

    expect(moveBlock(editor, idxOf(editor, 'ALPHA'), 'up')).toBe(true)
    expect(order(editor, ['ALPHA', 'BRAVO'])).toEqual(['ALPHA', 'BRAVO'])
    editor.destroy()
  })

  it('insertBlockAt places a block at the requested index', () => {
    const editor = makeEditor()
    editor.commands.setContent('<h2>ALPHA</h2><p>BRAVO</p>')
    // insert a heading at the very top
    expect(insertBlockAt(editor, 'heading', 0)).toBe(true)
    expect(topBlocks(editor)[0].node.type.name).toBe('heading')
    // …and a divider between the heading and ALPHA (index 1)
    expect(insertBlockAt(editor, 'divider', 1)).toBe(true)
    expect(topBlocks(editor)[1].node.type.name).toBe('horizontalRule')
    // ALPHA is now pushed to index 2
    expect(topBlocks(editor)[2].node.textContent).toContain('ALPHA')
    editor.destroy()
  })

  it('moveBlockTo reorders to an arbitrary drop index (design splice maths)', () => {
    const editor = makeEditor()
    editor.commands.setContent('<h2>ALPHA</h2><p>BRAVO</p><p>CHARLIE</p>')
    const ord = () => order(editor, ['ALPHA', 'BRAVO', 'CHARLIE'])
    expect(ord()).toEqual(['ALPHA', 'BRAVO', 'CHARLIE'])

    // drag ALPHA (0) to the end (drop index 3)
    expect(moveBlockTo(editor, 0, 3)).toBe(true)
    expect(ord()).toEqual(['BRAVO', 'CHARLIE', 'ALPHA'])

    // drag ALPHA (now index 2) to the top (drop index 0)
    expect(moveBlockTo(editor, idxOf(editor, 'ALPHA'), 0)).toBe(true)
    expect(ord()).toEqual(['ALPHA', 'BRAVO', 'CHARLIE'])

    // dropping into the same slot is a no-op
    expect(moveBlockTo(editor, 1, 1)).toBe(false)
    expect(moveBlockTo(editor, 1, 2)).toBe(false)
    editor.destroy()
  })

  it('duplicates a block, then delete removes one copy', () => {
    const editor = makeEditor()
    editor.commands.setContent('<h2>ALPHA</h2><p>BRAVO</p>')
    const count = (m: string) => editor.getHTML().split(m).length - 1

    expect(count('ALPHA')).toBe(1)
    expect(duplicateBlock(editor, idxOf(editor, 'ALPHA'))).toBe(true)
    expect(count('ALPHA')).toBe(2)
    expect(deleteBlock(editor, idxOf(editor, 'ALPHA'))).toBe(true)
    expect(count('ALPHA')).toBe(1)
    editor.destroy()
  })
})
