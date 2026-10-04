import { redirect } from 'next/navigation'

/**
 * The root of an organization. Simeon on the web (4 October 2026) is the
 * window at /app, so a signed-in person goes straight there; until then
 * this page said Simeon ran in the Mac app and there was nothing to
 * manage here. The query string survives the hop, as it does on
 * /dashboard: a connector's callback lands its verdict there.
 */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const searchParams = await props.searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') query.set(key, value)
  }
  redirect(query.size > 0 ? `/app?${query.toString()}` : '/app')
}
