import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { App } from './App'

describe('App', () => {
  it('shows the mark from the folder the app is served from', () => {
    const page = renderToStaticMarkup(<App />)
    expect(page).toContain(`src="${import.meta.env.BASE_URL}favicon.svg"`)
  })
})
