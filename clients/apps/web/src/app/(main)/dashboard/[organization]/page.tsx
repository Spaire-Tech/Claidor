import { Workspace } from '@/components/Workspace/Workspace'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'
import { getAuthenticatedUser } from '@/utils/user'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Pierce' }
}

/**
 * The workspace, and the only thing at the root of an organization.
 *
 * It fills the viewport and carries its own chrome — the dock is the
 * navigation and the floating cards are the page — so there is nothing
 * around it here. The organization and the signed-in person are resolved
 * server-side and passed down: the connector needs the first, the dock's
 * avatar and popover need the second.
 */
export default async function Page(props: {
  params: Promise<{ organization: string }>
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )
  const user = await getAuthenticatedUser()

  //: The account carries no display name — only an email. « e.whitmore »
  //: reads as « E. Whitmore »: a derivation from real data, never an
  //: invention. The popover shows the email underneath either way.
  const name = (user?.email ?? '')
    .split('@')[0]!
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) =>
      part.length === 1
        ? `${part.toUpperCase()}.`
        : part[0]!.toUpperCase() + part.slice(1),
    )
    .join(' ')

  return (
    <>
      {/* Both faces — Switzer and IBM Plex Mono — are self-hosted from
          the design's own binaries, loaded by workspace.css. No external
          font host. */}
      <Workspace
        userName={name || 'Signed in'}
        userEmail={user?.email ?? ''}
        organizationId={organization.id}
      />
    </>
  )
}
