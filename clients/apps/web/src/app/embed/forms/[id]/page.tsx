import { EmbedFormView } from '@/components/Forms/EmbedFormView'
import { Metadata } from 'next'

// Embed pages shouldn't be indexed — they're meant to live inside an iframe
// on the creator's own site.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  return <EmbedFormView formId={id} />
}
