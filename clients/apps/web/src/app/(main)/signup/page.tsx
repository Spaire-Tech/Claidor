import SignInPage from '@/components/Auth/SignInPage'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getUserOrganizations } from '@/utils/user'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Sign up to Simeon',
}

// Where the Mac app sends a person to sign up. A person who is already
// signed in goes straight to the window.
export default async function Page(props: {
  searchParams: Promise<{
    return_to?: string
  }>
}) {
  const searchParams = await props.searchParams
  const { return_to, ...rest } = searchParams

  const api = await getServerSideAPI()
  const userOrganizations = await getUserOrganizations(api)
  if (userOrganizations.length > 0) {
    redirect(return_to ?? '/app')
  }

  return <SignInPage mode="signup" returnTo={return_to} returnParams={rest} />
}
