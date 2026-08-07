import { AssistantPage } from '@/components/Claidor/AssistantPage'
import { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Assistant' }
}

export default function Page() {
  return <AssistantPage />
}
