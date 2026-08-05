import {
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
} from 'react'

/**
 * Primitive that wraps a contentEditable element with stable text-syncing.
 *
 * Why this exists: rendering `{value}` as a JSX child of a contentEditable
 * triggers a DOM diff on every parent re-render, which wipes mid-edit text
 * and resets the caret to position 0. Every text-bearing block in the email
 * editor (heading, paragraph, button label, badge, eyebrow, list items, etc.)
 * was hitting this. We mount the value imperatively via a ref, only re-syncing
 * when the *outside* value changes (template insert, duplicate, undo/redo),
 * never on each keystroke.
 *
 * Multiline blocks (paragraphs, list items) should pass `multiline` so we use
 * `innerText` (preserves newlines from <br>/<div> the browser inserts on
 * Enter) instead of `textContent` (collapses everything to one line).
 */
export function EditableText({
  value,
  onChange,
  multiline = false,
  as: Tag = 'div',
  placeholder,
  style,
  className,
  ariaLabel,
  onKeyDown,
}: {
  value: string
  onChange: (next: string) => void
  multiline?: boolean
  as?: 'div' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'span' | 'a' | 'li'
  placeholder?: string
  style?: CSSProperties
  className?: string
  ariaLabel?: string
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void
}) {
  const ref = useRef<HTMLElement | null>(null)

  // Sync external value → DOM only when it actually differs. The initial
  // mount also lands here because the ref runs before this effect.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const current = multiline ? (el.innerText ?? '') : (el.textContent ?? '')
    if (current !== (value ?? '')) {
      if (multiline) {
        el.innerText = value ?? ''
      } else {
        el.textContent = value ?? ''
      }
    }
  }, [value, multiline])

  const handleInput = useCallback(() => {
    const el = ref.current
    if (!el) return
    const next = multiline ? (el.innerText ?? '') : (el.textContent ?? '')
    onChange(next)
  }, [multiline, onChange])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLElement>) => {
    // Strip rich HTML on paste — we don't render styled HTML in blocks,
    // and unsanitized pastes were a footgun for both UX (weird styles
    // showing up) and security (raw <script>/<style> content sitting in
    // the DOM until blur).
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
    handleInput()
  }, [handleInput])

  const isEmpty = !value || value.length === 0
  const placeholderStyle: CSSProperties =
    isEmpty && placeholder
      ? {
          // Render placeholder as a CSS pseudo via a data attr so it
          // never enters the editable DOM (and never gets typed into).
        }
      : {}

  // Use a renderer that supports h1-h4, p, div, span, a, li.
  const Element = Tag as 'div'
  return (
    <Element
      ref={ref as React.RefObject<HTMLDivElement>}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline={multiline ? true : undefined}
      data-placeholder={placeholder ?? undefined}
      data-empty={isEmpty ? '' : undefined}
      onInput={handleInput}
      onBlur={handleInput}
      onPaste={handlePaste}
      onKeyDown={onKeyDown}
      className={className}
      style={{
        outline: 'none',
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
        ...placeholderStyle,
        ...style,
      }}
    />
  )
}
