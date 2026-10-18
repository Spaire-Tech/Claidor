import AuthShell, { Legal } from '@/components/Auth/AuthShell'
import { Metadata } from 'next'
import Link from 'next/link'
import VerifyPage from './VerifyPage'

export const metadata: Metadata = {
  title: 'Enter verification code',
}

// The e-mail way's second step, in the sign-in page's own frame (18 October
// 2026): the code just sent, then back to `return_to` (from the Mac app, its
// sign-in link). "Use a different email" goes back to the first step with
// the same way home.
export default async function Page(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const email = searchParams.email as string
  const return_to = searchParams.return_to as string | undefined
  const error = searchParams.error as string | undefined
  const back = return_to
    ? `/login?${new URLSearchParams({ return_to })}`
    : '/login'

  return (
    <AuthShell
      heading="Check your email"
      line={
        email
          ? `We sent a six-character code to ${email}.`
          : 'We sent you a six-character code.'
      }
    >
      <div className="flex flex-col gap-5">
        <VerifyPage return_to={return_to} error={error} email={email} />
        <Link
          href={back}
          className="text-center text-[15px] text-[#1d1d1f] underline decoration-black/20 underline-offset-2 hover:decoration-black/50"
        >
          Use a different email
        </Link>
        <Legal />
      </div>
    </AuthShell>
  )
}
