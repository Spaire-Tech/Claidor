import { describe, expect, it } from 'vitest'
import { scoped } from '../../scripts/theme-css.mjs'

describe('the chosen theme in the stylesheets', () => {
  it('puts the condition on the root without changing a rule’s weight', () => {
    expect(scoped(':root', ':not([data-theme="light"])')).toBe(
      ':root:where(:not([data-theme="light"]))',
    )
    expect(scoped('html body', '[data-theme="dark"]')).toBe(
      'html:where([data-theme="dark"]) body',
    )
    expect(scoped('.chat-header .title', '[data-theme="dark"]')).toBe(
      ':where(:root[data-theme="dark"]) .chat-header .title',
    )
  })

  it('leaves a class that only starts like the root alone', () => {
    expect(scoped('.html-preview', '[data-theme="dark"]')).toBe(
      ':where(:root[data-theme="dark"]) .html-preview',
    )
    expect(scoped('html-like', '[data-theme="dark"]')).toBe(
      ':where(:root[data-theme="dark"]) html-like',
    )
  })
})
