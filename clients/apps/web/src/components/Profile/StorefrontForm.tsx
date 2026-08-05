'use client'

import { LeadMagnetCard } from '@/components/Forms/LeadMagnetCard'
import { FormPublic } from '@/hooks/queries/forms'

export const StorefrontForm = ({
  form,
  preview = false,
}: {
  form: FormPublic
  preview?: boolean
}) => {
  // On the public Space the form is live; in the editor preview it's static.
  return <LeadMagnetCard form={form} interactive={!preview} />
}
