# Connectors — the sixty-five, and the middleman

September 11, 2026. The design note for the connections work. Read it
with `docs/maties/plan.md` (the plan of record) and
`docs/maties/onboarding.md` (where the catalogue is shown).

The founder's decision, on this date, in their words: « we'll do the
middleman for now. then we'll change », and « connectors paid only ».
Both are load-bearing and this note is built around them.

## 1. What the person sees

Nothing new to learn. The connections shelf already exists, in the
onboarding and in the workspace, with sixty-five cards in eleven groups.
Today every Connect button either opens a form or does nothing.

After this work, Connect does one thing: a window opens, the person signs
in to the service the way they always do, the window closes, the card
gets a tick. That is the whole of it.

Two honest additions:

- A card the person is not entitled to shows the price, not a dead
  button. « Connections are part of Starter » with one way forward.
- A card that is connected can be disconnected, in one click, from the
  same place.

## 2. The four machines, and which one this note is about

The sixty-five cards are not one job. They are four, and the catalogue
already knows which is which (`src/shared/connections/catalog.ts`, the
`kind` field):

| Kind | Count | What « connect » means | This note |
|---|---|---|---|
| An account somewhere | 40 | Sign in with the service | **Yes** |
| A website with no API | 14 | Log in once in the assistant's own browser | No — separate, free, later |
| Already on this computer | 6 | Nothing to connect | No — separate, free, later |
| A place to be reached | 5 | Telegram and Discord done; three to go | No — step 12 |

This note covers the forty accounts. The other twenty-five need no
middleman and no money, and are a smaller piece of work that should
follow immediately after.

## 3. The middleman

**Pipedream Connect.** Around three thousand services, the sign-in
plumbing already built, and — the part that actually decides it — they
have already passed Google's annual security audit, which we have not and
which costs thousands a year.

What they cost, as of this date: free in development mode, capped at ten
people; **$99 a month** in production including a hundred people, then
**$2 per person per month**. Billing is per person, not per connection:
somebody who connects eight services costs the same as somebody who
connects one.

Two things we accept with open eyes:

- **Their name is in the sign-in window.** They do not offer an unbranded
  flow on the standard plan. Worth asking their sales team what it costs
  to remove; until then the person sees it.
- **Workday bought them** in February 2026. Connect is running and
  actively developed. Nobody has committed to outside developers beyond
  this year. This is exactly why section 6 exists.

## 4. The wire, exactly

The desktop app never speaks to Pipedream. Everything goes through
`api.claidor.com`, the same address the app already uses for sign-in,
the model proxy and memory sync.

```
Maties                      Claidor API                    Pipedream
  |                             |                              |
  |  GET  /api/connectors  ---> |                              |
  |                             | -- list accounts for this -> |
  |  <-- which are connected,   |    person only               |
  |      and am I entitled      |                              |
  |                             |                              |
  |  POST /api/connectors/      |                              |
  |       gmail/link ---------> | -- mint a one-use token ---> |
  |  <-- a URL ---------------- |                              |
  |                             |                              |
  |  opens a window on that URL ------------------------------>|
  |                             |         (the person signs in)|
  |                             |                              |
engine                          |                              |
  |  MCP over HTTP -----------> /api/connectors/mcp/gmail ----> |
  |                             |  adds the developer key and  |
  |                             |  this person's id            |
```

### Why the proxy, and not a direct line

This is the single most important decision in the note, so it is written
out.

Pipedream's developer access token is **project-wide**. Whoever holds it,
together with our project id, can name **any** external user id in a
header and reach **that person's** connected accounts. It is not a
per-person credential. It is the key to every customer we have.

So it cannot be on a laptop. Not in the app, not in the engine's config
file, not in a log. The desktop app holds only what it already holds: the
person's own Claidor session token. Our server adds the developer key and
pins the external user id to the person the session belongs to, and to
nobody else.

The same reasoning already governs the model proxy and the cloud runner
(`docs/maties/cloud.md`, section 4). This is that rule again, not a new
one.

### The four routes

