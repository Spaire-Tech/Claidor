import React from 'react';

/**
 * Claude's burst mark, for the models we actually sell.
 *
 * The list shows Claude Sonnet and Claude Opus, so it should carry Claude's
 * mark and not the company's: a person choosing a model is choosing Claude,
 * and has no reason to know who makes it. `AnthropicIcon` stays where the
 * company itself is meant.
 *
 * Drawn here rather than copied from a brand asset we do not hold: twelve
 * rounded rays about a centre, in Claude's orange. If the official SVG is
 * obtained, replace the body of this file and nothing else changes.
 */
const RAY_COUNT = 12;
const RAYS = Array.from({ length: RAY_COUNT }, (_, index) => (index * 360) / RAY_COUNT);

const ClaudeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    height="24"
    viewBox="0 0 24 24"
    width="24"
    xmlns="http://www.w3.org/2000/svg"
    style={{ flex: '0 0 auto', lineHeight: 1 }}
  >
    <title>Claude</title>
    <g fill="#D97757">
      {RAYS.map((angle) => (
        <rect
          key={angle}
          height="9.2"
          rx="1.05"
          transform={`rotate(${angle} 12 12)`}
          width="2.1"
          x="10.95"
          y="2.8"
        />
      ))}
    </g>
  </svg>
);

export default ClaudeIcon;
