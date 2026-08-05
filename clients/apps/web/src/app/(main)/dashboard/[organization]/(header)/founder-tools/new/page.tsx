import { Metadata } from 'next'
import FormationWizard from '@/components/CompanyFormation/FormationWizard'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Incorporate',
  }
}

export default function Page() {
  return <FormationWizard />
}
