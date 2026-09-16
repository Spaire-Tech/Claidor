import { createLibrary, defineComponent, type Library } from '@openuidev/lang-core';
import { z } from 'zod/v4';

/**
 * The answer cards: what an agent may draw beside its texts.
 *
 * **Why this exists.** The founder, 17 September, on OpenUI
 * (`thesysdev/openui`, MIT): *"text should stays text, but having cards
 * that come with it is amazing … this should 100% be our design."* A
 * reply to "find me the best restaurants in Seattle" or "plan my Tokyo
 * trip" is a few texts and, between them, a set of cards: places with a
 * picture, figures with a label, a table, a banner. The texts still
 * arrive as texts; the cards arrive with them, drawn by us.
 *
 * **How it works.** This file is the one list of what the agent may
 * draw, as OpenUI component definitions: a name, its arguments in
 * order, one line of what it is for. From it, main generates the
 * section of the brief that teaches the agent the language
 * (`main/libs/cardsPrompt.ts`), and the renderer builds the library
 * that draws each component with our own React
 * (`renderer/design/thread/CardBlock.tsx`). The agent writes a fenced
 * block in its reply:
 *
 *     ```openui-lang
 *     root = Stack([intro, places])
 *     intro = Text("Three worth the trip.", "muted")
 *     places = Row([a, b])
 *     a = Tile("Canlis", "Panoramic views, iconic fine dining", "Fine dining")
 *     b = Tile("Spinasse", "Hand-cut tajarin", "Italian")
 *     ```
 *
 * and the thread shows the block as a card between the bubbles
 * (`fromEngine.ts`, `splitCardSegments`).
 *
 * **Arguments are positional**, so required ones come first in every
 * schema here; an optional argument left out is simply absent.
 *
 * **What is deliberately not here.** No free layout, no colours, no
 * sizes: the agent chooses which cards, never how they look. No forms
 * and no inputs: a question is the choice card and a secret is the
 * secret card, both ours already. No queries or tool calls from inside
 * a card: a card is a picture of an answer, not a program.
 */

/** The fence the agent writes the block in, as OpenUI names it. */
export const CARD_FENCE = 'openui-lang';

/** How many cards may sit in one row before it scrolls. Advice to the model, not a limit. */
export const ROW_ADVICE = 3;

/**
 * Every image a card shows must be a real address the agent has seen.
 * The schema says `url`, which the parser does not enforce, so the
 * renderer checks with `cardImageUrl` before drawing anything.
 */
const image = z.string().url().optional();

/** The address a card may load a picture from: https, well formed, or nothing. */
export function cardImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export const Text = defineComponent({
  name: 'Text',
  props: z.object({
    text: z.string(),
    tone: z.enum(['body', 'muted', 'title']).optional(),
  }),
  description: 'One line or short paragraph inside the card block. Tone: body (default), muted (a caption), title (a heading).',
  component: 'Text',
});

export const Tile = defineComponent({
  name: 'Tile',
  props: z.object({
    name: z.string(),
    line: z.string().optional(),
    tag: z.string().optional(),
    image,
    action: z.string().optional(),
  }),
  description: 'One thing among several: a place, a product, a day of a plan, an option. Name, one line under it, a small tag ("Fine dining", "Day 1"), a picture if you have a real URL, and an action label ("Book", "Choose") which sends that choice back to you as a message.',
  component: 'Tile',
});

export const Metric = defineComponent({
  name: 'Metric',
  props: z.object({
    label: z.string(),
    value: z.string(),
    note: z.string().optional(),
  }),
  description: 'One figure with its label and an optional note: label "Total matches", value "104", note "39-day tournament".',
  component: 'Metric',
});

export const Fact = defineComponent({
  name: 'Fact',
  props: z.object({
    label: z.string(),
    value: z.string(),
  }),
  description: 'A small label and its value, for a highlights grid: "Currency" / "Euro (€)", "Best time to visit" / "April to October".',
  component: 'Fact',
});

export const Banner = defineComponent({
  name: 'Banner',
  props: z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    image,
  }),
  description: 'A wide header for the whole block: a title, a line under it, and a picture behind if you have a real URL.',
  component: 'Banner',
});

export const Table = defineComponent({
  name: 'Table',
  props: z.object({
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  description: 'A comparison: column headings, then rows of cells as strings. Use it when several things are compared on the same points.',
  component: 'Table',
});

export const Button = defineComponent({
  name: 'Button',
  props: z.object({
    label: z.string(),
    message: z.string().optional(),
  }),
  description: 'One button. Pressing it sends `message` (or the label) back to you as the person\'s next message.',
  component: 'Button',
});

export const Row = defineComponent({
  name: 'Row',
  props: z.object({
    children: z.array(z.union([Tile.ref, Metric.ref, Fact.ref])),
  }),
  description: `Tiles, Metrics or Facts side by side; scrolls sideways past ${ROW_ADVICE}.`,
  component: 'Row',
});

export const Grid = defineComponent({
  name: 'Grid',
  props: z.object({
    children: z.array(z.union([Fact.ref, Metric.ref])),
  }),
  description: 'Facts or Metrics in two columns, for a highlights section.',
  component: 'Grid',
});

export const Stack = defineComponent({
  name: 'Stack',
  props: z.object({
    children: z.array(z.union([Banner.ref, Text.ref, Row.ref, Grid.ref, Table.ref, Tile.ref, Metric.ref, Button.ref])),
    title: z.string().optional(),
    subtitle: z.string().optional(),
  }),
  description: 'The block itself, items one under another. Root of every program. Title and subtitle are optional and sit at the top.',
  component: 'Stack',
});

/** Every card component, root first. The order is the order in the brief. */
export const CARD_COMPONENTS = [Stack, Banner, Text, Row, Grid, Tile, Metric, Fact, Table, Button] as const;

export type CardComponentName = typeof CARD_COMPONENTS[number]['name'];

/** The library as the prompt and the parser see it. Renderers build their own from `CARD_COMPONENTS`. */
export const CARD_LIBRARY: Library<string> = createLibrary({
  components: [...CARD_COMPONENTS],
  root: 'Stack',
  id: 'caisra-cards',
});
