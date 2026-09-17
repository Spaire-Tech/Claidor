/**
 * The worked examples the brief teaches the answer cards with.
 *
 * **Why these exist.** OpenUI's own chat prompt ships four worked
 * examples (`openuiChatPromptOptions.examples`, `@openuidev/react-ui`).
 * Until 18 September our generator passed none: it replaced their
 * `examples` and `additionalRules` with two markers for our own words,
 * so the model read the grammar and the signatures and never saw one
 * finished answer. It answered in prose, every time.
 *
 * Theirs cannot be used as they stand. They are written for
 * `openuiChatLibrary` (58 components) and we render with
 * `@openuidev/thesys`'s `chatLibrary` (73, a superset with different
 * names): `Header` not `CardHeader`, `CalloutV2` not `Callout`, `List`
 * not `ListBlock`, `layout: "carousel"` on a block rather than a
 * `Carousel` component. So these are theirs in shape and ours in
 * vocabulary.
 *
 * **They are checked.** OpenUI's own advice is blunt about the risk:
 * *"an incorrect example can cause broad regressions."* Every example
 * below is parsed against the real library spec when the prompt is
 * generated and again in `cardsPrompt.test.ts`. An unknown component, a
 * bad argument or an unreferenced variable fails the build, so a typo
 * here cannot reach an agent.
 */

/**
 * Example 1: a set of places. The shape behind "find me somewhere to
 * eat": a header that says what the set is, one line of prose, the
 * cards, and what to do next.
 */
const PLACES = `Example 1 — A set of places, each with a picture, tags and a price:

root = Card([head, intro, places, followUps])
head = Header("Where to eat in Seattle", "From a Lake Union institution to a Ballard oyster bar")
intro = TextContent("Canlis is the one for an occasion. The other two are easier to get into and just as good.")
places = CompositeCardBlock([canlis, walrus], "grid")
canlis = CompositeCardItem("canlis", canlisHead, [canlisTags], canlisFoot)
canlisHead = ImageTextLarge("https://upload.wikimedia.org/wikipedia/commons/2/2f/Canlis.jpg", "The dining room at Canlis", "Canlis", "East Queen Anne · Pacific Northwest tasting menu")
canlisTags = TagBlock([Tag("James Beard Winner", "success"), Tag("Book 4 weeks ahead", "warning")])
canlisFoot = { price: BoldText("text", "$220+", "per person"), button: Button("Reserve", { type: "open_url", url: "https://canlis.com" }, "primary") }
walrus = CompositeCardItem("walrus", walrusHead, [walrusTags], walrusFoot)
walrusHead = ImageTextLarge("https://upload.wikimedia.org/wikipedia/commons/8/8f/Oysters.jpg", "A plate of oysters on ice", "The Walrus and the Carpenter", "Ballard · Oyster bar")
walrusTags = TagBlock([Tag("No reservations", "info"), Tag("Local favourite", "success")])
walrusFoot = { price: BoldText("text", "$40 - $80", "per person"), button: Button("Directions", { type: "open_url", url: "https://maps.google.com" }, "secondary") }
followUps = FollowUpBlock(["Somewhere cheaper", "Book Canlis for Friday"])`;

/**
 * Example 2: the composed answer. The one that matters most, because it
 * is the shape a plan, a report or anything long should take, and the
 * shape the model never produced. A header, prose, a note, a picture
 * grid, a table, tabs, steps, an accordion and follow-ups, all inside
 * one Card.
 */
const PLAN = `Example 2 — A long answer, composed of several parts in one Card:

root = Card([head, intro, note, meals, calHead, table, listHead, tabs, prep, swaps, followUps])
head = Header("14-Day Meal Plan", "Balanced breakfasts, lunches and dinners")
intro = TextContent("A two-week plan built on lean proteins, whole grains and vegetables. Adjust portions to your appetite.")
note = CalloutV2("info", "Quick note", "If you have allergies or a goal like fat loss or vegetarian, say so and I will tailor it.")
meals = VisualCardBlock([burrito, oats, salmon], "grid")
burrito = VisualCardItem(BoldText("text", "Chicken Burrito Bowl", "Great for meal prep"), "burrito", "https://upload.wikimedia.org/wikipedia/commons/5/5a/Burrito_bowl.jpg", Tag("High Protein", "success"), "A chicken burrito bowl")
oats = VisualCardItem(BoldText("text", "Berry Overnight Oats", "Make it the night before"), "oats", null, Tag("Breakfast", "info"), null)
salmon = VisualCardItem(BoldText("text", "Salmon Quinoa Plate", "Omega-3 rich dinner"), "salmon", "https://upload.wikimedia.org/wikipedia/commons/9/9a/Salmon_plate.jpg", Tag("Heart Healthy", "success"), "A salmon and quinoa plate")
calHead = InlineHeader("Daily meal calendar", "Repeat a favourite to simplify the shop")
table = Table([Col("Day"), Col("Breakfast"), Col("Dinner")], rows)
rows = [["Day 1", "Greek yogurt and berries", "Sheet-pan chicken"], ["Day 2", "Overnight oats", "Salmon and rice"], ["Day 3", "Scrambled eggs", "Turkey chilli"]]
listHead = InlineHeader("Grocery list", "Core ingredients for the fortnight")
tabs = Tabs([proteins, produce])
proteins = TabItem("proteins", "Proteins", [proteinList], Icon("beef"))
proteinList = List([ListItem("Chicken thighs, salmon, turkey mince", "The week's mains", Icon("drumstick"))], "icon")
produce = TabItem("produce", "Produce", [produceList], Icon("carrot"))
produceList = List([ListItem("Spinach, peppers, broccoli, berries", "Buy twice for freshness", Icon("leaf"))], "icon")
prep = Steps([step1, step2], "Weekly prep", "Do this once a week and the plan cooks itself")
step1 = StepsItem("Cook the grains", "A large batch of rice and quinoa, stored airtight.")
step2 = StepsItem("Use leftovers on purpose", "Days 7, 13 and 14 run on what you already cooked.")
swaps = Accordion([vegSwap, budgetSwap], "Easy swaps", "Adjust the plan without rewriting it")
vegSwap = AccordionItem("veg", "Make it vegetarian", [vegText])
vegText = TextContent("Swap the chicken and turkey for lentils, tofu and halloumi. The fish stays or goes, your call.")
budgetSwap = AccordionItem("budget", "Make it budget-friendly", [budgetText])
budgetText = TextContent("Lean on eggs, oats, beans and frozen vegetables. Repeat meals more often to cut waste.")
followUps = FollowUpBlock(["Make it vegetarian", "Cut it to 7 days", "Write the shopping list"])`;

