import { ARTIFACT_ROOTS, ArtifactKind } from '../../shared/artifacts/constants';
import { PRESENTATION_SIGNATURES, REPORT_SIGNATURES } from '../../shared/artifacts/prompts.generated';
import { CARD_FENCE } from '../../shared/cards/library';

/**
 * The section of the brief that teaches an agent the two artifacts: a
 * slide deck and a report, in OpenUI's own libraries
 * (`@openuidev/thesys`, the version `prompts.generated.ts` names).
 *
 * The language itself is taught once, in the Cards section just above
 * this one; here are the two libraries' signatures, generated from the
 * package by `scripts/generate-artifact-prompts.mjs`, and our rules for
 * when each is the right answer.
 */
export function buildManagedArtifactsPrompt(): string {
  const deck = ARTIFACT_ROOTS[ArtifactKind.Presentation];
  const report = ARTIFACT_ROOTS[ArtifactKind.Report];
  return [
    '## Artifacts',
    '',
    `Two answers are not cards but things that stand on their own: a slide deck and a report. They use the same fenced \`${CARD_FENCE}\` block and the same syntax as the cards, with a different root: \`root = ${deck}(...)\` for a deck, \`root = ${report}(...)\` for a report. The app shows a small chip in the conversation with the title on it; the person opens it into the full deck or report.`,
    '',
    '### When',
    `- A deck (\`${deck}\`) when they ask for slides, a presentation, a deck, a pitch, something to present. Eight to fifteen slides is a deck; three is a card, not a deck.`,
    `- A report (\`${report}\`) when they ask for a report, a document, a memo, a brief, a write-up, a one-pager, something to read or send. Pages, not slides.`,
    '- Neither for a quick answer, a list of options, or a set of places: those are the cards above, or plain texts.',
    '- One artifact per reply. It may follow a card block in the same reply, and often should: see "Offer it before they ask" below.',
    '',
    '### Offer it before they ask',
    '- When you have just answered with a card that a person would plausibly want to keep, print or send on — a plan, an itinerary, a comparison, a set of findings, a brief — write it up as a report in the same reply, without being asked. Say so in one plain line between the two blocks: "I have written it up as a document as well, so you have something to send on." Then the report block.',
    '- That is the whole point of the job. They should not have to ask for the obvious next thing, and a document costs them nothing: it is a card in the conversation, not a file on their disk, so there is nothing to approve and nothing to wait for.',
    '- Not every time. A set of restaurants to pick from tonight does not need a document; a fortnight of meals, a trip, a shortlist they will take to somebody else does. If you would not have kept it yourself, do not make it.',
    '- Do not say you have made a Word file, a PDF or anything on disk unless you actually wrote one with your file tools. A report is a document in the conversation. Call it a document, a write-up, or a report, and never name a file format you have not produced.',
    '',
    '### Rules',
    '- Every figure in a chart, a metric or a table is real: from the conversation, a file they gave you, or something you fetched. Never a made-up number to fill a layout. If you have no numbers, use the layouts without them.',
    '- Pictures: the same rule as the cards. Search for them before you write the block, one pass for the whole set, and write the address exactly as the result gave it. Never invented, never a placeholder. A layout that needs one takes a picture you found; a title slide or a front page reads well with none.',
    '- Slide and page ids are short and unique ("s1", "s2"…). Write the root line first, then each slide or page as its own statement.',
    '- Do not narrate the layout ("here is a HeroMetric slide"). Say what the deck says.',
    '- A spreadsheet is not an artifact. If they want an Excel file, write the file with your file tools and hand them the file; a report can carry a table of the same figures.',
    '',
    '### Deck',
    '',
    PRESENTATION_SIGNATURES,
    '',
    '### Report',
    '',
    REPORT_SIGNATURES,
  ].join('\n');
}
