import { Workspace } from '@/components/Workspace/Workspace'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Pierce' }
}

/**
 * The workspace, and the only thing at the root of a deal.
 *
 * It fills the viewport and carries its own chrome — the dock is the
 * navigation and the two panels are the page — so there is nothing around
 * it here. The layout above provides the organization context and stops at
 * that.
 *
 * `?deal=<id>` names a deal; without one the workspace takes the first the
 * caller is on, which is the normal case while a firm is running one.
 */
export default async function Page(props: {
  searchParams: Promise<{ deal?: string }>
}) {
  const { deal } = await props.searchParams

  return (
    <>
      {/* The three faces the design uses, loaded by name because every
          surface sets them inline from `design.ts`. */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Cormorant+Garamond:wght@300;400;500&display=swap"
      />
      <Workspace dealId={deal ?? ''} />
    </>
  )
}
