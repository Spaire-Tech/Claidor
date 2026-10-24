/**
 * A list written in a message, where the list card belongs (24 October 2026).
 *
 * With ShowList offered and the brief saying when to use it, agents went on
 * writing lists: "1. Restaurant Lagon 1: French and African…" for four
 * restaurants, "- Thiéboudiène : 717 à 805 FCFA" for four dishes (the
 * founder: "no card. literally"). A text that lists three to eight things,
 * each "Name: …" on its own line, is now held once, and the agent is told to
 * send it as the card. The same words sent again go through, so a list that
 * truly isn't one (steps to follow) is never stuck, and nothing goes silent.
 */
export const LIST_HOLD_WINDOW_MS = 30 * 60_000;

/** "- x", "* x", "• x", "1. x", "2) x". */
const ITEM = /^\s{0,3}(?:[-*+•]|\d{1,2}[.)])\s+(.*\S)\s*$/;
/** "Name: …", "**Name**: …", "Thiéboudiène : …": a short name, then its colon. */
const NAMED = /^(?:\*\*|__)?([^:\n]{1,60}?)(?:\*\*|__)?\s?:\s*\S/;
/** Steps to follow keep their numbers ("Step 1: …", in the apps' languages). */
const STEP = /^(?:step|étape|etapa|paso|schritt|passo|stap|krok|adım|steg)\b/i;

/** How many things one list in the message names, "Name: …" a line, when it is 3 to 8 of them; else 0. */
export function listedThings(content: string): number {
  const lists: string[][] = [];
  let items: string[] = [];
  let fenced = false;
  const close = () => { if (items.length > 0) lists.push(items); items = []; };
  for (const line of content.split("\n")) {
    if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; close(); continue; }
    if (fenced) continue;
    const item = ITEM.exec(line);
    if (item != null) { items.push(item[1] ?? ""); continue; }
    // A blank line between items, or an item's own indented second line, keeps the list.
    if (line.trim().length === 0 || (items.length > 0 && /^\s{2,}\S/.test(line))) continue;
    close();
  }
  close();
  for (const list of lists) {
    if (list.length < 3 || list.length > 8) continue;
    const named = list.every((item) => {
      const name = NAMED.exec(item)?.[1]?.trim();
      return name != null && name.length > 0 && !STEP.test(name) && !/https?$/i.test(name);
    });
    if (named) return list.length;
  }
  return 0;
}

const held = new Map<string, number>();

/** True the first time these words come (they are held); false when they come again within the window (they go through). */
export function holdForCard(content: string, nowMs: number): boolean {
  for (const [words, atMs] of held) if (nowMs - atMs > LIST_HOLD_WINDOW_MS) held.delete(words);
  const words = content.trim();
  if (held.has(words)) { held.delete(words); return false; }
  if (held.size >= 200) held.clear();
  held.set(words, nowMs);
  return true;
}

/** What the agent reads instead of "sent". */
export function listCardNudge(count: number): string {
  return `it lists ${count} things of one kind, which go in a list card. Send one short message saying what they are, then call ShowList with them (a row each: the name, its figure as amount for money or value otherwise, one short line, a real picture for a place or a dish), then anything else (a caveat, what's missing, a question) in a short message after the card. Only if they truly aren't things of one kind, such as steps to follow, send these same words again and they go through.`;
}
