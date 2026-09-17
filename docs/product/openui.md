# OpenUI and Thesys: what they are, what we have, what we got wrong

Research, 18 September 2026. Sources: `thesys.dev`, `openui.com`, their
CLI (`@openuidev/cli create`), the self-hosted template it scaffolds,
their official agent skill, and the packages already in
`desktop/node_modules` (`@openuidev/thesys` 0.14.0,
`@openuidev/react-ui` 0.14.0).

The founder, 18 September: *"this is how an agent should behave.
otherwise just use chat gpt."*

Everything here was read from their code or their own words. Where a
thing is a judgement rather than a fact, it says so.

---

## 0. The one-line finding

**We have the right library and the wrong prompt.** OpenUI ships an
official prompt for chat answers, `openuiChatPromptOptions`. Our
generator does not use it. It passes `inlineMode: true`, deletes their
four worked examples, and deletes all thirteen of their rules. Almost
every rule we wrote in their place says the opposite of theirs.

---

## 1. The two names

**Thesys** is the company. "The Generative UI Company." They sell
**OpenUI Cloud**, a hosted gateway, plus a Reports API and
observability. Compliance badges (SOC2, ISO27001, GDPR) and an
enterprise motion. `docs.thesys.dev` now 307-redirects to
`openui.com/docs`, so the C1 branding is being folded into OpenUI.

**OpenUI** is the thing they gave away: *"the open standard for
generative UI."* Fully open source, MIT, works with your own models and
your own infrastructure. The cloud parts are optional:

- **OpenUI Gateway**: "OpenRouter for Generative UI." One API across
  providers, with failover and **model-output correction that prevents
  broken interfaces**.
- **OpenUI Observability**: analytics and session monitoring.

We use neither, and we do not need to. But note what the Gateway is
for: their own product assumes models get the language wrong often
enough to need a repair layer. That is a fact about this technique, not
about any one model, and §7 comes back to it.

## 2. OpenUI Lang

A line-based assignment language. One statement per line,
`identifier = Expression`, positional arguments only, `root = ...` first
for streaming, forward references allowed. The model writes a program,
not code that runs; the renderer maps names to React components. No
arbitrary execution, which is why it is safe to render.

## 3. The official wiring, from their own scaffold

`npx @openuidev/cli@latest create --template openui-self-hosted` is the
template for people who own their provider and their route. That is
exactly us. It is about ten files. The whole of it:

```ts
// src/app/api/chat/route.ts
import { generateSystemPrompt } from "@openuidev/lang-core";
import { promptOptions } from "@/lib/prompt-options";
import librarySpec from "@/generated/spec.json";

messages: [
  { role: "system", content: generateSystemPrompt({ library: librarySpec, promptOptions }) },
  ...messages,
]
```

```ts
// src/lib/prompt-options.ts  — the entire file
export { openuiPromptOptions as promptOptions } from "@openuidev/react-ui/genui-lib/prompt-options";
```

The system prompt is generated from the library spec plus **their**
prompt options. The template's own prompt-options file is one re-export
line. That is the intended shape: you take theirs.

Their skill says it more directly still:

> Use `openuiChatLibrary` for chat responses: a `Card` root plus
> chat-oriented components like follow-ups, steps, callouts, list
> blocks, and section blocks.
> ```ts
> const systemPrompt = openuiLibrary.prompt(openuiPromptOptions);
> ```

## 4. The two chat libraries

`@openuidev/react-ui/genui-lib` exports four things that matter:
`openuiLibrary` (root `Stack`, for dashboards), `openuiChatLibrary`
(root `Card`, 58 components, for chat), and the matching
`openuiPromptOptions` / `openuiChatPromptOptions`.

`@openuidev/thesys` exports `chatLibrary`: also root `Card`, **73
components**. It is a superset, and it holds the rich blocks:

