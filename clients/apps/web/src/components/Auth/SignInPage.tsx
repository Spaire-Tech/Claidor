'use client'

import LogoType from '@/components/Brand/LogoType'
import { usePostHog, type EventName } from '@/hooks/posthog'
import { getGoogleAuthorizeLoginURL } from '@/utils/auth'
import Link from 'next/link'
import { useEffect, useMemo } from 'react'

// The web app's sign-in and sign-up (4 October 2026, the founder: "based
// on our website design. something simple like cursor. but in light.
// SimeonLabs up there, google only for now"). Where the Mac app sends a
// person to sign up, and where the web window sends a person who is not
// signed in. One column, centred, on the website's type and colours:
// the SimeonLabs wordmark top left, a serif heading, a line under it,
// the pill button, and Terms and Privacy at the foot. It works at phone
// width: the column is the viewport minus the gutters.
const GoogleMark = () => (
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

const SignInPage = ({
  mode,
  returnTo,
  returnParams,
}: {
  mode: 'login' | 'signup'
  returnTo?: string
  returnParams?: Record<string, string>
}) => {
  const posthog = usePostHog()
  const signup = mode === 'signup'

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

  const googleUrl = getGoogleAuthorizeLoginURL({
    return_to: resolvedReturnTo,
    ...(signup ? { attribution: JSON.stringify({ intent: 'creator' }) } : {}),
  })

  return (
    <div className="flex min-h-screen w-full flex-col items-center bg-white px-6 pt-7 pb-8 text-[#1d1d1f] sm:px-10 sm:pt-8 sm:pb-9">
      <div className="flex w-full items-center">
        <LogoType labs height={40} className="-ml-[7px] w-[138px]" />
      </div>
      <main className="flex w-full max-w-[400px] grow flex-col items-center justify-center gap-9 pb-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="font-[family-name:var(--font-newsreader)] text-[36px] leading-[1.1] font-normal tracking-[-0.02em] sm:text-[40px]">
            {signup ? 'Welcome to Simeon' : 'Welcome back'}
          </h1>
          <p className="text-[18px] leading-[1.4] text-[#6e6e73] sm:text-[19px]">
            {signup
              ? 'Create a team of agents for any part of your business.'
              : 'Sign in to your team of agents.'}
          </p>
        </div>
        <a
          href={googleUrl}
          className="flex h-[50px] w-full items-center justify-center gap-3 rounded-full bg-black text-[17px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#1d1d1f]"
        >
          <GoogleMark />
          <span>Continue with Google</span>
        </a>
        <p className="text-center text-[15px] leading-[1.4] text-[#6e6e73]">
          {signup ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            href={signup ? '/login' : '/signup'}
            className="text-[#0066cc] hover:text-[#0052a3]"
          >
            {signup ? 'Log in' : 'Sign up'}
          </Link>
        </p>
      </main>
      <p className="text-center text-[14px] text-[#86868b]">
        <a
          href="https://www.simeonlabs.com/legal/terms-of-service"
          className="text-[#0066cc] hover:text-[#0052a3]"
        >
          Terms of Service
        </a>{' '}
        and{' '}
        <a
          href="https://www.simeonlabs.com/legal/privacy-policy"
          className="text-[#0066cc] hover:text-[#0052a3]"
        >
          Privacy Policy
        </a>
      </p>
    </div>
  )
}

export default SignInPage
