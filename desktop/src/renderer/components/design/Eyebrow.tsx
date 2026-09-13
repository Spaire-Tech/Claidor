import React from 'react';

/**
 * A section eyebrow: 11.5px, weight 500, uppercase, tracking .06em, #6b7280
 * (docs/maties/design.md, « Type »). Padding is the caller's.
 */
const Eyebrow: React.FC<{ children: React.ReactNode; className?: string; id?: string }> = ({
  children,
  className,
  id,
}) => (
  <span
    id={id}
    className={`block text-[11.5px] font-medium uppercase tracking-[.06em] text-[#6b7280] ${className ?? ''}`.trim()}
  >
    {children}
  </span>
);

export default Eyebrow;