| Only in thesys `chatLibrary` | Only in `openuiChatLibrary` |
|---|---|
| `CompositeCardBlock`, `VisualCardBlock`, `OverviewCardBlock`, `SnippetCardBlock`, `ContextCardBlock` | `CardHeader`, `Callout`, `ListBlock`, `FollowUpItem`, `SectionItem`, `Carousel` |
| `ImageTextLarge`, `ImageText`, `IconText`, `Icon`, `EntityList` | `MarkDownRenderer`, `CodeBlock`, `Separator` |
| `Chips`, `OptionCards`, `ButtonGroup`, `EditableTable`, `MetricIndicator*` | chart part types (`Series`, `Slice`, `Point`) |

The founder's screenshots show photo tiles with a tag overlay
(`VisualCardBlock`), a header with subtitle, a blue callout, a
scrollable table, tabs with icons, numbered steps and an accordion.
Every one of those is in the thesys set. **We picked the right
library.** The names differ across the two (`Header` not `CardHeader`,
`CalloutV2` not `Callout`, `List` not `ListBlock`,
`SectionBlockItem` not `SectionItem`, `layout: "carousel"` on a card
block rather than a `Carousel` component), which matters only when
copying their examples across.

## 5. `openuiChatPromptOptions`, and our rules next to it

Their file, verbatim, is thirteen rules and four worked examples. The
rules that bear on what the founder saw:

> - Every response is a single `Card(children)` — children stack
>   vertically automatically.
> - Card is the only layout container. Do NOT use Stack. Use Tabs to
>   switch between sections, Carousel for horizontal scroll.
> - Use `FollowUpBlock` at the END of a Card to suggest what the user
>   can do or ask next.
> - Use `ListBlock` when presenting a set of options or steps the user
>   can click to select.
> - Use `SectionBlock` to group long responses into collapsible
>   sections — good for reports, FAQs, and structured content.
> - When asked about data, generate realistic/plausible data.
> - For image carousels, always use real accessible URLs like
>   `https://picsum.photos/seed/KEYWORD/800/500`. Never hallucinate or
>   invent image URLs.

Side by side with the rules we shipped:

| OpenUI's rule | Ours | Result |
|---|---|---|
| "**Every** response is a single Card" | "Use a block **only** when the answer is a set of things… a plan in prose: no block" | Prose by default. The meal plan. |
| `FollowUpBlock` at the end of every Card | one clause, "if there is something to do" | No follow-ups, ever. |
| `ListBlock` for options to click | banned: "never a question that needs an answer in a card" | Questions asked in prose. |
| `SectionBlock` for long responses | not mentioned | 42 flat lines. |
| Their examples open with `CardHeader(...)` | "**No Header and no title line**" | Their look, removed. |
| Four worked examples | none passed | The model had no example of a good answer. |

We also passed `inlineMode: true`, which injects a section written for
their dashboard editor:

> **### 2. Text-only response (when the user asks a QUESTION)**
> If the user asks "what is this?", "explain the chart", "how does this
> work" — respond with plain text. **Do NOT output any openui-lang
> code.** The existing dashboard stays unchanged.

There is no dashboard in a messages app. Every message is a question.
That section alone forbids cards for everything the founder types.

And `toolCalls: false, bindings: false`, which switches off the two
runtime systems in §6.

## 6. What we are not using at all

**Actions.** `Action([@ToAssistant("Submit")])`, `@Run`, `@Set`,
`@Reset`, `@OpenUrl`. A button in a card can send a message back,
re-run a query, or reset a form. We pass `bindings: false` and teach
only `continue_conversation`.

**Reactive state.** `$name = default`. Passing `$var` into a binding
prop is two-way. Changing a `Select` re-evaluates everything
referencing it. So a card can have a filter in it that works without a
round trip to the model.

**Query and Mutation.** `Query` reads on load and refreshes when a
referenced `$variable` changes; `Mutation` is inert until an action
runs it. The React renderer takes `queryLoader` and `toolProvider` for
exactly this. A live card, not a snapshot.

**Component groups.** `openuiChatComponentGroups`. Their reliability
advice says grouping related components measurably helps the model
choose.

