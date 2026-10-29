import LogoType from '@/components/Brand/LogoType'
import { getTranslator, type AcceptedLocale } from '@simeon/i18n'
import { Fragment, type ReactNode } from 'react'

// The sign-in pages' frame (the founder, 29 October 2026, after ChatGPT's
// "Log in or sign up": "lets design it like this"): one column in the middle
// of a white page, the heading and its line, then the ways in, with the Terms
// line at its foot; no photo and no card. The SimeonLabs wordmark top left.
// The Mac app's sign-in (`/loginDeepControl`) sends a browser with no session
// here, so this is the page people see between the app and "Continue as …".
// In the page's language (`pageLocale`, 20 October 2026).
const AuthShell = ({
  heading,
  line,
  children,
}: {
  heading: string
  line?: string
  children: ReactNode
}) => (
  <div className="flex min-h-screen w-full flex-col bg-white px-6 pt-7 pb-8 text-[#0d0d0d] sm:px-10 sm:pt-8">
    <div className="flex w-full items-center">
      <LogoType labs height={40} className="-ml-[7px] w-[138px]" />
    </div>
    <main className="flex w-full grow flex-col items-center justify-center py-10">
      <div className="flex w-full max-w-[380px] flex-col items-center">
        <h1 className="text-center text-[32px] leading-[1.15] font-medium tracking-[-0.02em] text-balance">
          {heading}
        </h1>
        {line ? (
          <p className="mt-3 text-center text-[17px] leading-[1.45] text-balance text-[#5d5d5d]">
            {line}
          </p>
        ) : null}
        <div className="mt-9 w-full">{children}</div>
      </div>
    </main>
  </div>
)

/** A translated sentence with React parts in its `{name}` places (a link in the Terms line). */
export const withParts = (
  sentence: string,
  parts: Record<string, ReactNode>,
): ReactNode[] =>
  sentence.split(/(\{\w+\})/).map((piece, index) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return (
      <Fragment key={index}>
        {name !== undefined && name in parts ? parts[name] : piece}
      </Fragment>
    )
  })

const legalLink =
  'text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:decoration-black/50'

export const Legal = ({ locale }: { locale: AcceptedLocale }) => {
  const t = getTranslator(locale)
  return (
    <p className="text-center text-[13px] leading-[1.5] text-[#86868b]">
      {withParts(
        t('simeon.signIn.legal', { terms: '{terms}', privacy: '{privacy}' }),
        {
          terms: (
            <a href="https://www.simeonlabs.com/terms" className={legalLink}>
              {t('simeon.signIn.terms')}
            </a>
          ),
          privacy: (
            <a href="https://www.simeonlabs.com/privacy" className={legalLink}>
              {t('simeon.signIn.privacy')}
            </a>
          ),
        },
      )}
    </p>
  )
}

export default AuthShell
