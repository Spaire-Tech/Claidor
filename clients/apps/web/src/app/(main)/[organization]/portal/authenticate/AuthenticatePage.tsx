'use client'

import {
  useCustomerPortalSessionAuthenticate,
  useCustomerPortalSessionRequest,
} from '@/hooks/queries'
import { getQueryClient } from '@/utils/api/query'
import { api } from '@/utils/client'
import { schemas } from '@spaire/client'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { PortalAuthScene } from '../_auth/PortalAuthScene'
import { PORTAL_EMAIL_KEY } from '../request/RequestPage'

const CODE_LENGTH = 6
// Matches the backend: 6-character alphanumeric code, upper-cased.
const sanitizeChar = (v: string) => v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()

const ClientPage = ({
  organization,
}: {
  organization: schemas['CustomerOrganization']
}) => {
  const router = useRouter()
  const authenticate = useCustomerPortalSessionAuthenticate(api)
  const resendRequest = useCustomerPortalSessionRequest(api, organization.id)

  const [email, setEmail] = useState<string>('')
  const [cells, setCells] = useState<string[]>(() =>
    Array(CODE_LENGTH).fill(''),
  )
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [resendLeft, setResendLeft] = useState(0)

  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    try {
      setEmail(sessionStorage.getItem(PORTAL_EMAIL_KEY) || '')
    } catch {
      /* ignore */
    }
    // Start the initial resend cooldown — a code was just sent on the
    // previous screen.
    setResendLeft(30)
    inputsRef.current[0]?.focus()
  }, [])

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendLeft <= 0) return
    const t = setTimeout(() => setResendLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendLeft])

  const code = cells.join('')
  const complete = code.length === CODE_LENGTH

  const goToPurchases = useCallback(
    (sessionToken: string) => {
      const queryClient = getQueryClient()
      queryClient.invalidateQueries({ queryKey: ['portal_authenticated_user'] })
      queryClient.invalidateQueries({ queryKey: ['customer_portal_session'] })
      queryClient.invalidateQueries({ queryKey: ['customer'] })
      router.push(
        `/${organization.slug}/portal/?customer_session_token=${sessionToken}`,
      )
    },
    [router, organization.slug],
  )

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== CODE_LENGTH || authenticate.isPending) return
      setError(null)
      const { data, error: apiError } = await authenticate.mutateAsync({
        code: value,
      })

      if (apiError || !data) {
        const detail = apiError?.detail
        setError(
          typeof detail === 'string'
            ? detail
            : 'That code is invalid or has expired.',
        )
        setCells(Array(CODE_LENGTH).fill(''))
        inputsRef.current[0]?.focus()
        return
      }

      try {
        sessionStorage.removeItem(PORTAL_EMAIL_KEY)
      } catch {
        /* ignore */
      }
      setToken(data.token)
      setDone(true)
    },
    [authenticate],
  )

  // Once the success screen has had a beat to play, head to the purchases.
  useEffect(() => {
    if (!done || !token) return
    const t = setTimeout(() => goToPurchases(token), 1300)
    return () => clearTimeout(t)
  }, [done, token, goToPurchases])

  const setCellAt = (index: number, value: string) => {
    setCells((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleChange = (index: number, raw: string) => {
    const char = sanitizeChar(raw).slice(0, 1)
    setError(null)
    setCellAt(index, char)
    if (char && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus()
    }
    // Auto-submit when the last cell completes the code.
    if (char && index === CODE_LENGTH - 1) {
      const assembled = cells.map((c, i) => (i === index ? char : c)).join('')
      if (assembled.length === CODE_LENGTH) submit(assembled)
    }
  }

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !cells[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
      setCellAt(index - 1, '')
    }
    if (e.key === 'ArrowLeft' && index > 0)
      inputsRef.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < CODE_LENGTH - 1)
      inputsRef.current[index + 1]?.focus()
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLElement>) => {
    e.preventDefault()
    const digits = sanitizeChar(e.clipboardData.getData('text')).slice(
      0,
      CODE_LENGTH,
    )
    if (!digits) return
    setError(null)
    setCells((prev) => {
      const next = [...prev]
      digits.split('').forEach((d, k) => {
        if (k < CODE_LENGTH) next[k] = d
      })
      return next
    })
    const target = Math.min(digits.length, CODE_LENGTH - 1)
    inputsRef.current[target]?.focus()
    if (digits.length === CODE_LENGTH) submit(digits)
  }

  const handleResend = useCallback(async () => {
    if (resendLeft > 0) return
    if (!email) {
      router.push(`/${organization.slug}/portal/request`)
      return
    }
    setError(null)
    setCells(Array(CODE_LENGTH).fill(''))
    await resendRequest.mutateAsync({ email })
    setResendLeft(30)
    inputsRef.current[0]?.focus()
  }, [resendLeft, email, resendRequest, router, organization.slug])

  if (done) {
    return (
      <PortalAuthScene organization={organization}>
        <div className="spauth-success">
          <div className="spauth-badge">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.2 4.3L19 7" />
            </svg>
          </div>
          <h1 className="spauth-title">You&apos;re in</h1>
          <p className="spauth-sub">
            {email ? (
              <>
                Signed in as <b>{email}</b>. Your purchases are ready.
              </>
            ) : (
              'Your purchases are ready.'
            )}
          </p>
          <button
            type="button"
            className="spauth-btn"
            onClick={() => token && goToPurchases(token)}
          >
            Go to my purchases
          </button>
        </div>
      </PortalAuthScene>
    )
  }

  return (
    <PortalAuthScene organization={organization}>
      <button
        type="button"
        className="spauth-back"
        onClick={() => router.push(`/${organization.slug}/portal/request`)}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Back
      </button>
      <h1 className="spauth-title">Enter your code</h1>
      <p className="spauth-sub">
        {email ? (
          <>
            We sent a 6-digit code to <b>{email}</b>. It expires in 30 minutes.
          </>
        ) : (
          'Enter the verification code sent to your email address. It expires in 30 minutes.'
        )}
      </p>

      <div
        className={`spauth-codegrid ${error ? 'spauth-err' : ''}`}
        onPaste={handlePaste}
      >
        {cells.map((value, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el
            }}
            className={`spauth-codecell ${value ? 'spauth-filled' : ''}`}
            type="text"
            inputMode="text"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={value}
            aria-label={`Character ${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
          />
        ))}
      </div>

      {error && <div className="spauth-field-msg">{error}</div>}

      <button
        type="button"
        className="spauth-btn"
        disabled={!complete || authenticate.isPending}
        onClick={() => submit(code)}
      >
        {authenticate.isPending ? (
          <span className="spauth-spin" />
        ) : (
          'Verify & continue'
        )}
      </button>

      <div className="spauth-codemeta">
        <span>Didn&apos;t get it?</span>
        <button
          type="button"
          className={`spauth-link spauth-resend ${
            resendLeft > 0 ? 'spauth-waiting' : ''
          }`}
          onClick={handleResend}
          disabled={resendRequest.isPending}
        >
          {resendLeft > 0
            ? `Resend in 0:${resendLeft < 10 ? '0' : ''}${resendLeft}`
            : 'Resend code'}
        </button>
      </div>
    </PortalAuthScene>
  )
}

export default ClientPage
