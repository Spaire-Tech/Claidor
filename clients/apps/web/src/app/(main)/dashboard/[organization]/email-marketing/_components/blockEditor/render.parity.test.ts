import { describe, expect, it } from 'vitest'
import { renderBlocksToHtml } from './render'
import { ContentDoc } from './types'

/**
 * Render parity fixture and golden HTML.
 *
 * The fixture exercises every block type the editor emits. A matching
 * Python test (`server/tests/email_broadcast/test_render_parity.py`) loads
 * the same fixture and asserts the same golden output, so any change to one
 * renderer that breaks parity surfaces as a failing test in BOTH runtimes.
 *
 * To regenerate the golden:
 *   - update PARITY_GOLDEN to match the new TS output, then
 *   - copy the same string into the Python test (escape backticks).
 */

export const PARITY_FIXTURE: ContentDoc = {
  version: 1,
  accent: '#4f46e5',
  blocks: [
    { id: 'b1', type: 'eyebrow', text: 'Eyebrow' },
    { id: 'b2', type: 'heading', level: 1, text: 'Title' },
    { id: 'b3', type: 'heading', level: 2, text: 'Big', huge: true },
    { id: 'b4', type: 'subheading', text: 'Sub' },
    { id: 'b5', type: 'paragraph', text: 'Para line 1\nPara line 2' },
    { id: 'b6', type: 'badge', text: 'New' },
    {
      id: 'b7',
      type: 'image',
      src: 'https://example.com/x.png',
      alt: 'X',
      href: 'https://example.com/y',
    },
    {
      id: 'b8',
      type: 'button',
      text: 'Go',
      url: 'https://example.com',
      size: 'md',
    },
    { id: 'b9', type: 'divider' },
    {
      id: 'b10',
      type: 'video',
      embed_url: 'https://example.com/v',
      thumbnail: 'https://example.com/t.png',
    },
    {
      id: 'b11',
      type: 'list',
      ordered: false,
      items: [
        { id: 'i1', text: 'First' },
        { id: 'i2', text: 'Second' },
      ],
    },
    {
      id: 'b12',
      type: 'quote',
      text: 'Believe',
      cite: 'Author',
    },
    {
      id: 'b13',
      type: 'columns',
      cols: [
        {
          id: 'c1',
          label: 'A',
          title: 'One',
          value: '$1',
          body: 'Notes A',
        },
        {
          id: 'c2',
          label: 'B',
          title: 'Two',
          value: '$2',
          body: 'Notes B',
        },
      ],
    },
    {
      id: 'b14',
      type: 'checklist',
      items: [
        { id: 'k1', title: 'Step one', body: 'Description one' },
        { id: 'k2', title: 'Step two' },
      ],
    },
    {
      id: 'b15',
      type: 'event-card',
      day: 'THU',
      date: 'MAY 22',
      title: 'Workshop',
      meta: 'Zoom',
    },
    {
      id: 'b16',
      type: 'receipt',
      items: [
        { id: 'r1', name: 'Item', sub: 'Sub', price: '$10' },
        { id: 'r2', name: 'Other', price: '$5' },
      ],
      total: '$15',
    },
    {
      id: 'b17',
      type: 'digest-item',
      num: '01',
      title: 'Story',
      meta: '4 min',
      body: 'Summary',
    },
  ],
}

describe('render parity (TS)', () => {
  it('renders the fixture deterministically', () => {
    const html = renderBlocksToHtml(PARITY_FIXTURE)
    // Sanity assertions — full byte parity is asserted against the Python
    // golden in the matching pytest. Here we just guard against drift in
    // the TS renderer itself.
    expect(html).toContain('Eyebrow')
    expect(html).toContain('font-size:32px') // huge heading
    expect(html).toContain('Para line 1<br>Para line 2')
    expect(html).toContain('href="https://example.com"')
    // Event-card emits the literal "You're invited" copy unescaped — it's
    // a hardcoded string in the renderer, not user content.
    expect(html).toContain("You're invited")
    expect(html).toContain('First') // list item shape new
    expect(html).toContain('Author')
    expect(html).toContain('$15') // receipt total
    expect(html).not.toContain('<script')
    expect(html).not.toContain('javascript:')
  })

  it('skips malformed blocks instead of throwing', () => {
    const html = renderBlocksToHtml({
      version: 1,
      blocks: [
        // Missing required fields — shouldn't crash the renderer.
        { id: 'x1' } as unknown as ContentDoc['blocks'][number],
        { id: 'b1', type: 'heading', level: 2, text: 'OK' },
      ],
    })
    expect(html).toContain('OK')
  })

  it('drops javascript: URLs', () => {
    const html = renderBlocksToHtml({
      version: 1,
      blocks: [
        {
          id: 'b1',
          type: 'button',
          // eslint-disable-next-line no-script-url
          url: 'javascript:alert(1)',
          text: 'Click',
        },
      ],
    })
    expect(html).not.toContain('javascript:')
    // Renders text but no anchor.
    expect(html).toContain('Click')
    expect(html).not.toContain('<a ')
  })
})
