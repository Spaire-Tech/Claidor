/**
 * The total on the checkout card, checked against the checkout page itself
 * (18 October 2026). The card's total is the agent's own reading of the page
 * and Link is asked for exactly that amount; on the founder's first Haiku
 * test the agent quoted a monitor at $159.99 that the shop sold at $139.99.
 * A total the page doesn't show is refused before Link is asked, with the
 * page's own figure, so a number the model made up never reaches a payment.
 *
 * The page is read as its text (`document.body.innerText`). A shop names its
 * total ("Total", "Order total", "Grand total", "Total due"), with the amount
 * on the same line or one of the next few (Shopify: "Total", "USD",
 * "$179.99"); when the page names one, the card's total must be it. When it
 * names none, the total must at least be an amount the page shows.
 */
import { ZERO_DECIMAL } from "./purchase-card.js";

function minorUnits(currency: string): number {
  return ZERO_DECIMAL.has(currency.trim().toLowerCase()) ? 0 : 2;
}

/** Digits of a whole part, its thousands separators taken out ("1,234", "1.234", "1 234" with a no-break space). */
function wholePart(text: string): number {
  return Number(text.replace(/[^\d]/g, ""));
}

const WITH_DECIMALS = /(?<![\d.,])(\d{1,3}(?:[,.\u00a0\u202f]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
const SYMBOL_WHOLE = /[$€£¥₹₩]\s?(\d{1,3}(?:[,.\u00a0\u202f]\d{3})+|\d+)(?![.,]?\d)/g;
const BARE_WHOLE = /(?<![\d.,])(\d{1,3}(?:[,.\u00a0\u202f]\d{3})+|\d+)(?![.,]?\d)/g;

/** Every amount in `text`, in the currency's smallest unit, in the order they appear. */
export function moneyAmountsIn(text: string, currency: string): number[] {
  const found: { index: number; amount: number }[] = [];
  if (minorUnits(currency) === 0) {
    for (const match of text.matchAll(BARE_WHOLE)) found.push({ index: match.index ?? 0, amount: wholePart(match[1] ?? "") });
  } else {
    for (const match of text.matchAll(WITH_DECIMALS)) found.push({ index: match.index ?? 0, amount: wholePart(match[1] ?? "") * 100 + Number(match[2]) });
    // "$1,234" with no cents: only with its currency sign, or every bare number would count.
    for (const match of text.matchAll(SYMBOL_WHOLE)) found.push({ index: match.index ?? 0, amount: wholePart(match[1] ?? "") * 100 });
  }
  return found.sort((a, b) => a.index - b.index).map((one) => one.amount).filter((amount) => Number.isFinite(amount));
}

const TOTAL_LABEL = /^(?:order\s+|grand\s+|estimated\s+)?total(?:\s+(?:due|to\s+pay|price|amount))?(?:\s*\([a-z]{3}\))?\s*:?/i;
const NOT_THE_TOTAL = /sub\s*-?\s*total|total\s+(?:savings|saved|discount|items?)|items?\s+total/i;

/** A line that holds nothing but an amount and its currency ("$179.99", "USD $179.99", "1.234,56 €", "USD"). */
function onlyMoney(line: string): boolean {
  return line.replace(/\b[A-Z]{3}\b/g, "").replace(/[\d.,\s\u00a0\u202f$€£¥₹₩]/g, "").length === 0;
}

/** The amounts the page names as its total, in page order (a checkout often shows its summary twice). */
export function labelledTotalsIn(text: string, currency: string): number[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  const totals: number[] = [];
  lines.forEach((line, index) => {
    if (!TOTAL_LABEL.test(line) || NOT_THE_TOTAL.test(line)) return;
    // The amounts on the label's own line ("Order total: $1,234.56"; all of them, as "Total (2 items) ¥17,999" holds a count)...
    const own = moneyAmountsIn(line.replace(TOTAL_LABEL, ""), currency);
    if (own.length > 0) { totals.push(...own); return; }
    // ...else on the lines right after it that hold nothing but money ("Total", "USD", "$179.99"),
    // never past a line of words: "Total", "Calculated at next step", "Shipping", "$5.00" names no total.
    for (const next of lines.slice(index + 1, index + 4)) {
      if (!onlyMoney(next)) return;
      const amounts = moneyAmountsIn(next, currency);
      if (amounts.length > 0) { totals.push(amounts[0]!); return; }
    }
  });
  return totals;
}

export type CheckoutTotalCheck =
  | { readonly ok: true; readonly how: "labelled" | "shown" }
  | { readonly ok: false; readonly message: string; readonly pageTotal?: number };

/**
 * Whether the card's `total` is the checkout's: the amount the page names as
 * its total when it names one, else an amount the page shows. `format` writes
 * an amount the way the card does, for the message.
 */
export function checkTotalOnPage(args: { readonly total: number; readonly currency: string; readonly pageText: string; readonly format: (amount: number) => string }): CheckoutTotalCheck {
  const { total, currency, pageText, format } = args;
  const labelled = labelledTotalsIn(pageText, currency);
  if (labelled.length > 0) {
    if (labelled.includes(total)) return { ok: true, how: "labelled" };
    const pageTotal = labelled.at(-1)!;
    return { ok: false, pageTotal, message: `The checkout page's total is ${format(pageTotal)}, not ${format(total)}. Nothing was asked of the wallet. Read the items and totals again from the page and call RequestPurchase with the total it shows; if the person was told another price, tell them the right one first.` };
  }
  const shown = moneyAmountsIn(pageText, currency);
  if (shown.includes(total)) return { ok: true, how: "shown" };
  if (shown.length === 0) return { ok: false, message: "No prices could be read on the checkout page, so the total can't be checked. Nothing was asked of the wallet. Open the checkout at its last step before paying in your computer's browser, then call RequestPurchase again." };
  const amounts = [...new Set(shown)].slice(0, 6).map(format).join(", ");
  return { ok: false, message: `${format(total)} isn't on the checkout page (it shows ${amounts}). Nothing was asked of the wallet. Read the total again from the page and call RequestPurchase with it.` };
}
