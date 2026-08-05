import { Metadata } from 'next'
import PlanPage from './PlanPage'

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Choose your plan',
  }
}

export default function Page() {
  return <PlanPage />
}
