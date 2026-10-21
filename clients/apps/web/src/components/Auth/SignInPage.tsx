'use client'

import AuthShell, { Legal } from '@/components/Auth/AuthShell'
import { Or, field, primary, provider } from '@/components/Auth/parts'
import { LoginCodeError, useSendLoginCode } from '@/hooks/loginCode'
import { usePostHog, type EventName } from '@/hooks/posthog'
import { getAppleAuthorizeURL, getGoogleAuthorizeLoginURL } from '@/utils/auth'
import { useTranslations, type AcceptedLocale } from '@simeon/i18n'
import { useEffect, useMemo, useState, type FormEvent } from 'react'

// The web app's sign-in and sign-up, after Claude's (the founder, 18
// October 2026: "with continue with apple, google, email etc. just remove
// the download mac"): the heading and its line in the website's serif, then
// one card with Continue with Google, Continue with Apple, "OR", the e-mail
// and Continue with email, and the Terms and Privacy line. Each way comes
// back to `returnTo`; from the Mac app that is its own sign-in link on the
// API (`/loginDeepControl`), which then asks "Continue as …" and hands the
// app its session. The e-mail way sends a six-character code
// (`/login/code/verify`), where Continue with password goes to the account's
// password instead (`/login/password`, 19 October 2026, as the iPhone's Log in
// or sign up). The photo and the phone's single column are the frame's
// (AuthShell).
export const GoogleMark = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 48 48"
    width="20"
    height="20"
    aria-hidden="true"
  >
    <path
      fill="#FFC107"
      d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"
    />
    <path
      fill="#FF3D00"
      d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"
    />
  </svg>
)

const AppleMark = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
    <path
      fill="currentColor"
      d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.39.81 1.4-.02 2.29-1.27 3.14-2.52.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.73-1.05-2.74-4.14zM13.79 4.97c.72-.87 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.77-1.24 1.99-1.09 3.17 1.15.09 2.32-.58 3.04-1.45z"
    />
  </svg>
)

/** Why a way in came back without signing in (`?error=`), in the page's own words. */
const PROBLEMS: Record<string, 'simeon.signIn.appleUnavailable'> = {
  apple_unavailable: 'simeon.signIn.appleUnavailable',
}

const SignInPage = ({
  mode,
  returnTo,
  returnParams,
  error,
  locale,
}: {
  mode: 'login' | 'signup'
  returnTo?: string
  returnParams?: Record<string, string>
  error?: string
  /** The page's language (`pageLocale`). */
  locale: AcceptedLocale
}) => {
  const t = useTranslations(locale)
  const posthog = usePostHog()
  const signup = mode === 'signup'
  const sendLoginCode = useSendLoginCode()
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | undefined>(
    error ? t(PROBLEMS[error] ?? 'simeon.signIn.didNotGoThrough') : undefined,
  )

  const resolvedReturnTo = useMemo(() => {
    const path = returnTo ?? '/app'
    if (returnParams) {
      const params = new URLSearchParams(returnParams)
      if (params.size) return `${path}?${params}`
    }
    return path
  }, [returnTo, returnParams])

  useEffect(() => {
    const event: EventName = signup
      ? 'global:user:signup:view'
      : 'global:user:login:view'
    posthog.capture(event, { returnTo: resolvedReturnTo })
  }, [posthog, resolvedReturnTo, signup])

  const attribution = signup ? JSON.stringify({ intent: 'creator' }) : undefined
  const googleUrl = getGoogleAuthorizeLoginURL({
    return_to: resolvedReturnTo,
    ...(attribution ? { attribution } : {}),
  })
  const appleUrl = getAppleAuthorizeURL({
    return_to: resolvedReturnTo,
    ...(attribution ? { attribution } : {}),
  })

  const submitted = (method: 'google' | 'apple' | 'code') =>
    posthog.capture(
      signup ? 'global:user:signup:submit' : 'global:user:login:submit',
      { method },
    )

  const sendCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const address = email.trim()
    if (!address || sending) return
    setSending(true)
    setProblem(undefined)
    submitted('code')
    try {
      await sendLoginCode(
        address,
        resolvedReturnTo,
        signup ? { intent: 'creator' } : undefined,
      )
    } catch (e) {
      const detail = e instanceof LoginCodeError ? e.error?.[0]?.msg : undefined
      setProblem(
        detail
          ? t('simeon.signIn.invalidEmail')
          : t('simeon.signIn.couldNotSend'),
      )
      setSending(false)
    }
  }

  return (
    <AuthShell
      heading={t('simeon.signIn.heading')}
      line={t('simeon.signIn.line')}
      locale={locale}
    >
      <div className="flex flex-col gap-3">
        <a
          href={googleUrl}
          onClick={() => submitted('google')}
          className={provider}
        >
          <GoogleMark />
          <span>{t('simeon.signIn.continueWithGoogle')}</span>
        </a>
        <a
          href={appleUrl}
          onClick={() => submitted('apple')}
          className={provider}
        >
          <AppleMark />
          <span>{t('simeon.signIn.continueWithApple')}</span>
        </a>
        <Or locale={locale} />
        <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
          <label htmlFor="sign-in-email" className="sr-only">
            {t('simeon.signIn.email')}
          </label>
          <input
            id="sign-in-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder={t('simeon.signIn.enterEmail')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={field}
          />
          <button type="submit" disabled={sending} className={primary}>
            {sending
              ? t('simeon.signIn.sendingCode')
              : t('simeon.signIn.continueWithEmail')}
          </button>
        </form>
        {problem ? (
          <p
            role="alert"
            className="text-center text-[13px] leading-[1.45] text-[#c21d2e]"
          >
            {problem}
          </p>
        ) : null}
        <div className="pt-2">
          <Legal locale={locale} />
        </div>
      </div>
    </AuthShell>
  )
}

export default SignInPage
