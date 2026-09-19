"use strict";
/**
 * The answer cards: what an agent may draw beside its texts.
 *
 * **Why this exists.** The founder, 17 September, on OpenUI
 * (`thesysdev/openui`, MIT): *"text should stays text, but having cards
 * that come with it is amazing."* A reply to "find me the best
 * restaurants in Seattle" or "plan my Tokyo trip" is a few texts and,
 * between them, a block of cards: places with a picture, figures with a
 * label, a table, a plan by the day. The texts still arrive as texts;
 * the block arrives with them.
 *
 * **Whose cards.** OpenUI's, whole. The founder, later the same day,
 * after a first version drawn in our own design: *"i want it exactly
 * like openui's. i'm talking about Trip itineraries, restaurants etc...
 * use their colors. use their style. perhaps keep our font but thats
 * it."* So the library is the chat library `@openuidev/thesys` ships
 * (root `Card`, seventy-odd components: headers, image cards, visual
 * cards, entity lists, tables, charts, steps, buttons), the brief
 * teaches it in OpenUI's own generated words
 * (`prompt.generated.ts`, `main/libs/cardsPrompt.ts`), and the thread
 * draws it with OpenUI's own renderer and stylesheet
 * (`renderer/design/thread/CardBlock.tsx`). Only the typeface is ours.
 *
 * **How it reaches the thread.** The agent writes one fenced block in
 * its reply:
 *
 *     ```openui-lang
 *     root = Card([title, places])
 *     title = Header("Best restaurants in Seattle", "From iconic fine dining to artisanal soba")
 *     places = CompositeCardBlock([a, b], "grid")
 *     a = CompositeCardItem("canlis", ImageTextLarge("https://…/Canlis.jpg", "Canlis", "Canlis", "Panoramic views & iconic fine dining"))
 *     b = CompositeCardItem("spinasse", ImageTextLarge("https://…/Spinasse.jpg", "Spinasse", "Spinasse", "Hand-cut tajarin"))
 *     ```
 *
 * and the thread shows the block between the bubbles (`fromEngine.ts`,
 * `splitCardSegments`). The artifacts (`shared/artifacts/`) share the
 * fence and the language with a different root; `artifactKindOf` tells
 * them apart by the first `root =` line, and everything else is a card.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CARD_FENCE = exports.CARD_ROOT = exports.CARD_LIBRARY_VERSION = void 0;
var prompt_generated_1 = require("./prompt.generated");
Object.defineProperty(exports, "CARD_LIBRARY_VERSION", { enumerable: true, get: function () { return prompt_generated_1.CARD_LIBRARY_VERSION; } });
Object.defineProperty(exports, "CARD_ROOT", { enumerable: true, get: function () { return prompt_generated_1.CARD_ROOT; } });
/** The fence the agent writes the block in, as OpenUI names it. */
exports.CARD_FENCE = 'openui-lang';
//# sourceMappingURL=library.js.map