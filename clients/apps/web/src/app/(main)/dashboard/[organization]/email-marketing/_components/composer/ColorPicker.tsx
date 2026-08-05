'use client'

// Real color picker — uses react-colorful's saturation/value square +
// hue slider. Same prop interface (value, onChange, optional label) so
// callers don't change.

import { HexColorPicker } from 'react-colorful'
import { useEffect, useState } from 'react'

export function ColorPicker({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (color: string) => void
  label?: string
}) {
  // Keep the hex input in lockstep with the picker but allow free typing
  // (so a half-typed "#abc" doesn't fight the slider). Commit only when
  // the value parses as a valid 3- or 6-digit hex.
  const [hex, setHex] = useState(value)
  useEffect(() => setHex(value), [value])

  const onHexInput = (raw: string) => {
    const clean = raw.replace(/[^0-9a-fA-F]/g, '').slice(0, 6)
    setHex('#' + clean)
    if (clean.length === 3 || clean.length === 6) onChange('#' + clean)
  }

  return (
    <div className="cp-root" onMouseDown={(e) => e.stopPropagation()}>
      {label && <div className="cp-label">{label}</div>}
      <HexColorPicker color={value} onChange={onChange} />
      <label className="cp-hex">
        <span>#</span>
        <input
          value={hex.replace(/^#/, '')}
          placeholder="000000"
          maxLength={6}
          onChange={(e) => onHexInput(e.target.value)}
          spellCheck={false}
        />
      </label>
    </div>
  )
}
