import React from 'react';

/**
 * A white card (docs/maties/design.md, section 1, Shape and Depth). Corners
 * grow with the thing: a row card in Settings is 16 with a hairline, a result
 * or list card is 18 with the resting shadow, a card that holds prose is 20
 * with the lifted shadow.
 */
export const CardKind = {
  /** Radius 16, hairline ring, rows divided by hairlines: the settings rows. */
  Row: 'row',
  /** Radius 18, resting shadow: a card in a grid or a list. */
  Resting: 'resting',
  /** Radius 20, lifted shadow: a card that holds prose, or a dialog. */
  Prose: 'prose',
} as const;
export type CardKind = typeof CardKind[keyof typeof CardKind];

const kindClassName: Record<CardKind, string> = {
  [CardKind.Row]: 'maties-card-row maties-divide',
  [CardKind.Resting]: 'maties-card',
  [CardKind.Prose]: 'maties-card-prose',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  kind?: CardKind;
  /** Lifts on hover, for a card that opens something. */
  interactive?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ kind = CardKind.Resting, interactive = false, className, children, ...rest }, ref) => (
    <div
      ref={ref}
      {...rest}
      className={`${kindClassName[kind]} ${
        interactive ? 'maties-card-interactive cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060d0]/30' : ''
      } ${className ?? ''}`.trim()}
    >
      {children}
    </div>
  ),
);

Card.displayName = 'Card';

/** One padded row inside a `CardKind.Row` card; hairlines come from the card. */
export const CardRow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={`px-5 py-4 ${className ?? ''}`.trim()}>{children}</div>
);

/** A titled row: title, one line under it, and the control at the right. */
export const CardField: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  control?: React.ReactNode;
  htmlFor?: string;
  children?: React.ReactNode;
  className?: string;
}> = ({ title, description, control, htmlFor, children, className }) => (
  <div className={className}>
    <div className="flex items-center justify-between gap-6">
      <div className="min-w-0 flex-1">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="maties-row-title block">{title}</label>
        ) : (
          <div className="maties-row-title">{title}</div>
        )}
        {description && <p className="maties-row-desc">{description}</p>}
      </div>
      {control && <div className="flex shrink-0 items-center gap-2">{control}</div>}
    </div>
    {children}
  </div>
);

export default Card;
