import { Toaster } from '@/components/Toast/Toaster'
import { getServerSideAPI } from '@/utils/client/serverside'
import { getOrganizationOrNotFound } from '@/utils/customerPortal'
import { CustomerPortalLayoutWrapper } from './CustomerPortalLayoutWrapper'
import { PortalLayoutHeader } from './PortalLayoutHeader'
import { PortalShell } from './PortalShell'

export const dynamic = 'force-dynamic'

export default async function Layout(props: {
  params: Promise<{ organization: string }>
  children: React.ReactNode
}) {
  const params = await props.params

  const { children } = props

  const api = await getServerSideAPI()
  const { organization } = await getOrganizationOrNotFound(
    api,
    params.organization,
  )

  return (
    <div className="flex min-h-screen grow flex-col">
      <PortalLayoutHeader organization={organization} />
      <CustomerPortalLayoutWrapper organization={organization}>
        <PortalShell organization={organization}>{children}</PortalShell>
      </CustomerPortalLayoutWrapper>
      <Toaster />
    </div>
  )
}
