import { redirect } from 'next/navigation'

/**
 * The web app is the billing page and nothing else (6 October 2026):
 * Simeon is the Mac app. Whoever lands at the root is here to choose a
 * plan or manage one.
 */
export default function Page() {
  redirect('/billing')
}
