// The sign-in pages' shared pieces, with no 'use client' so the server pages
// (`/login/code/verify`, `/login/password`) and the client ones both take them.
import { getTranslator, type AcceptedLocale } from '@simeon/i18n'

/** The outlined round button (Continue with Google, with Apple, with password). */
export const provider =
  'flex h-[50px] w-full items-center justify-center gap-3 rounded-full border border-[#d9d9de] bg-white text-[16px] font-medium tracking-[-0.01em] text-[#1d1d1f] transition-colors hover:bg-[#f5f5f7] sm:h-[52px] sm:text-[17px]'

/** The black round button (Continue with email, Sign in). */
export const primary =
  'h-[50px] w-full rounded-full bg-black text-[16px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-[#1d1d1f] disabled:cursor-not-allowed disabled:opacity-60 sm:h-[52px] sm:text-[17px]'

/** The round field (the e-mail, the password). */
export const field =
  'h-[50px] w-full rounded-full border border-[#d9d9de] bg-white px-5 text-[16px] text-[#1d1d1f] placeholder:text-[#a1a1a6] focus:border-[#1d1d1f] focus:outline-none sm:h-[52px] sm:text-[17px]'

/** A quiet link under the buttons (Use a different email). */
export const quietLink =
  'text-center text-[15px] text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:decoration-black/50'

/** "OR" between two ways in. */
export const Or = ({ locale }: { locale: AcceptedLocale }) => (
  <div className="py-2 text-center text-[13px] font-medium tracking-[0.06em] text-[#86868b]">
    {getTranslator(locale)('simeon.signIn.or')}
  </div>
)
