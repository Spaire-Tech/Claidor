// Behaviour tests for the design editor's save model — the part that used to
// lie. The "Saved" status was previously a 700ms animation with no persistence,
// so edits were lost on Back. These assert that real autosave fires (debounced),
// flushes on destroy, and that the trigger switcher is disabled when locked.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditor } from './emailEngine'
import { SHELL_HTML } from './shellMarkup'

function mount() {
  const root = document.createElement('div')
  root.innerHTML = SHELL_HTML
  document.body.appendChild(root)
  return root
}

describe('design editor autosave', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('autosaves (debounced) after an edit and reports the real state', () => {
    const root = mount()
    const onAutosave = vi.fn()
    const handle = createEditor(root, { initialTrigger: 'enrolment', onAutosave })

    // Edit the first editable text node in the canvas.
    const editable = root.querySelector('#email [data-edit]') as HTMLElement | null
    expect(editable).not.toBeNull()
    editable!.innerHTML = 'Edited copy'
    editable!.dispatchEvent(new Event('input', { bubbles: true }))

    // Debounced — not yet, then fires after the window elapses.
    expect(onAutosave).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(onAutosave).toHaveBeenCalledTimes(1)
    const payload = onAutosave.mock.calls[0][0]
    expect(payload).toHaveProperty('html')
    expect(payload).toHaveProperty('json')
    expect(payload.json.version).toBe(3)

    handle.destroy()
  })

  it('flushes a pending edit on destroy so nothing is lost on close', () => {
    const root = mount()
    const onAutosave = vi.fn()
    const handle = createEditor(root, { initialTrigger: 'enrolment', onAutosave })

    const editable = root.querySelector('#email [data-edit]') as HTMLElement | null
    editable!.innerHTML = 'Edited copy'
    editable!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(onAutosave).not.toHaveBeenCalled()

    // Close before the debounce window — the flush must still persist it.
    handle.destroy()
    expect(onAutosave).toHaveBeenCalledTimes(1)
  })
})

describe('design editor trigger lock', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens the template switcher when unlocked', () => {
    const root = mount()
    const handle = createEditor(root, { initialTrigger: 'enrolment' })
    ;(root.querySelector('#crumbBtn') as HTMLElement).click()
    expect(root.querySelector('.trig-menu')).not.toBeNull()
    handle.destroy()
  })

  it('does NOT open the switcher when locked (sequence owns the trigger)', () => {
    const root = mount()
    const handle = createEditor(root, { initialTrigger: 'enrolment', lockTrigger: true })
    ;(root.querySelector('#crumbBtn') as HTMLElement).click()
    expect(root.querySelector('.trig-menu')).toBeNull()
    // …and the now-inert caret is hidden.
    expect((root.querySelector('.tb-caret') as HTMLElement).style.display).toBe('none')
    handle.destroy()
  })
})
