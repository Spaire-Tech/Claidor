import React from 'react';

/**
 * The founder's line drawings (docs/maties/design/founder-chat-template.html),
 * one component per glyph, paths copied as drawn. Every icon is stroked in
 * `currentColor`, so the colour is the surrounding text's colour.
 */
interface LineIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
}

const svgProps = (
  { size = 17, strokeWidth, className, style }: LineIconProps,
  defaultStroke = 1.85,
) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: strokeWidth ?? defaultStroke,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  className,
  style: { flex: `0 0 ${size}px`, ...style },
  'aria-hidden': true,
});

/** The magnifier of the search box. */
export const SearchLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <circle cx="11" cy="11" r="6.6" />
    <line x1="16" y1="16" x2="20.5" y2="20.5" />
  </svg>
);

/** New Task: the pencil. */
export const PencilLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
    <line x1="14.5" y1="6" x2="18" y2="9.5" />
  </svg>
);

/** Scheduled Tasks: the clock. */
export const ClockLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <circle cx="12" cy="12" r="8.4" />
    <polyline points="12,7.4 12,12 15.4,14" />
  </svg>
);

/** Kits: the four squares. */
export const SquaresLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <rect x="4" y="4" width="7" height="7" rx="1.6" />
    <rect x="13" y="4" width="7" height="7" rx="1.6" />
    <rect x="4" y="13" width="7" height="7" rx="1.6" />
    <rect x="13" y="13" width="7" height="7" rx="1.6" />
  </svg>
);

/** Skills & Connectors: the puzzle piece. */
export const PuzzleLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path d="M10.5 4.2a2 2 0 0 1 3.9 0v1.6h2.4a1.2 1.2 0 0 1 1.2 1.2v2.6h1.6a2 2 0 0 1 0 3.9h-1.6v3.3a1.2 1.2 0 0 1-1.2 1.2h-3.3v-1.6a2 2 0 0 0-3.9 0v1.6H6.3a1.2 1.2 0 0 1-1.2-1.2V13.5H6.7a2 2 0 0 0 0-3.9H5.1V7a1.2 1.2 0 0 1 1.2-1.2h4.2z" />
  </svg>
);

/** Library: the books. */
export const BooksLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props)}>
    <path d="M4.5 5.5h4v13h-4z" />
    <path d="M10 5.5h4v13h-4z" />
    <path d="M15.6 6.2l3.6.9-2.8 11.3-3.3-1z" />
  </svg>
);

/** An agent: the briefcase. */
export const BriefcaseLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.7)}>
    <rect x="3.5" y="7.5" width="17" height="11.5" rx="2.2" />
    <path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5" />
    <line x1="3.5" y1="12.6" x2="20.5" y2="12.6" />
  </svg>
);

/** Settings: the gear. */
export const GearLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.7)}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a1.9 1.9 0 0 1-3.8 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H2.6a1.9 1.9 0 0 1 0-3.8h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1A1.9 1.9 0 1 1 6.6 3.5l.1.1a1.6 1.6 0 0 0 1.8.3H8.6a1.6 1.6 0 0 0 1-1.5V2.2a1.9 1.9 0 0 1 3.8 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.2a1.9 1.9 0 0 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

/** The top bar's sidebar toggle. */
export const SidebarLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 19, ...props }, 1.8)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <line x1="9.5" y1="4.5" x2="9.5" y2="19.5" />
  </svg>
);

/** Share: the arrow out of the tray. */
export const ShareLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 19, ...props }, 1.8)}>
    <path d="M12 15V4" />
    <polyline points="8,7.5 12,3.5 16,7.5" />
    <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
  </svg>
);

/** The composer's « + ». */
export const PlusLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 18, ...props }, 2.1)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

/** Send: the arrow up. */
export const ArrowUpLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 16, ...props }, 2)}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
  </svg>
);

/** The chevron of a chip. */
export const ChevronDownLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 11, ...props }, 2.6)}>
    <polyline points="5,9 12,16 19,9" />
  </svg>
);

/** The working folder. */
export const FolderLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.9)}>
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v7.5A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);

/** Attach a file: the paperclip. */
export const PaperclipLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.8)}>
    <path d="M21 11.5 12.5 20a4.6 4.6 0 0 1-6.5-6.5l8-8a3 3 0 0 1 4.3 4.3l-8 8a1.4 1.4 0 0 1-2-2l7.4-7.4" />
  </svg>
);

/** Mention: the @. */
export const MentionLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.8)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M16 8v5a3 3 0 0 0 5 -2.2A9 9 0 1 0 16.5 19.4" />
  </svg>
);

/** Use my selection: the window with a selected cell. */
export const SelectionLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.7)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
    <line x1="9" y1="9.5" x2="9" y2="19.5" />
  </svg>
);

/** The « ⋯ » of an overflow. */
export const EllipsisLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 2.4)}>
    <circle cx="5.5" cy="12" r=".6" />
    <circle cx="12" cy="12" r=".6" />
    <circle cx="18.5" cy="12" r=".6" />
  </svg>
);

/** The × that removes a chip. */
export const CloseLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 11, ...props }, 2.6)}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

/** Create Slides: the screen on a stand (its own colour). */
export const SlidesLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 16, ...props }, 1.9)}>
    <rect x="3.5" y="4.5" width="17" height="11.5" rx="1.8" />
    <line x1="12" y1="16" x2="12" y2="19.5" />
    <line x1="8.5" y1="19.5" x2="15.5" y2="19.5" />
  </svg>
);

/** Data Analysis: the bars. */
export const BarsLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 15, ...props }, 1.9)}>
    <line x1="5" y1="19" x2="5" y2="12" />
    <line x1="10.5" y1="19" x2="10.5" y2="6" />
    <line x1="16" y1="19" x2="16" y2="14" />
    <line x1="21" y1="19" x2="21" y2="9" />
  </svg>
);

/** Write Documents: the page with a folded corner. */
export const DocumentLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 15, ...props }, 1.8)}>
    <path d="M6 3.5h7.5L19 9v11.5H6z" />
    <polyline points="13.2,3.6 13.2,9.2 18.8,9.2" />
  </svg>
);

/** Create Website: the globe. */
export const GlobeLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps({ size: 15, ...props }, 1.8)}>
    <circle cx="12" cy="12" r="8.5" />
    <line x1="3.5" y1="12" x2="20.5" y2="12" />
    <path d="M12 3.5c2.4 2.4 3.6 5.3 3.6 8.5S14.4 18.1 12 20.5c-2.4-2.4-3.6-5.3-3.6-8.5S9.6 5.9 12 3.5z" />
  </svg>
);

/** Where the work runs: this computer. */
export const LaptopLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.8)}>
    <rect x="4" y="5.5" width="16" height="10.5" rx="1.6" />
    <path d="M2.5 19.5h19" />
  </svg>
);

/** Where the work runs: the cloud engine. */
export const CloudLineIcon: React.FC<LineIconProps> = (props) => (
  <svg {...svgProps(props, 1.8)}>
    <path d="M7.2 18.5h9.6a4.1 4.1 0 0 0 .5-8.17A5.6 5.6 0 0 0 6.6 10.5a3.9 3.9 0 0 0 .6 8z" />
  </svg>
);
