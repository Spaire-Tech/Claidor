# The draft composer, wired (25 September 2026)

The founder challenged the ledger's "not built" on four cards (ledger
F-082). Searched by concept, three are not in the tree (the in-chat form,
the cookie-origin approval, the virtual card); the draft composer was
two-thirds there: the pinned 0.18.0 renderer draws the `email-draft` and
`slack-draft` cards (recovered as `desktop/frontend/src/recovered/features/
conversation/cards/transcript-card/views/email-draft.tsx` and
`slack-draft.tsx`), and the host's transport carries both kinds
(`send-message-encoding.ts`, `send-message-shaping.ts`). What was missing
was the tool that emits a draft and a Send path. "wire it."

## What is built

- **`DraftExternalMessage`** (`host/runner/tools/draft-message-tool.ts`):
  `kind` email or slack, the routing (real addresses; the channel or person
  as the user named it), the body. It appends the card through the same
  transport append every card uses and returns the entry id. Drafting sends
  nothing and does not end the turn. Offered to the agent by the production
  toolset (`createDraftToolInputs` in `host-runner-composition.ts`), not to
  a child or a shared room.
- **Send and Discard** (`host/extensions/transcript/draft-cards.ts`, gateway
  commands `sendDraft` and `discardDraft`, coordinator RPC rows of the same
  names): Send keeps the person's edits, marks the entry `sending`, and wakes
  the agent with a hidden prompt to deliver the message by whatever route
  they have: a connected connector's MCP tool, a custom MCP server, or the
  box browser signed in to the service through a computerUse child. Discard
  dismisses the card and tells the agent once that it is a decline.
- **`MarkDraftDelivered`**: the agent's report after a Send wake. `sent`
  marks the card Sent; `failed` hands it back editable and says why in chat,
  once. The card's state is `draftSendState`, the field the renderer already
  reads (`editable | sending | sent`).
- **The brief**: `## Messages you write for the user to send` in
  `system-prompt.ts`, Grok Bot's §6 rules (`sources/grok-bot-cards.md`).

`desktop/tests/draft-composer.test.mjs` measures the tool, the state
machine on a real transcript entry, the two wake prompts and the wiring.

## What needs a Mac, and why

**The card's buttons.** Grok Bot 0.18 shipped the card with the Send and
Discard callbacks empty (the recovered views say so: `view-ClhdNXKM.js`
byte offset 10227 for email, `view-DyaeCHiE.js` byte offset 9687 for
Slack). The host now answers `sendDraft` and `discardDraft`, and the
coordinator forwards them like `respondToWidget`, but the pinned chunk has
to be patched at package time to call them, the way every other renderer
change is made (`scripts/lib/router-renderer-patch.mjs`). The bytes are
not in the repository (`desktop/src/app/dist` is fetched by `npm run
bootstrap`), so the anchor cannot be written here. On a Mac:

```
cd desktop && npm run bootstrap
grep -o '.\{200\}Send email.\{400\}' src/app/dist/renderer/assets/view-ClhdNXKM.js
grep -o '.\{200\}Send message.\{400\}' src/app/dist/renderer/assets/view-DyaeCHiE.js
```

Read the two callback slots, then add `patchOriginalDraftCards` to
`router-renderer-patch.mjs` binding Send to the coordinator's `sendDraft`
with `{ agentId, entryId, draft: <the edited fields> }` and Discard to
`discardDraft` with `{ agentId, entryId }`, the same way the widget's answer
reaches `respondToWidget`. Until that patch lands the card draws, edits and
shows state, and its buttons do nothing.

**Delivery.** Gmail and Slack are `comingSoon` in the vendor catalogue
(`vendor-mcp/catalog.ts`: both need an app we register). Until one is
registered a Send is delivered the way the wake prompt says: a custom MCP
server the person added, or the box browser signed in to Gmail or Slack,
by a computerUse child. That last route is the one to read first on a Mac:
`[claidor] tool=` lines naming the computer tool after a `draft-send` wake
in `/tmp/sand-host.log`, then `MarkDraftDelivered` in the same log.