```
GET    /desktop/api/connectors
         200 -> { entitled: true,  connections: [{ slug, accountId, connectedAt }] }
         402 -> { entitled: false, connections: [] }

POST   /desktop/api/connectors/{slug}/link
         -> { url, expiresAt }          402 when not entitled

DELETE /desktop/api/connectors/{accountId}
         -> 204                          402 when not entitled

ANY    /desktop/api/connectors/mcp/{slug}
         -> the MCP conversation, proxied  402 when not entitled
```

All four refuse with 402, `GET` included: a patched app must gain
nothing anywhere. `GET` still answers with a full body when it refuses,
so the shelf can be drawn from the refusal — the body is a courtesy to
an honest app, the status is what a dishonest one cannot argue with.

The person's Pipedream identity is their Claidor user id. It already
exists, it is stable, and it is not a secret.

### No table of our own

Pipedream holds the accounts. We do not mirror them into our database,
because a mirror drifts and then lies about what is connected. We ask
them, and cache the answer in Redis for a minute so that opening the app
is not forty network calls.

The cache is dropped when a connection is removed, and when a link is
**minted** — not when a sign-in succeeds. Success happens inside a
browser window that never reports back to us, so there is nothing to
hear. Minting stands in for it, and is sound because minting a link is
the only thing that can create a connection in the first place.

## 5. The gate

Connectors are a paid feature. The decision is made **on the server**,
in one place, and the app is told the answer. It is not a hidden button:
a person who patches the app still gets a 402 from every one of the four
routes.

The reason is money, and it is worth stating. At $2 per person per month,
every free signup who connects one thing costs us $2 a month forever
against nothing. A thousand of them is $2,000 a month. The gate is what
makes the middleman affordable at all.

Today `quota()` reports everybody as « Free », because the paid plans do
not exist yet (step 9). So the gate reads one function,
`connectors_entitled()`, which today answers from:

1. a settings allowlist of user ids — the founder's account, so the work
   can be used before there is anything to buy; then
2. the plan, once there is one.

When step 9 lands, the allowlist stays for staff and the plan does the
real work. Nothing else changes.

## 6. The swap, which is the point

The founder's words were « for now ». So the middleman sits behind a
door of our own:

```python
class ConnectorProvider(Protocol):
    async def link(self, user: User, slug: str) -> ConnectorLink: ...
    async def connections(self, user: User) -> list[Connection]: ...
    async def disconnect(self, user: User, account_id: str) -> None: ...
    async def mcp_target(self, user: User, slug: str) -> McpTarget: ...
```

`PipedreamProvider` implements it. Nothing else in the codebase — not the
endpoints, not the desktop app, not the engine config — knows the word
Pipedream.

When we replace them, whether with our own sign-ins service by service or
with somebody else, the work is one new class and a setting. The routes,
the app, the catalogue and the cards do not move. That is the whole
purpose of the door and it should not be opened for convenience.

The thing that would break the door is the app learning a Pipedream
detail — an app slug shape, a header name, an account id format. Keep
those on the server.

## 7. What a person costs, and when

Billing is per person per month. So a Pipedream identity is created
**lazily**: the first time somebody actually clicks Connect, never when
they merely sign in to Maties or look at the shelf.

One thing to confirm with Pipedream before the first bill: whether a
person counts from the moment a token is minted for them, or only once
they have a connected account. The lazy shape above is right either way,
but the answer changes what a month costs.

## 8. Order of work

1. **The server.** The provider door, the Pipedream implementation, the
   four routes, the gate, the settings, the tests. Nothing user-visible.
2. **The app.** The slug mapping, the window, the state, the Connect
   button wired, the tick, the disconnect. The engine's config gains one
   MCP entry per connected service, pointing at our proxy.
3. **The price card**, for a service the person is not entitled to.
4. **The free twenty-five** — the browser ones and the ones already on
   the Mac. No middleman, no money, and the shelf stops being mostly
   « soon ».

## 9. What this note does not decide

- **Gmail.** It works through the middleman from day one, because their
  audit covers it. When we leave the middleman, Gmail is the reason we
  may have to pay for an audit of our own. That decision is deferred, not
  answered.
- **Which of the forty exist at Pipedream under which name.** The slug
  mapping is built in step 2 above and checked against their catalogue,
  service by service. Anything with no match stays « soon » and is
  named, not quietly dropped.
- **The unbranded sign-in window.** Ask them the price; decide then.
