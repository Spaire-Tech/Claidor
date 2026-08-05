import { DashboardBody } from '@/components/Layout/DashboardLayout'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
  params: Promise<{ organization: string }>
}) {
  return (
    <DashboardBody title={null} wide>
      {children}
    </DashboardBody>
  )
}
