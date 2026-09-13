import React from 'react';

/**
 * A choice, the way the design draws one: a 999px pill with a hairline
 * border on an off-white ground. `tone` picks the founder's two pills: the
 * quiet suggestion pill under the composer, and the blue primary action.
 */
export const PillTone = {
  Quiet: 'quiet',
  Primary: 'primary',
  Selected: 'selected',
  /** No border, no ground: « Not now », « Cancel » beside a primary pill. */
  Ghost: 'ghost',
} as const;
export type PillTone = typeof PillTone[keyof typeof PillTone];

interface PillProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  tone?: PillTone;
  icon?: React.ReactNode;
  /** The 32px pill of a page header or a settings row (the composer's is 38). */
  compact?: boolean;
  children: React.ReactNode;
}

const toneClassName: Record<PillTone, string> = {
  [PillTone.Quiet]:
    'border-[#e2e1de] bg-[#fbfbfa] text-[#4a4f57] hover:border-[rgba(0,96,208,.35)] hover:bg-[#f4f8ff] hover:text-[#0060d0]',
  [PillTone.Selected]:
    'border-[rgba(0,96,208,.35)] bg-[#f4f8ff] text-[#0060d0]',
  [PillTone.Primary]:
    'border-transparent bg-[#0060d0] text-white hover:bg-[#0055ba]',
  [PillTone.Ghost]:
    'border-transparent bg-transparent text-[#4a4f57] hover:bg-[rgba(16,20,28,.05)] hover:text-[#1c1f23]',
};

const Pill: React.FC<PillProps> = ({ tone = PillTone.Quiet, icon, compact = false, children, className, ...rest }) => (
  <button
    type="button"
    {...rest}
    className={`inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-full border tracking-[-.006em] transition-[color,border-color,background] duration-[120ms] ease-out disabled:cursor-default disabled:opacity-50 ${
      compact ? 'h-[32px] px-[13px] text-[13.5px] font-medium' : 'h-[38px] px-[11px] text-[13px]'
    } ${toneClassName[tone]} ${className ?? ''}`.trim()}
  >
    {icon && <span className="flex shrink-0">{icon}</span>}
    <span className="whitespace-nowrap">{children}</span>
  </button>
);

export default Pill;
