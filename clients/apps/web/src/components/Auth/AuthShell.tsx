import LogoType from '@/components/Brand/LogoType'
import { getTranslator, type AcceptedLocale } from '@simeon/i18n'
import Image from 'next/image'
import { Fragment, type ReactNode } from 'react'

// The sign-in pages' frame (the founder, 18 October 2026, after Claude's
// sign-in: "make it like this"): the SimeonLabs wordmark top left; on a
// wide screen the words and the card on the left and the founder's photo
// of the room built round a boulder on the right, rounded; on a phone one
// centred column, no photo. At Claude's proportions (21 October 2026: "the
// sign in is way too big. compared to claude… the get it off your plate is
// so high. so big"): the heading 52 on a wide screen, the card 440 wide,
// the photo inset 48 from the window's edges. The Mac app's sign-in
// (`/loginDeepControl`) sends a browser with no session here, so this is
// the page people see between the app and "Continue as …". In the page's
// language (`pageLocale`, 20 October 2026).
const AuthShell = ({
  heading,
  line,
  locale,
  children,
}: {
  heading: string
  line?: string
  locale: AcceptedLocale
  children: ReactNode
}) => (
  <div className="flex min-h-screen w-full bg-[#fafafa] text-[#1d1d1f]">
    <div className="flex min-h-screen w-full flex-col px-6 pt-7 pb-8 sm:px-10 sm:pt-8 lg:w-1/2 lg:px-14">
      <div className="flex w-full items-center">
        <LogoType labs height={40} className="-ml-[7px] w-[138px]" />
      </div>
      <main className="flex w-full grow flex-col items-center justify-center pt-10 pb-6 sm:pt-12 lg:pt-6">
        <div className="flex w-full max-w-[560px] flex-col items-center gap-7 sm:gap-8">
          <div className="flex flex-col items-center gap-2.5 text-center sm:gap-3">
            <h1 className="font-[family-name:var(--font-newsreader)] text-[34px] leading-[1.05] font-normal tracking-[-0.02em] text-balance sm:text-[46px] lg:text-[52px]">
              {heading}
            </h1>
            {line ? (
              <p className="font-[family-name:var(--font-newsreader)] text-[clamp(14px,3.9vw,17px)] leading-[1.4] text-balance text-[#3a3a3c] min-[360px]:whitespace-nowrap sm:text-[19px] sm:leading-[1.35]">
                {line}
              </p>
            ) : null}
          </div>
          <div className="w-full max-w-[440px] rounded-[24px] border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.08)] sm:p-7">
            {children}
          </div>
        </div>
      </main>
    </div>
    <div className="hidden py-12 pr-12 lg:block lg:w-1/2">
      <div className="sticky top-12 h-[calc(100vh-96px)] w-full overflow-hidden rounded-[24px] bg-[#e8e4de]">
        <Image
          src="/assets/sign-in/room.webp"
          alt={getTranslator(locale)('simeon.signIn.photo')}
          fill
          priority
          sizes="50vw"
          className="object-cover object-[50%_40%]"
        />
      </div>
    </div>
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
            <a
              href="https://www.simeonlabs.com/legal/terms-of-service"
              className={legalLink}
            >
              {t('simeon.signIn.terms')}
            </a>
          ),
          privacy: (
            <a
              href="https://www.simeonlabs.com/legal/privacy-policy"
              className={legalLink}
            >
              {t('simeon.signIn.privacy')}
            </a>
          ),
        },
      )}
    </p>
  )
}

export default AuthShell
