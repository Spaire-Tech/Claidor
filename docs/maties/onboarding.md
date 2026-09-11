# Onboarding — step 5 of the plan

September 10, 2026. The founder drew the six screens
(`docs/maties/design/onboarding/founder-onboarding-template.html`, the
logos next to it). This note says what each screen does to the app, so
the flow is wired, not painted. The rules of the look are in
`design.md`; this is about what connects to what.

The assistant is a **Maty**. Maties is the plural. « Matey » is never
written.

## The six screens

1. **Welcome.** The sphere, « Welcome to Maties. », one sentence, four
   short cards (works on your computer, knows your documents, keeps
   going while you're away, asks before it acts), then two rows: time
   zone and appearance. Appearance is the app's theme setting, changed
   here and in Settings alike. Time zone is a new setting, the machine's
   zone by default, kept under `app.timezone`. « Continue » is « Sign in
   to continue » while the person is signed out: it opens the browser
   sign-in and moves on when the account is there. Pressing it also
   counts as agreeing to the privacy policy, which the footer links to.
2. **Name your Maty.** The parrot, a large name field, the address
   `<name>@maties.ai` under it, « Suggest another name » cycling Juno,
   Marlow, Wren, Sable, Pip. The name becomes the main agent's name
   (`agents` table, id `main`), which the engine reads as its identity,
   and it shows wherever the app names the assistant.
3. **Choose a voice.** Five orbs: Concise, Balanced, Warm, Direct, Sassy.
   The chosen one is how the assistant writes: a short « Voice » section
   in the engine's managed instructions (`AGENTS.md`, main workspace).
   The play button reads a sample sentence aloud with the computer's own
   speech, so the person hears the difference today; a Maties voice from
   Claidor's servers replaces it when the cast lands (step 4).
4. **How to reach {name}.** The assistant's address (Gmail card), Slack
   Bot, iMessage, WhatsApp, Telegram, iOS. Telegram and Discord open the
   app's channel settings. The others are shown and do something honest
   when pressed: a small sheet saying it is coming, with « Tell me when »
   that remembers the wish. Nothing is hidden.
5. **Some more connections.** Sixty-five connections in eleven groups,
   with search. Each card knows what it is:
   - **mcp**: one of the fifteen servers in Claidor's catalogue. Connect
     opens the same install form the Connectors page uses.
   - **channel**: a way to reach the assistant; same as screen 4.
   - **browser**: no account needed, the assistant uses the person's own
     browser (shopping, travel, the social networks). Shown as ready.
   - **local**: on this computer already (Apple Calendar, Notes,
     Reminders, Word, Excel, PowerPoint). Shown as ready.
   - **soon**: not wired yet. The honest sheet, as above.
   « Connected » is never a stored flag: it is read from the app's real
   state (an MCP server installed, a channel configured).
6. **Done.** « {name}, your personal Maty, is all set » and « Go to
   workspace », which opens the chat.

The dots at the top count six. Back goes one step. The footer has the
privacy policy, the terms and « Log out ». The step is remembered, so a
closed app reopens where it was; « Go to workspace » sets
`onboarding.v1.completed`, after which the flow never shows again. The
old tour (the card tips over the app) and the welcome conversation are
retired with this flow.

## In the workspace

The same catalogue is the **Connectors** section of Skills &
Connectors: « How to reach {name} » on top, the eleven groups under it,
and « Your own servers » at the bottom, which is the MCP manager as it
was. One catalogue, one set of cards, two places that show it.

## The engine's own questions

A brand-new engine workspace comes with a first-run questionnaire
(`BOOTSTRAP.md`): the assistant asks « what is my name, my nature, my
vibe, my emoji, and what should I call you » in the first conversation.
Maties asked all that on its own screens, so on « Finish setup », and
again on every engine sync once the onboarding is complete, the answers
are written in the engine's own files in the main workspace and the
questionnaire is removed (`src/main/libs/openclawWorkspaceProfile.ts`):

- `IDENTITY.md`: the name, « an AI assistant, a Maty », the vibe line
  of the chosen voice, the bird as emoji. Rewritten whenever its name
  line stops matching the profile (a rename in the app).
- `USER.md`: the person's account name, what to call them, the time
  zone. Written only when the file has no name yet; afterwards only the
  time zone line is refreshed, so what the engine learns stays.
- `SOUL.md`: who the assistant is, in the chosen voice. Written only
  when missing; never overwritten.

## What is stored

`src/shared/onboarding/constants.ts` is the contract: the `kv` keys, the
five voices, the name suggestions, the two IPC channels
(`onboarding:get-profile`, `onboarding:apply-profile`).

## Not in this round

Slack, WhatsApp, iMessage, Signal, Teams and Google Chat as channels:
the engine ships them, our build strips them, and turning them on is a
packaging and settings round (plan step 12). The integration service
for the apps with an API (Composio or Pipedream, the founder's choice)
is wired when chosen; until then those cards say « Soon ». The
assistant's real mailbox comes with the cloud engine (step 3).
