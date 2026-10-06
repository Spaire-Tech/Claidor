import SignInPage from '@/components/Auth/SignInPage'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Log in to Simeon',
}

// Where the web window sends a person who is not signed in, and where a
// signed-in session comes back to `return_to`. Anyone can sign in: the
// account is made on the first sign-in.
export default async function Page(props: {
  searchParams: Promise<{
    return_to?: string
  }>
}) {
  const searchParams = await props.searchParams
  const { return_to, ...rest } = searchParams
  return <SignInPage mode="login" returnTo={return_to} returnParams={rest} />
}
