// The chip of a chosen skill, app or mode in the composer, as the founder drew
// the skill chip: a 32px pill, hairline border, off-white ground, blue text,
// and the × that removes it at the right on hover. leading-5 (not
// leading-none): the label span truncates with overflow-hidden, which clips
// descenders (g/y/p) when the line box equals the font size.
export const ACTIVE_CONTEXT_BADGE_BUTTON_CLASS = 'group inline-flex h-8 max-w-[240px] items-center gap-[7px] rounded-full border border-[#e2e1de] bg-[#fbfbfa] pl-[9px] pr-[10px] text-[13.5px] font-normal leading-5 tracking-[-.006em] text-[#0060d0] transition-colors hover:bg-[#f3f3f1]';

export const ACTIVE_CONTEXT_BADGE_ICON_WRAP_CLASS = 'relative flex h-4 w-4 shrink-0 items-center justify-center';

export const ACTIVE_CONTEXT_BADGE_ICON_CLASS = 'h-4 w-4 text-[#0060d0] transition-opacity group-hover:opacity-0';

export const ACTIVE_CONTEXT_BADGE_REMOVE_ICON_CLASS = 'absolute h-3 w-3 text-[#a2a29c] opacity-0 transition-opacity group-hover:opacity-100';