**`MarkDownRenderer` and `CodeBlock`** exist in the other chat library
and not in ours, which is worth knowing before we hand-roll either.

Judgement, not fact: actions and `FollowUpBlock` are worth doing now.
Reactive state and Query/Mutation are worth knowing about and not worth
building this week.

## 7. Images: the truth, in three parts

**The renderer draws what it is given.** `Ta(src, alt)` in
`@openuidev/thesys`: `return src ? {resolvedSrc: src, isLoading: false}
: …`. A URL in the program is drawn, full stop.

**The alt-to-photo fallback is real and dead in our copy.** When `src`
is missing, `Ta` calls an image-search function taken from React
context and uses what comes back. That context's Provider is a dead
expression in the bundle and is not among the package's 89 exports, so
it can never be mounted. Their hosted product has it; we have the
package. This is what "OpenUI cannot find an image" meant, and it is
true of the fallback only.

**Their OSS answer is a placeholder service.** Their own rule says use
`https://picsum.photos/seed/KEYWORD/800/500`. That always loads and is
never a photograph of the thing. Our rule bans placeholders, and for a
restaurant recommendation that ban is right: a random stock photo
labelled "Canlis" is worse than no photo.

So there are three routes and we should take the third:

1. Their cloud resolves real photos from `alt`. Not available to us.
2. `picsum.photos`. Always works, never correct.
3. **The model writes a real URL it saw in a search result.** This is
   what produced the founder's screenshots, and OpenUI's own product
   said so when asked. It is the route we can take.

One detail settles the failure case. In the founder's meal-plan
screenshot the "Berry Overnight Oats" tile has no photo: it is a plain
grey panel and the card still reads correctly. A missing `src`
degrades cleanly. Our two-step fetch rule (Wikipedia REST, or browser
plus `og:image`, and nothing else) was guarding against a problem that
does not exist, at a cost of one page load per picture.

## 8. Their own reliability advice

Worth quoting, because it is the part nobody wants to hear:

> LLM-generated interfaces are nondeterministic. A response that
> renders correctly once can fail on a later run by inventing a
> component, using an invalid value, leaving a reference unresolved, or
> ending before the component graph is complete. Establish a baseline
> with representative user prompts and **multiple generations per
> prompt**; measure structural errors and partial or blank renders
> alongside latency and cost. Repeat the same evaluation after every
> change.

And their four interventions, in order: simplify the schema; refine the
prompt with narrow rules and valid examples ("an incorrect example can
cause broad regressions"); evaluate models against your own library;
and validate and correct output before users see it, feeding parser and
renderer errors into a bounded retry.

We do none of the four. We have a harness that renders hand-written
programs, which proves the renderer and nothing else.

## 9. What to change

1. Pass `openuiChatPromptOptions` as the base: their thirteen rules and
   four examples, with component names mapped to the thesys set.
2. Drop `inlineMode`. It is for a dashboard editor.
3. A block is the default for any answer with structure. Short replies,
   yes/no and one-line answers stay text.
4. Delete "a plan in prose: no block", and the Header ban.
5. Let the block be the whole answer, with prose inside it as
   `TextContent`. Their examples do this and it is how the meal plan
   holds together.
6. `FollowUpBlock` at the end. `SectionBlock` for long answers.
   `List`/`Chips`/`OptionCards` for a choice, instead of asking in
   prose.
7. Picture rule: a real URL from a search result, prefer the place's
   own site, leave `src` out if there is none.
8. Delete the inherited `## Deliverable File Links` section, which
   demands a `report.docx` 26,000 characters after we say a report is a
   card.
9. Turn `toolCalls`/`bindings` back on and teach `Action`, so a button
   in a card does something.
10. A baseline of real prompts run several times, per §8, before
    claiming any of this works.

## 10. What is unrun

Everything above is read, not run. Nothing here has been tried against
a live model, and the founder's Mac has run none of it. The scaffold in
§3 was generated with `--no-install` and never started. The claim in §7
about what produced the founder's screenshots rests on their product's
own account of itself, which is not evidence.
