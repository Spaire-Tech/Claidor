import { ClaidorShell } from '@/components/Claidor/Shell'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationBySlugOrNotFound } from '@/utils/organization'

/**
 * Route group for screens built on the Claidor v1 design (docs/design/).
 * Sibling of `(header)`, which still carries the inherited chrome; screens
 * migrate from there to here as they are rebuilt, and the group dissolves
 * into the organization layout once nothing is left on the old shell.
 */
export default async function Layout(props: {
  params: Promise<{ organization: string }>
  children: React.ReactNode
}) {
  const params = await props.params
  const api = await getServerSideAPI()
  const organization = await getOrganizationBySlugOrNotFound(
    api,
    params.organization,
  )

  return (
    <ClaidorShell
      organizationSlug={organization.slug}
      organizationName={organization.name}
    >
      {props.children}
    </ClaidorShell>
  )
}
