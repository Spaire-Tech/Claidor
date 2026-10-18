import LogoType from '@/components/Brand/LogoType'
import Image from 'next/image'
import type { ReactNode } from 'react'

// The sign-in pages' frame (the founder, 18 October 2026, after Claude's
// sign-in: "make it like this"): the SimeonLabs wordmark top left; on a
// wide screen the words and the card on the left and the founder's photo
// of the room built round a boulder on the right, rounded; on a phone one
// centred column, no photo. The Mac app's sign-in (`/loginDeepControl`)
// sends a browser with no session here, so this is the page people see
// between the app and "Continue as …".
const AuthShell = ({
  heading,
  line,
  children,
}: {
  heading: string
  line?: string
  children: ReactNode
}) => (
  <div className="flex min-h-screen w-full bg-[#fafafa] text-[#1d1d1f]">
    <div className="flex min-h-screen w-full flex-col px-6 pt-7 pb-8 sm:px-10 sm:pt-8 lg:w-1/2 lg:px-14">
      <div className="flex w-full items-center">
        <LogoType labs height={40} className="-ml-[7px] w-[138px]" />
      </div>
      <main className="flex w-full grow flex-col items-center justify-center pt-12 pb-6 lg:pt-6">
        <div className="flex w-full max-w-[640px] flex-col items-center gap-10">
          <div className="flex flex-col items-center gap-4 text-center">
            <h1 className="font-[family-name:var(--font-newsreader)] text-[48px] leading-[1.02] font-normal tracking-[-0.025em] text-balance sm:text-[60px] lg:text-[64px]">
              {heading}
            </h1>
            {line ? (
              <p className="max-w-[460px] font-[family-name:var(--font-newsreader)] text-[20px] leading-[1.35] text-balance text-[#3a3a3c] sm:text-[22px]">
                {line}
              </p>
            ) : null}
          </div>
          <div className="w-full max-w-[460px] rounded-[28px] border border-black/[0.06] bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,0,0,0.08)] sm:p-9">
            {children}
          </div>
        </div>
      </main>
    </div>
    <div className="hidden p-6 pl-0 lg:block lg:w-1/2">
      <div className="sticky top-6 h-[calc(100vh-48px)] w-full overflow-hidden rounded-[28px] bg-[#e8e4de]">
        <Image
          src="/assets/sign-in/room.webp"
          alt="A living room built around a boulder, with white sofas and a globe hanging on a string"
          fill
          priority
          sizes="50vw"
          className="object-cover object-[50%_40%]"
        />
      </div>
    </div>
  </div>
)

export const Legal = () => (
  <p className="text-center text-[13px] leading-[1.5] text-[#86868b]">
    By continuing, you agree to Simeon&rsquo;s{' '}
    <a
      href="https://www.simeonlabs.com/legal/terms-of-service"
      className="text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:decoration-black/50"
    >
      Terms of Service
    </a>{' '}
    and{' '}
    <a
      href="https://www.simeonlabs.com/legal/privacy-policy"
      className="text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:decoration-black/50"
    >
      Privacy Policy
    </a>
    .
  </p>
)

export default AuthShell
