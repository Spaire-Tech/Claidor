import { creatorOnboardingEnabled } from '@/utils/creatorOnboarding'
import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import PlanPage from './PlanPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Choose your plan',
  }
}

export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  // The single choke point for "somebody still ended up here" — a bookmark,
  // a stale link, or the client-side push after the manual create form,
  // which cannot read a server-only flag. Catching it here means the flag
  // is read in one place instead of being mirrored into the browser.
  if (!creatorOnboardingEnabled()) {
    const { organization } = await props.params
    redirect(`/dashboard/${organization}`)
  }

  return <PlanPage />
}
