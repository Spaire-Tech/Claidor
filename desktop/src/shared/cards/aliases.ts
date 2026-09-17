/**
 * The near-miss component names, corrected before the program is parsed.
 *
 * **Why this exists.** The founder, 18 September, on the first live run:
 * *"the openui was produced. just without cards nor pictures."* The
 * block was emitted and came out as a heading and one line. A broken
 * statement does not fail loudly here: the parser drops the child it
 * cannot resolve and renders the rest, so one bad name in the middle of
 * a twelve-part answer deletes everything after it and says nothing.
 *
 * **Why the names are wrong.** OpenUI ships *two* chat libraries.
 * `openuiChatLibrary` in `@openuidev/react-ui` is the one in their
 * public docs, their examples and their scaffold, so it is the one a
 * model has read. We render with `chatLibrary` from `@openuidev/thesys`,
 * a 73-component superset that names several of the same things
 * differently. A model reaching for what it knows writes `CardHeader`
 * where we want `Header`, and the whole rest of the card goes with it.
 *
 * **Why renaming is safe here and not in general.** Only pairs whose
 * arguments are in the same order are listed, checked against both
 * specs: `CardHeader(title, subtitle)` and `Header(title, subtitle)`,
 * `Callout(variant, title, description)` and `CalloutV2(variant, title,
 * description)`, and so on. `FollowUpItem(text)` is deliberately absent
 * — ours takes an array of strings, not one item, so a rename would
 * produce a card that parses and is wrong, which is worse than one that
 * fails.
 *
 * This is a floor, not a fix for bad output. The brief names the right
 * components; this catches the model reaching past it.
 */

/** Their name, and ours. Argument order is identical for every pair. */
export const CARD_COMPONENT_ALIASES: Readonly<Record<string, string>> = {
  CardHeader: 'Header',
  Callout: 'CalloutV2',
  TextCallout: 'CalloutV2',
  ListBlock: 'List',
  Buttons: 'ButtonGroup',
  SectionItem: 'SectionBlockItem',
};

/**
 * A component call is a name followed by `(`. Anchored so `MyCallout(`
 * and `xCardHeader(` are left alone, and a name inside a string is not
 * touched unless it is being called, which openui-lang does not do.
 */
const CALL = new RegExp(`(^|[^A-Za-z0-9_])(${Object.keys(CARD_COMPONENT_ALIASES).join('|')})\\s*\\(`, 'g');

/** The program with the aliases corrected, and which ones were found. */
export function normaliseCardProgram(program: string): { program: string; corrected: readonly string[] } {
  const corrected = new Set<string>();
  const out = program.replace(CALL, (_all, before: string, name: string) => {
    corrected.add(name);
    return `${before}${CARD_COMPONENT_ALIASES[name]}(`;
  });
  return { program: out, corrected: [...corrected] };
}
