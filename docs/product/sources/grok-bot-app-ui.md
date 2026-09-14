# Grok Bot — app UI map

**Source of truth. Given to Ledger by the founder on 15 September 2026,
the third of the series.**

Reproduced verbatim. Nothing in it is mine. This is the document
`grok-bot-chat.md` §3.7 refers to as *"app-ui.md is the verified map"* —
the reference the agent is given so it can guide a person through the
app without inventing a click-path. The mapping against our tree is in
`docs/product/sources/README.md`.

---

A compact map of Grok Bot's real interface so you can guide the user or self-recover. Use only what's listed here; for anything else, follow "Never fabricate data" and say you're unsure rather than inventing a path.

* Opening settings: the sidebar account button at the bottom-left (avatar + account name), the Cmd+, shortcut, or the command palette's "Open settings". There's no gear icon or macOS Preferences menu item.
* Deleting an agent: the user does this from the sidebar — right-click the agent's row and choose "Delete" (a permanent delete that removes the agent and its transcript, with a confirm). It's not in Settings; there's no archive or hide, just this permanent delete.
* Settings tabs: General, Computer, Usage & Billing, Updates. Usage & Billing appears only when enabled for the current account. Rows you can link by anchor: General: account, theme, accent, language, microphone, hardware-acceleration, hardware-acceleration-restart, network-debugger, notification-sound-enabled, notification-sound, timezone, local-execution, auto-review, auto-review-rules, security-keys; Computer: computers; Usage & Billing: usage, plan, cancel-trial, on-demand, billing; Updates: update-status, update-channel, automatic-updates, update-computer, reset-computer. Some rows exist only on some accounts, builds, or states; if the user cannot find a row, say so.
* General: the account card ("Sign In with Cursor" / "Sign Out"), appearance controls (Theme with Follow System / Light / Dark and Language), system controls, agent defaults, and security keys.
* Computer: registered machines and box recovery. Recovery is Update Grok Bot's Computer (its button says "Update"; it moves the box to a fresh instance keeping files and logins, but installed software must be reinstalled), a two-click confirm ("Click Again to Confirm"). The Reset Grok Bot's Computer row (button "Reset") is the destructive recovery of last resort: it restores from the last saved snapshot and can lose recent unsynced work, so steer users to Update instead.
* Usage & Billing: included and on-demand usage plus plan controls.
* Updates: Update Track (Stable / Nightly) and "Check for Updates", which update the Grok Bot app itself, distinct from Update Grok Bot's Computer (which recreates the box).
* Per-agent info pane (separate from the global Settings): open it by clicking the agent's name in the chat header (or Cmd+Shift+I), close it with the "X" in the pane's own header. It shows a live preview of that agent's computer (click it to open the full screen view) over its Routines list, plus Channels when a channel connector is available to connect or one is already connected, and Members in group chats. The gear beside the "X" opens a per-agent Settings subpage (avatar, name, title, description, and per-assistant notifications).
