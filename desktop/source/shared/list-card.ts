// The list card (24 October 2026, the founder after a group's cost update
// came as one long paragraph: "I'm thinking to have things like that come in
// cards", with the flights and products cards as the model). Three or more
// things of one kind, a row each: its name, one grey line, a figure at its
// right (money in blue, the currency too), a short tag, a picture of what it
// is, and its page. The agent fills it with ShowList
// (`host/runner/tools/list-card-tool.ts`); the apps draw it (SimeonCore's
// `ListCard.swift`). A caveat or what's missing goes in the agent's own
// messages around it, never in the card.

export const LIST_MESSAGE_TYPE = "list";

/** A row's tag tone: grey; orange for waiting or to check; green for done; red for a problem. */
export type ListTagTone = "neutral" | "pending" | "done" | "problem";

export interface ListCardItem {
  readonly title: string;
  /** One line under the name. */
  readonly detail?: string;
  /** Money at the right, as it should read: "717–805 FCFA", "$500". Drawn blue. */
  readonly amount?: string;
  /** Any other figure at the right: "2 h", "12 kg", "3 of 5". */
  readonly value?: string;
  readonly tag?: string;
  readonly tone?: ListTagTone;
  /** A picture of what it is: kept on the computer (`file:`), else its https address. */
  readonly imageUrl?: string;
  /** Its page (https), which a tap opens. */
  readonly url?: string;
}

export interface ListCardMessage {
  readonly type: typeof LIST_MESSAGE_TYPE;
  /** The card in words, for an app from before the card (and the web app). */
  readonly content: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly items: readonly ListCardItem[];
}

/** The card as plain text: its title, its line, then a line a row ("- Mafé: 966 FCFA (à valider)"). */
export function listCardText(card: { readonly title: string; readonly subtitle?: string; readonly items: readonly ListCardItem[] }): string {
  const lines = [card.title, ...(card.subtitle == null ? [] : [card.subtitle])];
  for (const item of card.items) {
    const figure = item.amount ?? item.value;
    const head = `- ${item.title}${figure == null ? "" : `: ${figure}`}${item.tag == null ? "" : ` (${item.tag})`}`;
    lines.push(item.detail == null ? head : `${head}. ${item.detail}`);
  }
  return lines.join("\n");
}
