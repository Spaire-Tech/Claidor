/**
 * The prices Shop's catalog gave for the products the agent found
 * (search_products, get_product), kept so the products card shows the
 * catalog's price rather than the agent's copy of it (18 October 2026: the
 * founder's agent quoted a monitor at $159.99 that the catalog and the shop
 * both sold at $139.99). Per host process: the latest 500 variants, each
 * trusted for six hours; the checkout card's total is checked against the
 * shop's own page anyway (`link-wallet/checkout-total.ts`).
 */
export interface CatalogPrice {
  /** In the currency's smallest unit, as the catalog gives it. */
  readonly amount: number;
  readonly currency: string;
  /** As the card writes it: "$139.99". */
  readonly price: string;
  /** The list price when it's on sale, written the same way. */
  readonly was?: string;
  readonly seenAtMs: number;
}

const KEEP = 500;
const FRESH_MS = 6 * 60 * 60_000;
const book = new Map<string, CatalogPrice>();

/** One key for "gid://shopify/ProductVariant/123" and "123". */
function keyOf(variantId: string): string {
  const id = variantId.trim();
  return /(\d+)$/.exec(id)?.[1] ?? id;
}

export function rememberCatalogPrice(variantId: string, price: Omit<CatalogPrice, "seenAtMs">, nowMs = Date.now()): void {
  const key = keyOf(variantId);
  if (key.length === 0 || !Number.isFinite(price.amount) || price.price.length === 0) return;
  book.delete(key);
  book.set(key, { ...price, seenAtMs: nowMs });
  while (book.size > KEEP) book.delete(book.keys().next().value as string);
}

/** The catalog's price for a variant the agent was shown in the last six hours, if any. */
export function catalogPriceFor(variantId: string, nowMs = Date.now()): CatalogPrice | undefined {
  const known = book.get(keyOf(variantId));
  return known != null && nowMs - known.seenAtMs <= FRESH_MS ? known : undefined;
}

export function forgetCatalogPricesForTest(): void {
  book.clear();
}
