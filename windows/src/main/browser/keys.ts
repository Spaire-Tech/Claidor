// Keys as Chromium's DevTools protocol takes them (`Input.dispatchKeyEvent`):
// a name the agent writes ("Enter", "ArrowDown", "Control+A", "a") becomes
// its key, code, Windows key code and text, and the modifiers held with it.

export interface KeyPress {
  key: string
  code: string
  keyCode: number
  /** The character it types, when it types one. */
  text?: string
  /** Alt 1, Control 2, Meta 4, Shift 8 (the protocol's bits). */
  modifiers: number
}

const named: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
  enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  return: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
  tab: { key: 'Tab', code: 'Tab', keyCode: 9 },
  escape: { key: 'Escape', code: 'Escape', keyCode: 27 },
  esc: { key: 'Escape', code: 'Escape', keyCode: 27 },
  backspace: { key: 'Backspace', code: 'Backspace', keyCode: 8 },
  delete: { key: 'Delete', code: 'Delete', keyCode: 46 },
  space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  ' ': { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
  arrowup: { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
  arrowdown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
  arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
  arrowright: { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
  home: { key: 'Home', code: 'Home', keyCode: 36 },
  end: { key: 'End', code: 'End', keyCode: 35 },
  pageup: { key: 'PageUp', code: 'PageUp', keyCode: 33 },
  pagedown: { key: 'PageDown', code: 'PageDown', keyCode: 34 },
  insert: { key: 'Insert', code: 'Insert', keyCode: 45 },
}
for (let n = 1; n <= 12; n += 1) named[`f${n}`] = { key: `F${n}`, code: `F${n}`, keyCode: 111 + n }

const modifierBits: Record<string, number> = {
  alt: 1,
  option: 1,
  control: 2,
  ctrl: 2,
  meta: 4,
  cmd: 4,
  command: 4,
  shift: 8,
}

/** One character's key: letters and digits by their own codes, anything else as typed text. */
function characterKey(character: string): { key: string; code: string; keyCode: number; text: string } {
  const upper = character.toUpperCase()
  if (/^[a-z]$/i.test(character)) return { key: character, code: `Key${upper}`, keyCode: upper.charCodeAt(0), text: character }
  if (/^[0-9]$/.test(character)) return { key: character, code: `Digit${character}`, keyCode: character.charCodeAt(0), text: character }
  return { key: character, code: '', keyCode: 0, text: character }
}

/** The agent's key, read; undefined when it names none. */
export function readKey(name: string): KeyPress | undefined {
  const trimmed = name.length === 1 ? name : name.trim()
  if (trimmed.length === 0) return undefined
  const parts = trimmed.length > 1 ? trimmed.split('+') : [trimmed]
  // "Control++" means Control and "+".
  if (trimmed.endsWith('++')) parts.splice(parts.length - 2, 2, '+')
  let modifiers = 0
  for (const part of parts.slice(0, -1)) {
    const bit = modifierBits[part.trim().toLowerCase()]
    if (bit === undefined) return undefined
    modifiers |= bit
  }
  const last = parts.at(-1) ?? ''
  const lower = last.toLowerCase()
  const base = named[lower] ?? (([...last].length === 1) ? characterKey(last) : undefined)
  if (!base) return undefined
  // With Control, Alt or Meta held a key is a shortcut: it types nothing.
  const types = (modifiers & 7) === 0
  const text = types ? (modifiers & 8 && base.text ? base.text.toUpperCase() : base.text) : undefined
  return { key: base.key, code: base.code, keyCode: base.keyCode, ...(text === undefined ? {} : { text }), modifiers }
}
