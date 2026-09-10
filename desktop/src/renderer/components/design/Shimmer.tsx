import React from 'react';

/**
 * Waiting, the way the design waits: a grey gradient swept across the
 * words. The words are the assistant's own status line for the step it is
 * on, and « Thinking » only before there is one.
 */
const Shimmer: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <span
    className={`maties-shimmer ${className ?? ''}`.trim()}
    style={{ fontSize: 15, letterSpacing: '-.006em' }}
  >
    {text}
  </span>
);

export default Shimmer;
