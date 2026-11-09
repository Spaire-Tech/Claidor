/**
 * A form's parts, as the Mac's (`FormField`, `FormButton` in
 * mac/Simeon/SettingsParts.swift; the founder, 9 November 2026: a label on
 * the left and "Optional" on the right was "very confusing"; another app's
 * form, "how grok bot does it", is "what makes sense"): each field's name
 * over its box; capsule buttons at the foot.
 */
import type { ReactNode } from 'react'
import { classes } from './classes'
import './FormParts.css'

/** A field: its name over its box (whatever is put in it), a note under it. */
export function FormField({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: ReactNode
}) {
  return (
    <label className="form-field">
      <span className="form-label">{label}</span>
      <span className="form-box">{children}</span>
      {note !== undefined && note !== '' && (
        <span className="form-note">{note}</span>
      )}
    </label>
  )
}

/** A choice of many (a country): the system's own menu in the field's box, "Choose" in grey until one is chosen. */
export function FormSelect({
  label,
  options,
  value,
  placeholder,
  pick,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  placeholder: string
  pick: (value: string) => void
}) {
  return (
    <FormField label={label}>
      <select
        className={classes(value === '' && 'unchosen')}
        value={value}
        onChange={(event) => pick(event.target.value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        className="form-chevron"
        width="10"
        height="10"
        viewBox="0 0 10 10"
        aria-hidden="true"
      >
        <path
          d="M2 3.5 5 6.5l3-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </FormField>
  )
}

/** A capsule at a form's foot: the main one in the ink, the others grey, one that takes something away in red. */
export function FormButton({
  kind = 'secondary',
  busy = false,
  disabled = false,
  onClick,
  children,
}: {
  kind?: 'primary' | 'secondary' | 'destructive'
  busy?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={classes('form-button', kind !== 'secondary' && kind)}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy && <span className="form-wheel" aria-hidden="true" />}
      {children}
    </button>
  )
}
