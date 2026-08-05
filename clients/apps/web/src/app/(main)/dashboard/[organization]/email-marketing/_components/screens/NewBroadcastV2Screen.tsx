'use client'

import { schemas } from '@spaire/client'

import { BroadcastComposer } from '../composer/BroadcastComposer'

// "New broadcast" — your composer design, now powered by @react-email/editor.
export function NewBroadcastV2Screen({
  organization,
}: {
  organization: schemas['Organization']
}) {
  return <BroadcastComposer organization={organization} broadcastId={null} />
}
