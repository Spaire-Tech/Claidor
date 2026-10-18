// The products card (14 October 2026, the founder after Muse: "First of all
// it shows the card of what its about to buy. You click buy with muse. The
// card appears and everything is ready."). Before a purchase, the agent shows
// what it found: each product's picture, name, seller and price as the shop
// shows them. The person opens one and presses "Buy with <agent>" (or "View
// website"); Buy marks that product on the card (`productsBuying`) and wakes
// the agent with exactly which one, and the purchase goes on as every
// purchase does, to the checkout card (`purchase-card.ts`). Once that
// purchase is ordered the product is marked bought (`productsBought`, 18
// October 2026, the founder: "then bought … once that is done - in green").

export const PRODUCTS_MESSAGE_TYPE = "products";

export interface ProductCardItem {
  readonly title: string;
  /** The product's own page on the shop. */
  readonly url: string;
  /** The shop's site, "gumroad.com". */
  readonly domain: string;
  /** As the shop writes it: "$2.23". */
  readonly price?: string;
  /** Who makes or sells it: "Daria Bogdanova". */
  readonly seller?: string;
  /** The product's own picture on the shop (https). */
  readonly imageUrl?: string;
  /** One line: format, size, what's in it. */
  readonly description?: string;
  /**
   * The product as Shop's catalog knows it (14 October 2026, `shop-tools.ts`
   * `search_products`): the featured variant and the store's Shopify domain,
   * so Buy can open the checkout through Shop instead of the browser.
   */
  readonly shop?: { readonly variantId: string; readonly domain: string };
}

export interface ProductsCardMessage {
  readonly type: typeof PRODUCTS_MESSAGE_TYPE;
  /** The card in words, for an app from before the card. */
  readonly content: string;
  readonly products: readonly ProductCardItem[];
}

/** The entry's own fields: the product the person pressed Buy on (its index) while it is being bought, and those bought. */
export interface ProductsEntryFields {
  readonly productsBuying?: number;
  readonly productsBought?: readonly number[];
}

/** The same store, "www." aside: "checkout.bestbuy.com" is bestbuy.com's. */
export function sameStore(a: string, b: string): boolean {
  const one = a.trim().replace(/^www\./i, "").toLowerCase(), other = b.trim().replace(/^www\./i, "").toLowerCase();
  return one.length > 0 && other.length > 0 && (one === other || one.endsWith(`.${other}`) || other.endsWith(`.${one}`));
}

/**
 * The product an ordered purchase bought, of a card whose Buy was pressed:
 * the pressed one when the purchase was at its store, else the one other
 * product on the card from that store (the agent went on to a like item when
 * the first store blocked it); none when the purchase was anywhere else.
 */
export function productBoughtBy(products: readonly ProductCardItem[], pressed: number, purchase: { readonly domain: string }): number | undefined {
  const atStore = (product: ProductCardItem | undefined): boolean => product != null && [product.domain, product.shop?.domain].some((domain) => domain != null && sameStore(domain, purchase.domain));
  if (atStore(products[pressed])) return pressed;
  const others = products.flatMap((product, index) => atStore(product) ? [index] : []);
  return others.length === 1 ? others[0] : undefined;
}

/** "Practice Book · $2.23", or the first two and how many more. */
export function productsCardText(products: readonly ProductCardItem[]): string {
  const line = (product: ProductCardItem): string => product.price == null || product.price.length === 0 ? product.title : `${product.title} · ${product.price}`;
  if (products.length === 1) return line(products[0]!);
  const shown = products.slice(0, 2).map(line).join("; ");
  return products.length > 2 ? `${shown}; and ${products.length - 2} more` : shown;
}

/** The person pressed Buy on one product: the agent buys exactly that one, through the checkout card. */
export function buildProductBuyWakePrompt(entryId: string, product: ProductCardItem): string {
  const who = product.seller == null || product.seller.length === 0 ? "" : ` by ${product.seller}`;
  const price = product.price == null || product.price.length === 0 ? "" : ` for ${product.price}`;
  const browser = "have a browser subagent put it in the cart and go to the shop's checkout (guest checkout when the shop allows it, contact and delivery details from Link's get_wallet or Shop's get_account), stopping at the last step before paying; ask only for what's missing, in one message; then call RequestPurchase.";
  return [
    `[The person pressed Buy on the products card (entry ${entryId}): "${product.title}"${who}${price}, ${product.url}. Buy this one, the way every purchase goes (if its store blocks the purchase, go on to the next comparable item at the same price or lower, as the purchase steps say):`,
    "say in one short line that you're setting up the checkout;",
    product.shop == null
      ? browser
      : `it is in Shop's catalog (variant_id "${product.shop.variantId}", shop "${product.shop.domain}"): when Shop is connected, call prepare_checkout on Shop (server "shop") with that shop and variant (quantity 1 unless they said otherwise), merchant_name, product_url "${product.url}" and their phone and email from Link's get_wallet, then RequestPurchase with the shop_checkout it gives (or send them Shop's own page to review and pay when it gives one); when Shop isn't connected or the checkout isn't ready, ${browser}`,
    "Don't ask them to confirm again in chat or which card pays: the checkout card does both.]",
  ].join(" ");
}
