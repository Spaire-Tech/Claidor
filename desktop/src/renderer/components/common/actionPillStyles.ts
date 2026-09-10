import { MANAGEMENT_BODY_TEXT, MANAGEMENT_META_TEXT } from './managementTypography';

// One pill per card, its label carrying the state (Install / Use / Upgrade).
// A grid where every card shouts a filled primary button reads as a wall of ads
// and stops being browsable, so the pill is the design's quiet white pill with
// a hairline; the blue is the link's (docs/maties/design.md, section 1).
export const CARD_ACTION_PILL_CLASS =
  'inline-flex h-[26px] flex-shrink-0 items-center gap-1 rounded-full bg-white px-3 '
  + `${MANAGEMENT_META_TEXT} font-medium text-[#0060d0] shadow-[0_0_0_.5px_rgba(16,22,35,.10)] transition-colors hover:bg-[rgba(0,96,208,.06)] `
  + 'disabled:cursor-not-allowed disabled:opacity-50 dark:bg-[#22252b]';

/** The one blue pill of a detail header. */
export const DETAIL_ACTION_PILL_CLASS =
  'inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-full bg-[#0060d0] px-4 '
  + `${MANAGEMENT_BODY_TEXT} font-medium text-white transition-colors hover:bg-[#0055ba] `
  + 'disabled:cursor-not-allowed disabled:opacity-50';
