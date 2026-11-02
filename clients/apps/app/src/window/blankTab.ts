// A tab opened on the person's click, before its page is known, so the
// browser lets it open (the billing pages, Slack's and GitHub's linking
// page). A tab opened so starts with a copy of this tab's storage, the
// sign-in's pair with it: emptied before the tab goes anywhere, so no page
// in it ever finds it; and it keeps no handle on the app (`opener`).

export function openBlankTab(): Window | null {
  const tab = window.open('', '_blank')
  if (!tab) return null
  try {
    tab.sessionStorage.clear()
  } catch {
    // Storage the browser blocks holds nothing.
  }
  tab.opener = null
  return tab
}
