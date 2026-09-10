import React from 'react';

/**
 * Words arriving, each fading up out of a blur.
 *
 * Every word is its own span with a stable key, so React mounts a new span
 * only for a word that has just appeared and leaves the rest alone. That is
 * what makes the animation run once per word instead of restarting the
 * paragraph on every frame. Whitespace is kept as text so line breaks
 * survive and only the words animate. Wrap the result in an element with
 * the `maties-stream-live` class while the answer is unfolding.
 */
const Words: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\s+)/).map((part, at) => (
      /^\s+$/.test(part) || part === ''
        ? part
        : <span key={at} className="maties-word">{part}</span>
    ))}
  </>
);

export default Words;
