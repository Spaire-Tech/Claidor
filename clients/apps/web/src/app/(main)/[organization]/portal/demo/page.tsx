import { notFound, redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Public, no-login entry point to the demo student portal.
//
// Hitting `/{org}/portal/demo` asks the backend to mint a fresh throwaway
// session for the configured demo org, then forwards into the normal portal
// with that session token in the URL (the portal already carries the token
// across navigation). The link never expires because a new session is issued
// on every visit. Only the org named in DEMO_PORTAL_ORG_SLUG resolves; every
// other org gets a 404 from the backend and lands on notFound() here.
export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const { organization } = await props.params

  const apiUrl =
    process.env.POLAR_API_URL || (process.env.NEXT_PUBLIC_API_URL as string)

  let token: string | null = null
  try {
    const response = await fetch(
      `${apiUrl}/v1/demo-portal/${encodeURIComponent(organization)}/session`,
      { method: 'POST', cache: 'no-store' },
    )
    if (response.ok) {
      const data = (await response.json()) as { token?: string }
      token = data.token ?? null
    }
  } catch {
    token = null
  }

  // notFound()/redirect() throw, so they must run outside the try/catch above.
  if (!token) {
    notFound()
  }

  redirect(`/${organization}/portal?customer_session_token=${token}`)
}
