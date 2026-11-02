// What the person reads before an app's sign-in page opens
// (mac/Simeon/MacConnector.swift's `ConnectConsentLayer` and
// `ConnectConsentDialog`; the core's ConnectConsent.swift): over
// everything, the window dimmed; Connect goes on, × or Escape cancels.
// Step 6b.

import type { Connector } from './connector'

export function ConsentLayer({ connector }: { connector: Connector }) {
  void connector
  return null
}
