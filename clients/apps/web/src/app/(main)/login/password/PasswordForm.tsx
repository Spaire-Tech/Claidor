'use client'

import { field, primary } from '@/components/Auth/parts'
import { CONFIG } from '@/utils/config'
import { useState, type FormEvent } from 'react'

// The password form: a plain POST to the API (`/v1/login-password/authenticate`),
// as the code's form posts its code, so the browser gets its session cookie
// and goes on to `return_to`; a refusal comes back here with `error`.
const PasswordForm = ({
  email,
  return_to,
  error,
}: {
  email: string
  return_to?: string
  error?: string
}) => {
  const [address, setAddress] = useState(email)
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const query = new URLSearchParams(return_to ? { return_to } : {})

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!address.trim() || !password) {
      event.preventDefault()
      return
    }
    setLoading(true)
  }

  return (
    <form
      className="flex flex-col gap-3"
      action={`${CONFIG.BASE_URL}/v1/login-password/authenticate?${query}`}
      method="POST"
      onSubmit={onSubmit}
    >
      {email ? (
        <input type="hidden" name="email" value={address} />
      ) : (
        <>
          <label htmlFor="sign-in-email" className="sr-only">
            Email
          </label>
          <input
            id="sign-in-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            placeholder="Enter your email"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className={field}
          />
        </>
      )}
      <label htmlFor="sign-in-password" className="sr-only">
        Password
      </label>
      <input
        id="sign-in-password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        autoFocus
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className={field}
      />
      {error ? (
        <p
          role="alert"
          className="text-center text-[14px] leading-[1.45] text-[#c21d2e]"
        >
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={loading} className={primary}>
        {loading ? 'Signing in…' : 'Continue'}
      </button>
      <p className="text-center text-[13px] leading-[1.45] text-[#86868b]">
        No password yet? Use a code, then set one in the Simeon app under
        Settings › Account.
      </p>
    </form>
  )
}

export default PasswordForm
