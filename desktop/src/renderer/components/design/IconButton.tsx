import React from 'react';

/**
 * A ghost button holding one icon. Two shapes from the founder's file: the
 * top bar's buttons (radius 9, padding 6, hover rgba(0,0,0,.06)) and the
 * composer's round 34px buttons (hover #f3f3f1).
 */
export const IconButtonShape = {
  Square: 'square',
  Round: 'round',
} as const;
export type IconButtonShape = typeof IconButtonShape[keyof typeof IconButtonShape];

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shape?: IconButtonShape;
  label: string;
  active?: boolean;
}

const shapeClassName: Record<IconButtonShape, string> = {
  [IconButtonShape.Square]: 'rounded-[9px] p-[6px] text-[#6b7280] hover:bg-[rgba(0,0,0,.06)]',
  [IconButtonShape.Round]: 'h-[34px] w-[34px] rounded-full text-[#4a4f57] hover:bg-[#f3f3f1]',
};

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ shape = IconButtonShape.Square, label, active = false, className, children, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={rest.title ?? label}
      {...rest}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent transition-colors disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent ${shapeClassName[shape]} ${
        active ? (shape === IconButtonShape.Round ? 'bg-[#f3f3f1]' : 'bg-[rgba(0,0,0,.06)]') : ''
      } ${className ?? ''}`.trim()}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = 'IconButton';

export default IconButton;
