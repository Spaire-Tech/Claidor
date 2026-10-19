import AuthShell, { Legal } from '@/components/Auth/AuthShell'
import { quietLink } from '@/components/Auth/parts'
import { Metadata } from 'next'
import Link from 'next/link'
import PasswordForm from './PasswordForm'

export const metadata: Metadata = {
  title: 'Enter your password',
}

// The e-mail way with the account's password instead of the code (19 October
// 2026, as the iPhone's Log in or sign up): in the sign-in page's own frame,
// the password, then back to `return_to` (from the Mac app, its sign-in
// link). A password is set in the Simeon app (Settings › Account › Password)
// after signing in once with a code; "Use a code instead" goes back to the
// code just sent.
export default async function Page(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const email = (searchParams.email as string | undefined) ?? ''
  const return_to = searchParams.return_to as string | undefined
  const error = searchParams.error as string | undefined
  const query = (extra: Record<string, string>) =>
    new URLSearchParams({ ...extra, ...(return_to ? { return_to } : {}) })
  const code = `/login/code/verify?${query(email ? { email } : {})}`
  const back = `/login?${query({})}`

  return (
    <AuthShell heading="Enter your password" line={email || undefined}>
      <div className="flex flex-col gap-5">
        <PasswordForm email={email} return_to={return_to} error={error} />
        <Link href={code} className={quietLink}>
          Use a code instead
        </Link>
        <Link href={back} className={quietLink}>
          Use a different email
        </Link>
        <Legal />
      </div>
    </AuthShell>
  )
}
