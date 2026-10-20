import SignInPage from '@/components/Auth/SignInPage'
import { getServerSideAPI } from '@/utils/client/serverside'
import { pageLocale } from '@/utils/i18n'
import { getUserOrganizations } from '@/utils/user'
import { getTranslator } from '@simeon/i18n'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'

export async function generateMetadata(props: {
  searchParams: Promise<{ locale?: string }>
}): Promise<Metadata> {
  const { locale } = await props.searchParams
  return {
    title: getTranslator(await pageLocale(locale))('simeon.signIn.signupTitle'),
  }
}

// Where the Mac app sends a person to sign up. A person who is already
// signed in goes straight to the window.
export default async function Page(props: {
  searchParams: Promise<{
    return_to?: string
    error?: string
    locale?: string
  }>
}) {
  const searchParams = await props.searchParams
  // `error`: a way in that came back without signing in (Sign in with Apple not set up yet).
  const { return_to, error, ...rest } = searchParams

  const api = await getServerSideAPI()
  const userOrganizations = await getUserOrganizations(api)
  if (userOrganizations.length > 0) {
    redirect(return_to ?? '/app')
  }

  return (
    <SignInPage
      mode="signup"
      returnTo={return_to}
      returnParams={rest}
      error={error}
      locale={await pageLocale(searchParams.locale)}
    />
  )
}
