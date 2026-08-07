import { GuidesPage } from '@/components/Claidor/GuidesPage'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Guides' }
}

export default function Page() {
  return <GuidesPage />
}
