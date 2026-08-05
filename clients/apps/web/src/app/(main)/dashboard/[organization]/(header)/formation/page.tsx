import { Metadata } from 'next'
import FormationLandingPage from '@/components/CompanyFormation/FormationLandingPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Incorporate',
  }
}

export default function Page() {
  return <FormationLandingPage />
}
