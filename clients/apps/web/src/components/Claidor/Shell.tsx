'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  AssistantIcon,
  BiblioIcon,
  DossierIcon,
  GuidesIcon,
  HelpIcon,
  MoonIcon,
  SunIcon,
} from './icons'

/**
 * The Claidor shell: 232px sidebar, main column, dark toggle, toasts —
 * the frame every screen of the v1 design lives in
 * (docs/design/claidor-v1-markup.html).
 *
 * The nav deliberately lists only screens that are wired to the real
 * backend. The design has nine entries; the rest join as they are built —
 * a nav item that opens a mock would make the whole product read as one.
 */

const DARK_KEY = 'claidor-dark'
const DARK_ATTR = 'data-claidor-dark'

// --- toasts ---------------------------------------------------------------

const ToastContext = createContext<(message: string) => void>(() => {})

export const useToast = () => useContext(ToastContext)

// --- shell ----------------------------------------------------------------

interface NavEntry {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number }>
  /** Marks this entry active for any deeper path too (e.g. dossier detail). */
  prefix?: boolean
}

export const ClaidorShell = ({
  organizationSlug,
  organizationName,
  children,
}: {
  organizationSlug: string
  organizationName: string
  children: React.ReactNode
}) => {
  const pathname = usePathname()
  const base = `/dashboard/${organizationSlug}`

  const nav: NavEntry[] = [
    { label: 'Assistant', href: `${base}/assistant`, icon: AssistantIcon },
    {
      label: 'Dossiers',
      href: `${base}/dossiers`,
      icon: DossierIcon,
      prefix: true,
    },
    {
      label: 'Bibliothèque',
      href: `${base}/bibliotheque`,
      icon: BiblioIcon,
      prefix: true,
    },
    { label: 'Guides', href: `${base}/guides`, icon: GuidesIcon },
  ]

  // Dark mode: attribute on <html>, persisted. Applied in an effect (the
  // server cannot know the stored preference), so the very first paint of a
  // session is light; every navigation after that carries the attribute.
  const [dark, setDark] = useState(false)
  useEffect(() => {
    let stored = false
    try {
      stored = localStorage.getItem(DARK_KEY) === '1'
    } catch {}
    setDark(stored)
    if (stored) document.documentElement.setAttribute(DARK_ATTR, '')
  }, [])
  const toggleDark = useCallback(() => {
    setDark((current) => {
      const next = !current
      if (next) document.documentElement.setAttribute(DARK_ATTR, '')
      else document.documentElement.removeAttribute(DARK_ATTR)
      try {
        localStorage.setItem(DARK_KEY, next ? '1' : '0')
      } catch {}
      return next
    })
  }, [])

  const [toast, setToast] = useState('')
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(''), 2200)
  }, [])
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={showToast}>
      <div className="claidor-app flex h-full w-full overflow-hidden">
        <button
          onClick={toggleDark}
          title={dark ? 'Mode clair' : 'Mode sombre'}
          className="fixed top-[14px] right-4 z-50 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg"
          style={{ color: 'var(--t3)' }}
        >
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>

        {/* Sidebar */}
        <div
          className="flex flex-col"
          style={{
            width: 232,
            flex: '0 0 232px',
            background: 'var(--surface)',
            borderRight: '1px solid var(--b1)',
          }}
        >
          <div className="flex items-center gap-2 px-4 pt-4 pb-1">
            <div className="claidor-serif text-[19px] font-semibold">
              Claidor
            </div>
          </div>

          <div className="flex flex-col gap-px p-2">
            {nav.map((entry) => {
              const active = entry.prefix
                ? pathname.startsWith(entry.href)
                : pathname === entry.href
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="claidor-hover-row flex items-center gap-[10px] rounded-[7px] px-[10px] py-[7px] text-[13.5px]"
                  style={{
                    color: 'var(--ink)',
                    background: active ? 'var(--s8)' : 'transparent',
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  <span style={{ color: 'var(--t2)' }}>
                    <entry.icon size={15} />
                  </span>
                  {entry.label}
                </Link>
              )
            })}
          </div>

          <div className="flex-1" />

          <div
            className="flex items-center gap-2 px-4 py-3"
            style={{ borderTop: '1px solid var(--s7)' }}
          >
            <div
              className="min-w-0 flex-1 truncate text-[13.5px] font-semibold"
              style={{ color: 'var(--ink)' }}
            >
              {organizationName}
            </div>
            <Link
              href={`${base}/guides`}
              title="Aide"
              className="flex"
              style={{ color: 'var(--t4)' }}
            >
              <HelpIcon size={15} />
            </Link>
          </div>
        </div>

        {/* Main */}
        <div
          className="flex min-w-0 flex-1 flex-col"
          style={{ background: 'var(--surface)' }}
        >
          {children}
        </div>

        {toast ? (
          <div
            className="claidor-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-[13px]"
            style={{
              background: 'var(--ink)',
              color: 'var(--on-accent)',
              boxShadow: '0 8px 24px var(--sh1)',
            }}
          >
            {toast}
          </div>
        ) : null}
      </div>
    </ToastContext.Provider>
  )
}
