import React from 'react';

import Sphere from './Sphere';

/**
 * An empty page (docs/maties/design.md, section 6): the sphere at 40px,
 * one sentence, one pill. Nothing else; the sentence says what to do.
 */
interface EmptyStateProps {
  sentence: string;
  /** The one pill, or a short row of pills. */
  action?: React.ReactNode;
  /** Something small under the pill (a second line, a template gallery). */
  children?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({ sentence, action, children, className }) => (
  <div className={`maties-in flex flex-col items-center px-6 py-14 text-center ${className ?? ''}`.trim()}>
    <Sphere size={40} />
    <p className="maties-body mt-5 max-w-[46ch] text-[#4a4f57]">{sentence}</p>
    {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    {children}
  </div>
);

export default EmptyState;
