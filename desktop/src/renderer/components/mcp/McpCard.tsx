import React, { useCallback, useEffect, useRef, useState } from 'react';

import { MANAGEMENT_META_TEXT, MANAGEMENT_TITLE_TEXT } from '../common/managementTypography';
import ConnectorIcon from '../icons/ConnectorIcon';

/**
 * Description with line-clamp-2 that reveals the full text in a popover above
 * the card once it is actually truncated.
 */
const ClampedText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const checkClamp = useCallback(() => {
    const el = textRef.current;
    if (el) setIsClamped(el.scrollHeight > el.clientHeight + 1);
  }, []);

  useEffect(() => {
    checkClamp();
    window.addEventListener('resize', checkClamp);
    return () => window.removeEventListener('resize', checkClamp);
  }, [text, checkClamp]);

  const handleEnter = () => {
    if (!isClamped) return;
    timerRef.current = setTimeout(() => setShowFull(true), 400);
  };

  const handleLeave = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    setShowFull(false);
  };

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <p ref={textRef} className={`line-clamp-2 ${className}`}>{text}</p>
      {showFull && (
        <div className="maties-menu absolute bottom-full left-0 right-0 z-50 mb-1 px-3 py-2 text-xs leading-relaxed text-[#1c1f23]">
          {text}
        </div>
      )}
    </div>
  );
};

interface McpIconTileProps {
  /** Icon URL from marketplace data. Falls back to the default connector glyph. */
  icon?: string;
  className?: string;
  iconClassName?: string;
}

/**
 * Icon shown for an MCP entry: the marketplace image when there is one, and
 * otherwise the connector glyph on a muted tile, so the name stays the thing
 * you read first.
 */
export const McpIconTile: React.FC<McpIconTileProps> = ({
  icon,
  className = 'h-10 w-10 rounded-[10px]',
  iconClassName = 'h-5 w-5',
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const normalizedIcon = icon?.trim();

  if (normalizedIcon && !imageFailed) {
    return (
      <img
        alt=""
        className={`${className} shrink-0 bg-surface-raised object-cover`}
        draggable={false}
        src={normalizedIcon}
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} inline-flex shrink-0 items-center justify-center bg-[#f4f5f7] text-[#4a4f57] dark:bg-[#22252b] dark:text-[#c9ccd2]`}
    >
      <ConnectorIcon className={iconClassName} />
    </span>
  );
};

interface McpCardProps {
  title: string;
  description: string;
  icon?: string;
  /** Capsule / overflow menu rendered next to the title. */
  actions?: React.ReactNode;
  /** Badge row pinned to the bottom of the card. */
  meta?: React.ReactNode;
  /** Opens the detail dialog; the card becomes a button when provided. */
  onOpenDetail?: () => void;
}

/**
 * One MCP entry in a grid — same shape as a skill card, so the two management
 * pages read as one product: uniform icon tile, single-line title, two-line
 * description with a reserved height that keeps every card the same size, and
 * the facts strip at the bottom.
 */
const McpCard: React.FC<McpCardProps> = ({
  title,
  description,
  icon,
  actions,
  meta,
  onOpenDetail,
}) => (
  <div
    role={onOpenDetail ? 'button' : undefined}
    tabIndex={onOpenDetail ? 0 : undefined}
    onClick={onOpenDetail}
    onKeyDown={onOpenDetail && ((event) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onOpenDetail();
      }
    })}
    className={`maties-card group flex flex-col p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0060d0]/30 ${
      onOpenDetail ? 'maties-card-interactive cursor-pointer' : ''
    }`}
  >
    <div className="mb-3 flex items-center gap-2.5">
      <McpIconTile icon={icon} />
      <div className={`min-w-0 flex-1 truncate ${MANAGEMENT_TITLE_TEXT} font-medium leading-snug text-[#1c1f23] dark:text-[#f2f3f5]`}>
        {title}
      </div>
      {actions && (
        <div className="flex flex-shrink-0 items-center gap-1">
          {actions}
        </div>
      )}
    </div>

    <ClampedText
      text={description}
      className="mb-3 min-h-[2.6em] text-xs leading-relaxed text-secondary"
    />

    {meta && (
      <div className={`mt-auto flex min-w-0 items-center gap-1.5 ${MANAGEMENT_META_TEXT} text-muted`}>
        {meta}
      </div>
    )}
  </div>
);

export default McpCard;
