import { Metadata } from 'next'
import FormationDetailPage from '@/components/CompanyFormation/FormationDetailPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Company Formation',
  }
}

export default function Page() {
  return <FormationDetailPage />
}
