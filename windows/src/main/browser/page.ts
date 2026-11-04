// What runs inside an agent's page (docs/app-browser/protocol.md): the
// outline of the page with a ref for each control, finding a ref again,
// filling a field, choosing in a list, a highlight. It runs in a world of
// its own (`executeJavaScriptInIsolatedWorld`), which shares the page's
// document but not its scripts: the page can neither read the refs nor
// change them. A navigation empties that world, and every ref with it.

/** The world the helper runs in (any number the app itself doesn't use). */
export const helperWorld = 1_001

/** The helper, installed once per document; every call goes through `globalThis.__simeonPage`. */
const helperSource = String.raw`
(() => {
  if (globalThis.__simeonPage) return
  const state = { generation: 0, refs: new Map() }

  const interactiveRoles = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'listbox', 'textbox', 'searchbox', 'slider', 'spinbutton', 'treeitem'])
  const shownRoles = new Set(['heading', 'img', 'list', 'listitem', 'table', 'row', 'cell', 'columnheader', 'rowheader', 'dialog', 'alertdialog', 'alert', 'navigation', 'main', 'form', 'banner', 'contentinfo', 'region', 'group', 'tablist', 'tabpanel', 'menu', 'menubar', 'toolbar', 'status'])
  const skipped = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD', 'META', 'LINK', 'BR', 'WBR'])

  const squash = (text, max) => {
    const flat = String(text || '').replace(/\s+/g, ' ').trim()
    return flat.length > max ? flat.slice(0, max - 1) + '…' : flat
  }
  const quote = (text) => JSON.stringify(text)

  function implicitRole(el) {
    const tag = el.tagName
    if (tag === 'A' || tag === 'AREA') return el.hasAttribute('href') ? 'link' : ''
    if (tag === 'BUTTON' || tag === 'SUMMARY') return 'button'
    if (tag === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase()
      if (type === 'hidden') return ''
      if (type === 'checkbox') return 'checkbox'
      if (type === 'radio') return 'radio'
      if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) return 'button'
      if (type === 'range') return 'slider'
      if (type === 'number') return 'spinbutton'
      if (type === 'search') return 'searchbox'
      return 'textbox'
    }
    if (tag === 'SELECT') return el.multiple || el.size > 1 ? 'listbox' : 'combobox'
    if (tag === 'TEXTAREA') return 'textbox'
    if (tag === 'OPTION') return 'option'
    if (tag === 'IMG') return el.getAttribute('alt') ? 'img' : ''
    if (/^H[1-6]$/.test(tag)) return 'heading'
    if (tag === 'NAV') return 'navigation'
    if (tag === 'MAIN') return 'main'
    if (tag === 'FORM') return 'form'
    if (tag === 'TABLE') return 'table'
    if (tag === 'TR') return 'row'
    if (tag === 'TH') return 'columnheader'
    if (tag === 'TD') return 'cell'
    if (tag === 'UL' || tag === 'OL') return 'list'
    if (tag === 'LI') return 'listitem'
    if (tag === 'DIALOG') return 'dialog'
    if (tag === 'IFRAME' || tag === 'FRAME') return 'frame'
    if (el.isContentEditable && (el.parentElement === null || !el.parentElement.isContentEditable)) return 'textbox'
    return ''
  }

  function roleOf(el) {
    const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0]
    return explicit && explicit !== 'presentation' && explicit !== 'none' ? explicit : implicitRole(el)
  }

  function isInteractive(el, role) {
    if (interactiveRoles.has(role)) return true
    if (el.hasAttribute('onclick')) return true
    if (el.hasAttribute('tabindex') && el.tabIndex >= 0 && role !== '' && !shownRoles.has(role)) return true
    return false
  }

  function textOfIds(el, attribute) {
    const ids = (el.getAttribute(attribute) || '').split(/\s+/).filter(Boolean)
    return ids.map((id) => el.ownerDocument.getElementById(id)).filter(Boolean).map((one) => one.innerText || one.textContent || '').join(' ')
  }

  function nameOf(el, role) {
    const label = el.getAttribute('aria-label')
    if (label && label.trim()) return squash(label, 100)
    const labelled = textOfIds(el, 'aria-labelledby')
    if (labelled.trim()) return squash(labelled, 100)
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      const type = (el.getAttribute('type') || '').toLowerCase()
      if (tag === 'INPUT' && ['button', 'submit', 'reset'].includes(type)) return squash(el.value || type, 100)
      if (el.labels && el.labels.length > 0) return squash(el.labels[0].innerText || el.labels[0].textContent, 100)
      const hint = el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || ''
      return squash(hint, 100)
    }
    if (tag === 'IMG') return squash(el.getAttribute('alt'), 100)
    if (role === 'frame') {
      try { return new URL(el.src, location.href).host } catch { return '' }
    }
    // Controls, headings and options are named by their words; a list item or a cell keeps its words below it, whole.
    if (interactiveRoles.has(role) || role === 'heading' || role === 'option' || el.hasAttribute('onclick'))
      return squash(el.innerText || el.textContent || el.getAttribute('title'), 100)
    return squash(el.getAttribute('title'), 100)
  }

  function statesOf(el, role) {
    const out = []
    const tag = el.tagName
    if (role === 'heading') {
      const level = /^H([1-6])$/.exec(tag)
      out.push('[level=' + (level ? level[1] : (el.getAttribute('aria-level') || '2')) + ']')
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      const type = (el.getAttribute('type') || '').toLowerCase()
      if (type === 'checkbox' || type === 'radio') { if (el.checked) out.push('[checked]') }
      else if (type === 'password') { if (el.value) out.push('[value hidden]') }
      else if (type === 'file') { if (el.files && el.files.length) out.push('[files=' + el.files.length + ']') }
      else if (!['button', 'submit', 'reset', 'image'].includes(type) && el.value) out.push('[value=' + quote(squash(el.value, 80)) + ']')
    } else if (tag === 'SELECT') {
      const chosen = Array.from(el.selectedOptions || []).map((option) => squash(option.label || option.text, 60))
      if (chosen.length) out.push('[value=' + quote(chosen.join(', ')) + ']')
    } else if (el.isContentEditable && role === 'textbox') {
      const value = squash(el.innerText, 80)
      if (value) out.push('[value=' + quote(value) + ']')
    }
    if (el.getAttribute('aria-checked') === 'true') out.push('[checked]')
    if (el.getAttribute('aria-selected') === 'true' || (tag === 'OPTION' && el.selected)) out.push('[selected]')
    if (el.getAttribute('aria-expanded') === 'true') out.push('[expanded]')
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') out.push('[disabled]')
    return out.join(' ')
  }

  function visible(el) {
    if (el.hidden) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkVisibilityCSS: true })
    const style = el.ownerDocument.defaultView.getComputedStyle(el)
    return style.display !== 'none' && style.visibility !== 'hidden'
  }

  function outline(options) {
    state.generation += 1
    state.refs = new Map()
    const maxChars = options.maxChars || 20000
    const maxRefs = options.maxRefs || 500
    const maxDepth = typeof options.maxDepth === 'number' ? Math.max(1, Math.min(60, options.maxDepth)) : 40
    const onlyControls = options.interactive === true
    const lines = []
    let chars = 0
    let full = false
    let refCount = 0
    const add = (depth, line) => {
      if (full) return false
      const text = '  '.repeat(depth) + line
      if (chars + text.length > maxChars) { full = true; return false }
      lines.push(text)
      chars += text.length + 1
      return true
    }
    const walkChildren = (parent, depth, inControl) => {
      const children = parent.shadowRoot ? [...parent.shadowRoot.childNodes, ...parent.childNodes] : parent.childNodes
      for (const child of children) {
        if (full) return
        walk(child, depth, inControl)
      }
    }
    const walk = (node, depth, inControl) => {
      if (full || depth > maxDepth) return
      if (node.nodeType === 3) {
        if (onlyControls || inControl) return
        const text = squash(node.textContent, 200)
        if (text.length > 1) add(depth, '- text: ' + quote(text))
        return
      }
      if (node.nodeType !== 1) return
      const el = node
      if (skipped.has(el.tagName)) return
      if (!visible(el)) return
      const role = roleOf(el)
      const control = isInteractive(el, role)
      if (role === 'frame') {
        let doc = null
        try { doc = el.contentDocument } catch { doc = null }
        const host = nameOf(el, role)
        if (!doc || !doc.body) { add(depth, '- frame ' + quote(host) + ' (its page can\'t be read here; use browser_mouse_click_xy on the screenshot)'); return }
        add(depth, '- frame ' + quote(host))
        walk(doc.body, depth + 1, false)
        return
      }
      if (control || (!onlyControls && shownRoles.has(role)) || (onlyControls && role === 'heading')) {
        let line = '- ' + role
        const name = nameOf(el, role)
        if (name) line += ' ' + quote(name)
        const states = statesOf(el, role)
        if (states) line += ' ' + states
        if (control && refCount < maxRefs) {
          refCount += 1
          const ref = 'e' + refCount
          state.refs.set(ref, el)
          line += ' [ref=' + ref + ']'
        }
        if (!add(depth, line)) return
        if (el.tagName === 'SELECT') return
        // A heading's words are its name: not said twice.
        walkChildren(el, depth + 1, inControl || control || role === 'heading')
        return
      }
      walkChildren(el, depth, inControl)
    }
    let root = document.body || document.documentElement
    if (typeof options.selector === 'string' && options.selector.length > 0) {
      try { root = document.querySelector(options.selector) } catch { return { error: 'The selector ' + quote(options.selector) + ' is not one the page understands.' } }
      if (!root) return { error: 'Nothing on the page matches ' + quote(options.selector) + '.' }
    }
    if (root) walk(root, 0, false)
    if (full) lines.push('- … the page goes on: scroll and read again, or pass a selector')
    if (refCount >= maxRefs) lines.push('- … more controls than refs: pass a selector to read one part')
    return { text: lines.join('\n'), refs: refCount }
  }

  function element(ref) {
    const el = state.refs.get(String(ref))
    if (!el || !el.isConnected) return { error: String(ref) + ' isn\'t on the page any more; take a fresh browser_snapshot.' }
    return { el }
  }

  /** Where an element is on the screen, the frames it is in added up. */
  function rectOf(el) {
    const rect = el.getBoundingClientRect()
    let left = rect.left
    let top = rect.top
    let win = el.ownerDocument.defaultView
    while (win && win !== window) {
      const owner = win.frameElement
      if (!owner) break
      const outer = owner.getBoundingClientRect()
      left += outer.left + owner.clientLeft
      top += outer.top + owner.clientTop
      win = owner.ownerDocument.defaultView
    }
    return { left, top, width: rect.width, height: rect.height }
  }

  function describe(el) {
    if (!el) return 'nothing'
    const role = roleOf(el)
    const name = nameOf(el, role) || squash(el.innerText, 60)
    return (role || el.tagName.toLowerCase()) + (name ? ' ' + quote(name) : '')
  }

  function locate(ref, offsetX, offsetY) {
    const found = element(ref)
    if (found.error) return found
    const el = found.el
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const rect = rectOf(el)
    if (rect.width < 1 && rect.height < 1) return { error: String(ref) + ' is on the page but has no size; take a fresh browser_snapshot.' }
    const x = rect.left + (typeof offsetX === 'number' ? offsetX : rect.width / 2)
    const y = rect.top + (typeof offsetY === 'number' ? offsetY : rect.height / 2)
    const result = { x: Math.round(x), y: Math.round(y), left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return { ...result, covered: 'the edge of the window' }
    let hit = document.elementFromPoint(x, y)
    // Into same-site frames, down to what is under the point there.
    let doc = document
    let px = x
    let py = y
    while (hit && (hit.tagName === 'IFRAME' || hit.tagName === 'FRAME')) {
      let inner = null
      try { inner = hit.contentDocument } catch { inner = null }
      if (!inner) break
      const outer = hit.getBoundingClientRect()
      px -= outer.left + hit.clientLeft
      py -= outer.top + hit.clientTop
      doc = inner
      hit = inner.elementFromPoint(px, py)
    }
    const fine = !hit || hit === el || el.contains(hit) || hit.contains(el) || (hit.tagName === 'LABEL' && hit.control === el)
    return fine ? result : { ...result, covered: describe(hit) }
  }

  function focus(ref, clear) {
    const found = element(ref)
    if (found.error) return found
    const el = found.el
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    el.focus({ preventScroll: true })
    if (clear) {
      if (typeof el.select === 'function' && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) el.select()
      else if (el.isContentEditable) {
        const range = el.ownerDocument.createRange()
        range.selectNodeContents(el)
        const selection = el.ownerDocument.defaultView.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      }
    }
    const active = el.ownerDocument.activeElement
    return { focused: active === el || el.contains(active), editable: el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable }
  }

  function setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
    setter.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function fill(ref, value) {
    const found = element(ref)
    if (found.error) return found
    const el = found.el
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    if (el.disabled) return { error: String(ref) + ' is disabled.' }
    if (el.tagName === 'SELECT') return { error: String(ref) + ' is a list: use browser_select_option.' }
    if (el.tagName === 'INPUT' && ['checkbox', 'radio'].includes((el.type || '').toLowerCase())) {
      const on = !['false', 'off', 'no', '0', ''].includes(String(value).toLowerCase())
      if (el.checked !== on) el.click()
      return { filled: on ? 'checked' : 'unchecked' }
    }
    if (el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'file') return { error: String(ref) + ' takes files: use browser_upload_file.' }
    el.focus({ preventScroll: true })
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      setValue(el, String(value))
      return { filled: 'value' }
    }
    if (el.isContentEditable) {
      const range = el.ownerDocument.createRange()
      range.selectNodeContents(el)
      const selection = el.ownerDocument.defaultView.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      return { filled: 'editable', typeHere: true }
    }
    return { error: String(ref) + ' is not a field that takes a value.' }
  }

  function choose(ref, values) {
    const found = element(ref)
    if (found.error) return found
    const el = found.el
    if (el.tagName !== 'SELECT') return { error: String(ref) + ' is not a list; click it and pick the option from a fresh browser_snapshot.' }
    const wanted = values.map((value) => String(value).trim())
    const options = Array.from(el.options)
    const picked = []
    for (const want of wanted) {
      const option = options.find((one) => one.value === want) || options.find((one) => squash(one.label || one.text, 200) === want) || options.find((one) => squash(one.label || one.text, 200).toLowerCase() === want.toLowerCase())
      if (!option) return { error: 'The list has no ' + quote(want) + '. It has: ' + options.slice(0, 20).map((one) => quote(squash(one.label || one.text, 60))).join(', ') + (options.length > 20 ? ', …' : '') + '.' }
      picked.push(option)
    }
    if (!el.multiple && picked.length > 1) return { error: 'The list takes one choice.' }
    for (const option of options) option.selected = picked.includes(option)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { chosen: picked.map((option) => squash(option.label || option.text, 60)) }
  }

  function box(ref) {
    const found = element(ref)
    if (found.error) return found
    const rect = rectOf(found.el)
    return { x: Math.round(rect.left), y: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
  }

  function highlight(ref, ms) {
    const found = element(ref)
    if (found.error) return found
    found.el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    const rect = rectOf(found.el)
    const mark = document.createElement('div')
    mark.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #0a84ff;border-radius:4px;background:rgba(10,132,255,0.12);left:' + (rect.left - 3) + 'px;top:' + (rect.top - 3) + 'px;width:' + rect.width + 'px;height:' + rect.height + 'px'
    document.documentElement.appendChild(mark)
    setTimeout(() => mark.remove(), Math.max(200, Math.min(10000, ms || 2000)))
    return { highlighted: describe(found.el) }
  }

  /** A file field, marked so the main process can find it once (a selector on a one-time attribute). */
  function markFileField(ref, token) {
    const found = element(ref)
    if (found.error) return found
    const el = found.el
    const isField = el.tagName === 'INPUT' && (el.type || '').toLowerCase() === 'file'
    if (isField && el.ownerDocument === document) el.setAttribute('data-simeon-file', token)
    return { isField, inFrame: el.ownerDocument !== document }
  }

  function unmark(token) {
    for (const el of document.querySelectorAll('[data-simeon-file="' + token + '"]')) el.removeAttribute('data-simeon-file')
    return {}
  }

  function page() {
    const root = document.documentElement
    return { scrollX: Math.round(window.scrollX), scrollY: Math.round(window.scrollY), width: root.scrollWidth, height: root.scrollHeight, innerWidth: window.innerWidth, innerHeight: window.innerHeight }
  }

  function scrollTo(ref) {
    const found = element(ref)
    if (found.error) return found
    found.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' })
    return { scrolled: describe(found.el) }
  }

  function describeRef(ref) {
    const found = element(ref)
    return found.error ? found : { described: describe(found.el) }
  }

  globalThis.__simeonPage = { outline, locate, focus, fill, choose, box, highlight, markFileField, unmark, page, scrollTo, describeRef, generation: () => state.generation }
})()
`

/** A call to the helper, as one script: the helper installed if it isn't, then the call, its arguments as JSON. */
export function helperCall(method: string, ...args: unknown[]): string {
  return `${helperSource};globalThis.__simeonPage.${method}(...${JSON.stringify(args)})`
}
