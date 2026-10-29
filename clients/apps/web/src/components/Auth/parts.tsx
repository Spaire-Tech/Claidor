// The sign-in pages' shared pieces, with no 'use client' so the server pages
// (`/login/code/verify`, `/login/password`) and the client ones both take them.
import { getTranslator, type AcceptedLocale } from '@simeon/i18n'

// At the proportions of the founder's reference (29 October 2026, ChatGPT's
// "Log in or sign up"): 52 high, the words 16 and regular.

/** The outlined round button (Continue with Google, with Apple, with Microsoft, with password). */
export const provider =
  'flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full border border-[#e3e3e3] bg-white text-[16px] text-[#0d0d0d] transition-colors hover:bg-[#f5f5f5]'

/** The black round button (Continue, Sign in). */
export const primary =
  'h-[52px] w-full rounded-full bg-[#0d0d0d] text-[16px] text-white transition-colors hover:bg-[#2b2b2b] disabled:cursor-not-allowed disabled:opacity-60'

/** The round field (the e-mail, the password). */
export const field =
  'h-[52px] w-full rounded-full border border-[#e3e3e3] bg-white px-6 text-[16px] text-[#0d0d0d] placeholder:text-[#8e8e93] focus:border-[#0d0d0d] focus:outline-none'

/** A quiet link under the buttons (Use a different email). */
export const quietLink =
  'text-center text-[14px] text-[#0d0d0d] underline decoration-black/20 underline-offset-2 hover:decoration-black/50'

/** "OR" between two ways in, a hairline on each side. */
export const Or = ({ locale }: { locale: AcceptedLocale }) => (
  <div className="flex items-center gap-4 py-1 text-[13px] font-medium tracking-[0.04em] text-[#0d0d0d]">
    <span className="h-px grow bg-[#e3e3e3]" />
    {getTranslator(locale)('simeon.signIn.or')}
    <span className="h-px grow bg-[#e3e3e3]" />
  </div>
)
