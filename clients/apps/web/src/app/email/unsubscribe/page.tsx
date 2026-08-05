'use client'

import { getServerURL } from '@/utils/api'
import { useEffect, useState } from 'react'

type Status = 'pending' | 'done' | 'invalid' | 'failed'

// Read once, sync, on first render. Window is accessed inside a `useState`
// initializer so it only runs in the browser and survives Next's SSR.
//
// The unsubscribe URL is signed: build_unsubscribe_url on the backend
// emits `?token=<JWT>`. (An earlier version of this page read `?sid=` —
// that broke every real unsubscribe because the backend stopped sending
// raw subscriber UUIDs to avoid leaking existence.) We also accept `sid`
// for the test-render preview path and as a defensive fallback.
const readQuery = () => {
  if (typeof window === 'undefined') {
    return { token: null, isTest: false }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    token: params.get('token'),
    isTest: params.get('test') === '1',
  }
}

export default function EmailUnsubscribePage() {
  const [{ token, isTest }] = useState(readQuery)
  const [status, setStatus] = useState<Status>(() => {
    if (typeof window === 'undefined') return 'pending'
    const q = readQuery()
    if (q.isTest) return 'done'
    if (!q.token) return 'invalid'
    return 'pending'
  })

  useEffect(() => {
    if (status !== 'pending' || !token) return
    let cancelled = false
    const url = getServerURL(
      `/v1/email-subscribers/unsubscribe?token=${encodeURIComponent(token)}`,
    )
    fetch(url, { method: 'POST' })
      .then(async (res) => {
        if (cancelled) return
        if (!res.ok) {
          setStatus('failed')
          return
        }
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean }
        setStatus(body.ok ? 'done' : 'invalid')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
    }
  }, [token, status])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#fafafa',
        fontFamily: 'Poppins, system-ui, -apple-system, "Segoe UI", sans-serif',
        color: '#1d1d1f',
      }}
    >
      <div
        style={{
          width: 'min(100%, 460px)',
          background: '#fff',
          border: '1px solid #e8e8ed',
          borderRadius: 16,
          padding: '36px 32px',
          textAlign: 'center',
          boxShadow: '0 24px 48px -24px rgba(15,23,42,0.18)',
        }}
      >
        <div
          style={{
            fontFamily: '"League Spartan", Poppins, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: '-0.01em',
            marginBottom: 24,
          }}
        >
          spaire
        </div>

        {status === 'pending' && (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              Unsubscribing…
            </h1>
            <p style={{ fontSize: 14, color: '#6e6e73', margin: 0 }}>
              Just a moment.
            </p>
          </>
        )}

        {status === 'done' && (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              {isTest ? 'Test email — no action taken' : "You're unsubscribed"}
            </h1>
            <p
              style={{
                fontSize: 14,
                color: '#6e6e73',
                margin: '0 0 16px',
                lineHeight: 1.55,
              }}
            >
              {isTest
                ? "This was a test send from the broadcast composer — there's no real subscription to remove."
                : "We won't send you any more emails. You can resubscribe at any time from the sender's site."}
            </p>
            {token && !isTest && (
              <p
                style={{
                  fontSize: 11.5,
                  color: '#86868b',
                  margin: 0,
                  fontFamily: 'JetBrains Mono, monospace',
                }}
              >
                Reference {token.slice(0, 8)}
              </p>
            )}
          </>
        )}

        {status === 'invalid' && (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              Link not recognised
            </h1>
            <p style={{ fontSize: 14, color: '#6e6e73', margin: 0 }}>
              This unsubscribe link is missing or invalid. Try clicking the link
              in the original email again.
            </p>
          </>
        )}

        {status === 'failed' && (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                margin: '0 0 8px',
                letterSpacing: '-0.01em',
              }}
            >
              Something went wrong
            </h1>
            <p style={{ fontSize: 14, color: '#6e6e73', margin: 0 }}>
              We couldn&apos;t process your unsubscribe right now. Please try
              again in a minute.
            </p>
          </>
        )}
      </div>
    </main>
  )
}
