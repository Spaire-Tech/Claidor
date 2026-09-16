/**
 * The founder's four OpenUI pictures of 17 September (Seattle
 * restaurants, Paris hotels, a Tokyo itinerary, the 2026 World Cup) as
 * programs in OpenUI's chat library: what the harness draws and what
 * the tests parse against the library, so the pictures the founder sees
 * are of programs the renderer accepts.
 *
 * `photo(name)` is where a picture comes from: the shooter's loopback
 * server in the harness, a made-up https address in the tests.
 */
export interface CardExample {
  /** What the person asked. */
  ask: string;
  /** The agent's text before the block. */
  before: string;
  /** The block's statements, without the fence. */
  program: string[];
  /** The agent's text after the block. */
  after: string;
}

const book = (context: string): string => `Button("Book", {type: "continue_conversation", context: "${context}"}, "primary", "normal", "small")`;

export function cardExamples(photo: (name: string) => string): Record<string, CardExample> {
  return {
    cards: {
      ask: 'find me the best restaurants in seattle',
      before: 'Seattle is Pacific Northwest seafood first, then everything the city’s Asian heritage brought with it.',
      program: [
        'root = Card([places, facts, next])',
        'places = CompositeCardBlock([a, b, c, d], "grid")',
        `a = CompositeCardItem("canlis", ImageTextLarge("${photo('canlis')}", "Canlis", "Canlis", "Panoramic views & iconic fine dining"), [TagBlock([Tag("Fine dining"), Tag("Book ahead", "warning")])], {price: BoldText("number", "$$$$", "tasting menu"), button: ${book('Book a table at Canlis')}})`,
        `b = CompositeCardItem("walrus", ImageTextLarge("${photo('walrus')}", "The Walrus & The Carpenter", "The Walrus & The Carpenter", "Fresh Pacific oysters & Muscadet in Ballard"), [TagBlock([Tag("Seafood"), Tag("Walk-in", "success")])], {price: BoldText("number", "$$", "oysters by the half dozen"), button: ${book('Book a table at The Walrus and The Carpenter')}})`,
        `c = CompositeCardItem("spinasse", ImageTextLarge("${photo('spinasse')}", "Spinasse", "Spinasse", "Hand-cut tajarin & authentic Piedmontese Italian"), [TagBlock([Tag("Italian"), Tag("Capitol Hill")])], {price: BoldText("number", "$$$", "dinner for two"), button: ${book('Book a table at Spinasse')}})`,
        `d = CompositeCardItem("tsukushinbo", ImageTextLarge("", "Tsukushinbo", "Tsukushinbo", "Handmade soba, twelve seats, cash only"), [TagBlock([Tag("Soba"), Tag("Cash only", "info")])], {price: BoldText("number", "$", "lunch"), button: ${book('Book a table at Tsukushinbo')}})`,
        'facts = EntityList([{left: "Book ahead", right: "Canlis, two weeks"}, {left: "Price", right: "$ to $$$$"}, {left: "Best for a view", right: "Canlis, at dusk"}, {left: "Walk-in", right: "The Walrus, before six"}], "default", {left: "Highlights", right: ""})',
        'next = ButtonGroup([Button("Hold a table at Canlis", {type: "continue_conversation", context: "Hold a table at Canlis for Friday"}, "primary"), Button("Only walk-ins", {type: "continue_conversation", context: "Show me only the walk-in places"}, "secondary")])',
      ],
      after: 'Canlis needs booking about two weeks out. Say the word and I’ll hold a table.',
    },
    'cards-hotels': {
      ask: 'best hotels in paris for next week, five star',
      before: 'Five on the Right Bank, all within a walk of each other. Prices are for next Tuesday, one night, from the hotels’ own sites.',
      program: [
        'root = Card([hotels, highlights, next])',
        'hotels = CompositeCardBlock([h1, h2, h3, h4, h5], "grid")',
        `h1 = CompositeCardItem("athenee", ImageTextLarge("${photo('hotel-1')}", "Plaza Athénée", "Hôtel Plaza Athénée", "Avenue Montaigne, Eiffel Tower views"), [TagBlock([Tag("5 star"), Tag("Spa"), Tag("Michelin dining")])], {price: BoldText("number", "€1,100", "per night"), button: ${book('Book the Plaza Athénée for next Tuesday')}})`,
        `h2 = CompositeCardItem("georgev", ImageTextLarge("${photo('hotel-2')}", "Four Seasons George V", "Four Seasons George V", "Off the Champs-Élysées, three Michelin stars in one building"), [TagBlock([Tag("5 star"), Tag("Pool"), Tag("Family rooms")])], {price: BoldText("number", "€1,400", "per night"), button: ${book('Book the George V for next Tuesday')}})`,
        `h3 = CompositeCardItem("bristol", ImageTextLarge("${photo('hotel-3')}", "Le Bristol", "Le Bristol", "Faubourg Saint-Honoré, the rooftop pool"), [TagBlock([Tag("5 star"), Tag("Rooftop pool"), Tag("Garden")])], {price: BoldText("number", "€1,250", "per night"), button: ${book('Book Le Bristol for next Tuesday')}})`,
        `h4 = CompositeCardItem("meurice", ImageTextLarge("${photo('hotel-4')}", "Le Meurice", "Le Meurice", "Rue de Rivoli, facing the Tuileries"), [TagBlock([Tag("5 star"), Tag("Tuileries view")])], {price: BoldText("number", "€1,050", "per night"), button: ${book('Book Le Meurice for next Tuesday')}})`,
        `h5 = CompositeCardItem("crillon", ImageTextLarge("${photo('hotel-5')}", "Hôtel de Crillon", "Hôtel de Crillon", "Place de la Concorde, the quietest of the five"), [TagBlock([Tag("5 star"), Tag("Quiet"), Tag("Butler")])], {price: BoldText("number", "€1,300", "per night"), button: ${book('Book the Crillon for next Tuesday')}})`,
        'highlights = EntityList([{left: "Best value", right: "Le Meurice"}, {left: "Best for a pool", right: "Le Bristol"}, {left: "Closest to the Louvre", right: "Le Meurice, 6 min"}, {left: "Cheapest night", right: "Monday"}], "default", {left: "Highlights", right: ""})',
        'next = ButtonGroup([Button("Compare the five", {type: "continue_conversation", context: "Compare the five hotels in a table"}, "primary"), Button("Left Bank instead", {type: "continue_conversation", context: "Show me Left Bank hotels instead"}, "secondary")])',
      ],
      after: 'The Meurice is the one I’d take for a week: it is the cheapest of the five and the only one facing the park.',
    },
    'cards-trip': {
      ask: 'plan me three days in tokyo',
      before: 'Three days is tight, so this stays on the east side and skips the day trips.',
      program: [
        'root = Card([hero, keys, days, next])',
        `hero = Image("Tokyo at dusk from the Shibuya crossing", "${photo('tokyo')}")`,
        'keys = OverviewCardBlock([k1, k2, k3], "grid")',
        'k1 = OverviewCardItem("length", IconText(Icon("calendar"), "neutral", "md", "Trip length", "Tokyo only"), MetricIndicatorInline("3 days"))',
        'k2 = OverviewCardItem("base", IconText(Icon("map-pin"), "neutral", "md", "Best base", "Easy transit"), MetricIndicatorInline("Shinjuku"))',
        'k3 = OverviewCardItem("budget", IconText(Icon("wallet"), "neutral", "md", "Budget", "per person, no flights"), MetricIndicatorInline("¥48,000"))',
        'days = VisualCardBlock([d1, d2, d3], "grid", true, {type: "continue_conversation", context: "Tell me more about this day"})',
        `d1 = VisualCardItem(BoldText("text", "Shinjuku arrival", "Easy first day to reset after landing"), "day1", "${photo('shinjuku')}", Tag("Day 1"), "Shinjuku at night")`,
        `d2 = VisualCardItem(BoldText("text", "Harajuku + Shibuya", "Vibrant culture and iconic sights"), "day2", "${photo('shibuya')}", Tag("Day 2"), "Shibuya crossing")`,
        `d3 = VisualCardItem(BoldText("text", "Asakusa + Ueno", "Traditional Tokyo, then the park"), "day3", "${photo('asakusa')}", Tag("Day 3"), "Senso-ji temple")`,
        'next = ButtonGroup([Button("Swap day two for Kichijoji", {type: "continue_conversation", context: "Swap day two for Kichijoji"}, "primary"), Button("Add a fourth day", {type: "continue_conversation", context: "Add a fourth day"}, "secondary")])',
      ],
      after: 'Say which day you want fuller and I’ll add the restaurants.',
    },
    'cards-fifa': {
      ask: 'tell me about the 2026 world cup',
      before: 'The first with 48 teams and the first across three countries. It opens on 11 June in Mexico City and ends on 19 July in New Jersey.',
      program: [
        'root = Card([hero, figures, features, next])',
        `hero = Image("A full stadium under the lights", "${photo('stadium')}")`,
        'figures = OverviewCardBlock([f1, f2, f3, f4], "grid")',
        'f1 = OverviewCardItem("teams", IconText(Icon("users"), "neutral", "md", "Teams", "up from 32"), MetricIndicatorInline("48"))',
        'f2 = OverviewCardItem("matches", IconText(Icon("trophy"), "neutral", "md", "Matches", "39-day tournament"), MetricIndicatorInline("104"))',
        'f3 = OverviewCardItem("cities", IconText(Icon("map-pin"), "neutral", "md", "Host cities", "in three countries"), MetricIndicatorInline("16"))',
        'f4 = OverviewCardItem("final", IconText(Icon("calendar"), "neutral", "md", "The final", "MetLife Stadium, New Jersey"), MetricIndicatorInline("19 July"))',
        'features = VisualCardBlock([v1, v2, v3, v4], "grid", true, {type: "continue_conversation", context: "Tell me more about this"})',
        `v1 = VisualCardItem(BoldText("text", "Opening match", "Mexico at the Estadio Azteca, 11 June"), "open", "${photo('fifa-1')}", Tag("Mexico City"), "Estadio Azteca")`,
        `v2 = VisualCardItem(BoldText("text", "The new format", "12 groups of four, the best eight third-placed sides go through"), "format", "${photo('fifa-2')}", Tag("48 teams"), "A group table")`,
        `v3 = VisualCardItem(BoldText("text", "The final", "MetLife Stadium, 19 July, 82,500 seats"), "final", "${photo('fifa-3')}", Tag("New Jersey"), "MetLife Stadium")`,
        `v4 = VisualCardItem(BoldText("text", "Tickets", "Sales open in phases from September 2025 on FIFA's site"), "tickets", "${photo('fifa-4')}", Tag("Tickets"), "A crowd at the gates")`,
        'next = ButtonGroup([Button("Show the groups", {type: "continue_conversation", context: "Show me the groups"}, "primary"), Button("Matches near me", {type: "continue_conversation", context: "Which matches are nearest to me"}, "secondary")])',
      ],
      after: 'Want the groups, or the matches nearest to you?',
    },
  };
}
