import { Metadata } from 'next'
import IntegrationsPage from '@/components/Integrations/IntegrationsPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Integrations - Frameworks',
  }
}

export default function Page() {
  return <IntegrationsPage />
}
