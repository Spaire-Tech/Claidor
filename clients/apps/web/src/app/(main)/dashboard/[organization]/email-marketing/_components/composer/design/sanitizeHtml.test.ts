// The two hygiene passes for stored/pasted email HTML:
//  - scrubHtml keeps formatting but removes anything executable (the stored-
//    XSS floor for canvas re-render and the sent email)
//  - sanitizePastedHtml reduces clipboard soup to structural formatting (the
//    "random fonts and sizes on paste" fix)
import { describe, expect, it } from 'vitest'

import { pastedTextToHtml, sanitizePastedHtml, scrubHtml } from './sanitizeHtml'

describe('scrubHtml', () => {
  it('passes plain text through untouched', () => {
    expect(scrubHtml('Welcome — you’re in.')).toBe('Welcome — you’re in.')
  })

  it('keeps legitimate formatting from the format bubble', () => {
    const s = 'Start <b>here</b>, <i>then</i> <a href="https://x.com" style="color:inherit">watch</a>'
    expect(scrubHtml(s)).toBe(s)
  })

  it('removes script elements entirely', () => {
    expect(scrubHtml('hi<script>alert(1)</script> there')).toBe('hi there')
  })

  it('strips event-handler attributes', () => {
    expect(scrubHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x">')
  })

  it('strips javascript: URLs', () => {
    expect(scrubHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })

  it('removes iframes and form controls', () => {
    expect(scrubHtml('a<iframe src="https://evil"></iframe>b<input>')).toBe('ab')
  })

  it('normalises a bare < typed as text', () => {
    expect(scrubHtml('5 < 10')).toBe('5 &lt; 10')
  })
})

describe('sanitizePastedHtml', () => {
  it('keeps bold/italic and normalises strong/em', () => {
    expect(sanitizePastedHtml('<strong>a</strong> <em>b</em> <u>c</u>')).toBe(
      '<b>a</b> <i>b</i> <u>c</u>',
    )
  })

  it('unwraps styled spans and fonts (the Word/Docs soup)', () => {
    expect(
      sanitizePastedHtml(
        '<span style="font-family:Comic Sans;font-size:28px">hello</span> <font face="Papyrus">world</font>',
      ),
    ).toBe('hello world')
  })

  it('keeps safe links, drops unsafe ones', () => {
    expect(sanitizePastedHtml('<a href="https://x.com">ok</a>')).toBe(
      '<a href="https://x.com">ok</a>',
    )
    expect(sanitizePastedHtml('<a href="javascript:alert(1)">bad</a>')).toBe('bad')
  })

  it('turns paragraphs into line breaks without a trailing break', () => {
    expect(sanitizePastedHtml('<p>one</p><p>two</p>')).toBe('one<br>two')
  })

  it('drops scripts and images', () => {
    expect(sanitizePastedHtml('x<script>evil()</script><img src="a">y')).toBe('xy')
  })
})

describe('pastedTextToHtml', () => {
  it('escapes markup and keeps line breaks', () => {
    expect(pastedTextToHtml('a <b> c\nd')).toBe('a &lt;b&gt; c<br>d')
  })
})