/**
 * Example 3: a choice. The founder, 18 September, on being asked a
 * five-part question in one sentence and answering "yes": they wanted
 * the options to press. So the answer comes first and the choice sits
 * under it as buttons, rather than a question that stops the work.
 */
const CHOICE = `Example 3 — Offering a choice as buttons rather than asking in prose:

root = Card([head, intro, options])
head = Header("Three ways to take this", "Say the word and I will redo it")
intro = TextContent("The plan above assumes no restrictions. If that is wrong, one of these is probably closer.")
options = ButtonGroup([veg, cut, budget], "row")
veg = Button("Vegetarian", { type: "continue_conversation", context: "Redo the plan without meat or fish" }, "secondary")
cut = Button("Fat loss", { type: "continue_conversation", context: "Redo the plan for fat loss, around 1800 calories" }, "secondary")
budget = Button("Budget", { type: "continue_conversation", context: "Redo the plan as cheaply as possible" }, "secondary")`;

/**
 * Example 4: figures. A set of numbers reads as tiles and a list of
 * label-and-value rows, never as sentences with numbers in them.
 */
const FIGURES = `Example 4 — Figures, as tiles and a label/value list:

root = Card([head, tiles, rows])
head = Header("Tokyo, five days", "What the trip comes to")
tiles = OverviewCardBlock([nights, flights], "grid")
nights = OverviewCardItem("nights", IconText(Icon("bed"), "neutral", "m", "Nights"), MetricIndicatorInline("5", "14-19 March"))
flights = OverviewCardItem("flights", IconText(Icon("plane"), "neutral", "m", "Flights"), MetricIndicatorInline("£612", "return, per person"))
rows = EntityList([{ left: "Hotel", right: "£840", rightVariant: "number" }, { left: "Rail pass", right: "£180", rightVariant: "number" }], "default", { left: "Item", right: "Cost" }, { left: "Total", right: "£1,632", rightVariant: "number" })`;

/** In the order the model reads them: simplest shape first, the composed one second. */
export const CARD_EXAMPLES = [PLACES, PLAN, CHOICE, FIGURES];

/**
 * The program inside an example, for the parser. Each example is a
 * title line, a blank line, then the program.
 */
export const programOf = example => example.split('\n').slice(2).join('\n').trim();

/**
 * Every example, parsed against the real library. A list of complaints
 * back; empty means all four are programs this app can draw.
 *
 * Checked, beyond the parser's own errors:
 *
 * - **Unresolved and orphaned names.** A name used and never defined
 *   renders nothing; a name defined and never referenced is silently
 *   dropped, which OpenUI's own syntax rules warn about. Either in an
 *   example teaches the model a mistake.
 * - **`Action(...)` and `@` builtins.** They parse, and they parse to
 *   an unevaluated node: `{k: "Comp", name: "Action", …}` rather than
 *   `{type: "continue_conversation", …}`. Evaluating them needs the
 *   v0.5 runtime, which this app does not wire (`bindings: false`), so
 *   a button written that way is drawn and does nothing at all. Until
 *   the runtime is wired, an action is an object literal.
 */
export function checkCardExamples(parse) {
  const faults = [];
  CARD_EXAMPLES.forEach((example, index) => {
    const at = `example ${index + 1}`;
    const program = programOf(example);
    if (/\bAction\s*\(|@[A-Z]\w*\s*\(/.test(program)) {
      faults.push(`${at}: uses Action(...) or an @builtin, which this app cannot evaluate; write the action as an object literal.`);
    }
    const { meta } = parse(program);
    for (const error of meta.errors ?? []) faults.push(`${at}: ${error.message}`);
    for (const name of meta.unresolved ?? []) faults.push(`${at}: "${name}" is used but never defined.`);
    for (const name of meta.orphaned ?? []) faults.push(`${at}: "${name}" is defined but nothing references it; it will not render.`);
    if (meta.incomplete) faults.push(`${at}: the program is incomplete.`);
  });
  return faults;
}
