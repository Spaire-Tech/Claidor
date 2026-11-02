// The person's OK before a guarded act, where the Mac asks Touch ID
// (ios/SimeonCore's `PurchaseApproval.confirm`): a checkout's Allow,
// 1Password's Fill, a saved password shown in the Credentials Store.
//
// In the Windows app, Windows Hello asks first, with the Mac's reason
// ("Approve $2.47 at gumroad.com"): confirmed, the act goes (a checkout's
// Allow carries the approval to Link, with no method, as the Mac's
// passcode: Hello doesn't say which it used); cancelled, nothing is done.
// Where Hello can't ask (not set up on this PC, or not Windows), the
// window's own alert asks, as on the web (the caller shows it).

import { desktop } from '../desktop/desktop'

/** How the person was asked: the device confirmed (`confirmed`), they said no (`cancelled`), or the window's own alert is to ask (`alert`). */
export type Presence = 'confirmed' | 'cancelled' | 'alert'

/** Asks Windows Hello in the Windows app; on the web, and where Hello can't ask, `alert`. */
export async function confirmPresence(reason: string): Promise<Presence> {
  const host = desktop()
  if (!host) return 'alert'
  try {
    const said = await host.call('confirmPresence', reason)
    if (said === 'confirmed') return 'confirmed'
    if (said === 'cancelled') return 'cancelled'
    return 'alert'
  } catch {
    return 'alert'
  }
}
