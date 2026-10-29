import AuthShell, { Legal } from '@/components/Auth/AuthShell'
import { Or, provider, quietLink } from '@/components/Auth/parts'
import { pageLocale } from '@/utils/i18n'
import { getTranslator } from '@simeon/i18n'
import { Metadata } from 'next'
import Link from 'next/link'
import VerifyPage from './VerifyPage'

export async function generateMetadata(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}): Promise<Metadata> {
  const { locale } = await props.searchParams
  return {
    title: getTranslator(await pageLocale(locale as string | undefined))(
      'simeon.signIn.codeTitle',
    ),
  }
}

// The e-mail way's second step, in the sign-in page's own frame (18 October
// 2026): the code just sent, then back to `return_to` (from the Mac app, its
// sign-in link). Continue with password goes to the account's password
// instead (`/login/password`, 19 October 2026, as the iPhone's Log in or sign
// up). "Use a different email" goes back to the first step with the same way
// home.
export default async function Page(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const email = searchParams.email as string
  const return_to = searchParams.return_to as string | undefined
  const error = searchParams.error as string | undefined
  const locale = await pageLocale(searchParams.locale as string | undefined)
  const t = getTranslator(locale)
  const back = return_to
    ? `/login?${new URLSearchParams({ return_to })}`
    : '/login'
  const withPassword = `/login/password?${new URLSearchParams({
    ...(email ? { email } : {}),
    ...(return_to ? { return_to } : {}),
  })}`

  return (
    <AuthShell
      heading={t('simeon.signIn.checkEmail')}
      line={
        email
          ? t('simeon.signIn.codeSentTo', { email })
          : t('simeon.signIn.codeSent')
      }
    >
      <div className="flex flex-col gap-5">
        <VerifyPage
          return_to={return_to}
          error={error}
          email={email}
          locale={locale}
        />
        <Or locale={locale} />
        <Link href={withPassword} className={provider}>
          {t('simeon.signIn.continueWithPassword')}
        </Link>
        <Link href={back} className={quietLink}>
          {t('simeon.signIn.differentEmail')}
        </Link>
        <Legal locale={locale} />
      </div>
    </AuthShell>
  )
}
