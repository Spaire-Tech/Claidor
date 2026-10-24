/**
 * ShowList (24 October 2026): the list card (`shared/list-card.ts`). Three
 * or more things of one kind as a row each, instead of a paragraph that
 * strings them together (the founder, of a group's cost update: "no human
 * being can follow easily"; then "I'm thinking to have things like that come
 * in cards"). The agent names the rows; the apps draw them, as the flights
 * and products cards. A picture from the web is kept on the computer, as a
 * product's is, so the apps don't depend on the site to show it.
 */
import { z } from "zod";
import { defineCommunicateTool } from "./communicate-tool.js";
import { LIST_MESSAGE_TYPE, listCardText, type ListCardItem, type ListCardMessage } from "../../../shared/list-card.js";

export const showListParameters = z.object({
  title: z.string().trim().min(1).max(80).describe("What the rows are, in the person's language: \"Coût matières par portion\", \"Sunday roast\"."),
  subtitle: z.string().trim().max(100).optional().describe("One short grey line under the title, only when it helps: the dates the figures are from, \"For 6\". Never a caveat: say that in a message after the card."),
  items: z.array(z.object({
    title: z.string().trim().min(1).max(80).describe("The thing's name: \"Mafé\", \"Rosemary and garlic lamb\"."),
    detail: z.string().trim().max(140).optional().describe("One short line about it, only when it adds something; never the figure again."),
    amount: z.string().trim().max(28).optional().describe("Money only, as the person reads it, with its currency: \"$500\", \"717–805 FCFA\", \"€12.50\". Shown at the right, in blue."),
    value: z.string().trim().max(28).optional().describe("Any other figure, at the right: \"2 h\", \"12 kg\", \"3 of 5\". Left out when there is an amount."),
    tag: z.string().trim().max(20).optional().describe("A word or two of status, only when it matters: \"à valider\", \"done\", \"missing\"."),
    tone: z.enum(["neutral", "pending", "done", "problem"]).optional().describe("The tag's colour: pending (orange: waiting, to check), done (green), problem (red), neutral (grey, the default)."),
    image_url: z.string().trim().optional().describe("A real picture of this very thing (https): its page's own photo (og:image), the product's, the place's. Only for things you can see (food, products, places, people); never a made-up, generic or stock picture, and none for figures or tasks."),
    url: z.string().trim().optional().describe("Its page (https), when there is one worth opening: the recipe, the listing, the place."),
  })).min(3).max(8).describe("The rows, in the order that matters (best, biggest or soonest first): one thing each, three to eight of one kind."),
});

export interface ListToolDependencies {
  /** Appends the card; returns its entry id when the transport reports one. */
  emitCard(message: ListCardMessage, timestampMs: number): string | undefined;
  /** A picture from the web, kept where the apps can read it. */
  persistPicture?(url: string): Promise<{ readonly url: string } | undefined>;
  now?: () => number;
}

const HTTPS = /^https:\/\/\S+$/i;

/** One row as the card carries it: https addresses only, money or another figure, never both. */
export function listItemFromArgs(item: z.infer<typeof showListParameters>["items"][number]): ListCardItem {
  const amount = item.amount ?? "", value = item.value ?? "", tag = item.tag ?? "", detail = item.detail ?? "";
  const url = (item.url ?? "").trim(), image = (item.image_url ?? "").trim();
  return {
    title: item.title,
    ...(detail.length > 0 ? { detail } : {}),
    ...(amount.length > 0 ? { amount } : value.length > 0 ? { value } : {}),
    ...(tag.length > 0 ? { tag, ...(item.tone == null || item.tone === "neutral" ? {} : { tone: item.tone }) } : {}),
    ...(HTTPS.test(image) ? { imageUrl: image } : {}),
    ...(HTTPS.test(url) ? { url } : {}),
  };
}

export function createShowListTool(deps: ListToolDependencies) {
  return defineCommunicateTool(deps, {
    id: "SHOW_LIST",
    name: "ShowList",
    description: "Show three to eight things of one kind as a card, a row each, instead of writing them out in a message: dishes with their cost, a menu, options to weigh, places, people, what's done and what's left. This is how any such list reaches the person, even when they asked for a list (\"suggest 4 restaurants\"); a list of them in text is not delivered. Each row has its name, one short line, a figure at the right (amount for money, shown in blue; value for anything else), a short tag, a real picture and its page, each only when it helps. Before the card, one short message saying what it is; after it, anything else (a caveat, what's missing, a question) in a short message of its own, never inside the card. Not for flights (SearchFlights shows those) or things to buy (ShowProducts), and not for one or two things: write those. Never repeat the rows in text.",
    parameters: showListParameters,
    describeActivity: (args: z.infer<typeof showListParameters>) => ({ detail: `Showing ${args.title}` }),
    execute: async (_ctx, args: z.infer<typeof showListParameters>, resolved) => {
      const items = args.items.map(listItemFromArgs);
      // The pictures kept on the computer, all at once; one that can't be kept stays at its address.
      const kept = await Promise.all(items.map(async (item) => item.imageUrl == null ? undefined : await resolved.persistPicture?.(item.imageUrl).catch(() => undefined)));
      const rows = items.map((item, index) => { const picture = kept[index]; return picture == null ? item : { ...item, imageUrl: picture.url }; });
      const subtitle = args.subtitle ?? "";
      const card = { title: args.title, ...(subtitle.length > 0 ? { subtitle } : {}), items: rows };
      const message: ListCardMessage = { type: LIST_MESSAGE_TYPE, content: listCardText(card), ...card };
      const entryId = resolved.emitCard(message, (resolved.now ?? Date.now)());
      return `The list card is in the chat${entryId == null ? "" : ` (entry ${entryId})`}. Don't repeat its rows in text. Anything else (a caveat, what's missing, a question) goes in one short message after it.`;
    },
  });
}
