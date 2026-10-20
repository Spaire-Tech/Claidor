import SignInPage from '@/components/Auth/SignInPage'
import { pageLocale } from '@/utils/i18n'
import { getTranslator } from '@simeon/i18n'
import { Metadata } from 'next'

export async function generateMetadata(props: {
  searchParams: Promise<{ locale?: string }>
}): Promise<Metadata> {
  const { locale } = await props.searchParams
  return {
    title: getTranslator(await pageLocale(locale))('simeon.signIn.loginTitle'),
  }
}

// Where the web window sends a person who is not signed in, and where a
// signed-in session comes back to `return_to`. Anyone can sign in: the
// account is made on the first sign-in.
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
  return (
    <SignInPage
      mode="login"
      returnTo={return_to}
      returnParams={rest}
      error={error}
      locale={await pageLocale(searchParams.locale)}
    />
  )
}
