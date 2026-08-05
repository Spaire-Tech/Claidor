import { Metadata } from 'next'
import StartupStackPage from '@/components/StartupStack/StartupStackPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Startup Stack',
  }
}

export default function Page() {
  return <StartupStackPage />
}
