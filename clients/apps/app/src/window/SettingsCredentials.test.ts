// The Credentials Store's password field (the review of step 6f, M1): no
// password field for the browser's own password manager to take the sheet
// for a sign-in or sign-up by, its words masked while hidden; a password
// field only where the browser can't mask a text field.

import { describe, expect, it } from 'vitest'
import { secretFieldShape } from './SettingsCredentials'

describe('the password field’s shape', () => {
  it('is a text field, masked while hidden, never filled by the browser', () => {
    expect(secretFieldShape(false, true)).toEqual({
      type: 'text',
      masked: true,
      autoComplete: 'off',
    })
    expect(secretFieldShape(true, true)).toEqual({
      type: 'text',
      masked: false,
      autoComplete: 'off',
    })
  })

  it('is a password field while hidden only where a text field can’t be masked', () => {
    expect(secretFieldShape(false, false)).toEqual({
      type: 'password',
      masked: false,
      autoComplete: 'new-password',
    })
    expect(secretFieldShape(true, false).type).toBe('text')
  })
})
