/**
 * The icons, taken from the canvas.
 *
 * Every path below is copied out of `docs/product/design/canvas-template.html`
 * unchanged — same geometry, same stroke width, same 24×24 box. They are
 * here because the first build used Unicode glyphs in their place, and a
 * glyph is not an icon: `🖵` (U+1F5B5, "screen") has no glyph in the fonts
 * macOS or Linux ship, so the computer button in the header drew as an
 * empty rectangle. Nothing about that was visible in a test; it took a
 * screenshot.
 *
 * Everything is stroked in `currentColor`, so the button decides the
 * colour and there is one less place for a hex to drift.
 */

export interface IconProps {
  /** Both width and height. The canvas sizes each icon per place it sits. */
  size?: number;
  /** The canvas varies this between 1.7 and 2.2 by icon; each has its own default. */
  weight?: number;
  className?: string;
  style?: React.CSSProperties;
}

const svg = (
  children: JSX.Element,
  { size = 16, weight = 1.8, className, style }: IconProps,
): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={weight}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
    className={className}
    style={{ flex: '0 0 auto', display: 'block', ...style }}
  >
    {children}
  </svg>
);

/** The search field in the sidebar. */
export const SearchIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </>,
  { weight: 2, ...props },
);

/** Home, in the dock: the 17 September canvas's `ornaments[0]`. */
export const HomeIcon = (props: IconProps): JSX.Element => svg(
  <path d="M4 11.5L12 5l8 6.5V20h-5v-5h-6v5H4z" />,
  { weight: 1.7, ...props },
);

/** Routines, in the dock: two arrows chasing each other, `ornaments[1]`. */
export const RoutineIcon = (props: IconProps): JSX.Element => svg(
  <path d="M4.8 12a7.2 7.2 0 0112.3-5.1M19.2 12a7.2 7.2 0 01-12.3 5.1M17.1 3.6v3.3h-3.3M6.9 20.4v-3.3h3.3" />,
  { weight: 1.7, ...props },
);

/** Create, in the dock: a plus, `ornaments[2]`. */
export const PlusIcon = (props: IconProps): JSX.Element => svg(
  <path d="M12 5v14M5 12h14" />,
  { weight: 1.7, ...props },
);

/** Apps in the dock: the canvas's four squares, `ornaments[3]`. */
export const DockAppsIcon = (props: IconProps): JSX.Element => svg(
  <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
  { weight: 1.7, ...props },
);

/** Apps — four panes, the canvas's grid. */
export const AppsIcon = (props: IconProps): JSX.Element => svg(
  <>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </>,
  { weight: 1.8, ...props },
);

/**
 * The computer. This is the one that was drawing as a blank box.
 *
 * Behind it is the panel — the agent's browser, its files, what it
 * delegated. One icon for all of it, which is why it has to read as a
 * computer at a glance.
 */
export const ComputerIcon = (props: IconProps): JSX.Element => svg(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2.5" />
    <path d="M9 20h6M12 16v4" />
  </>,
  { weight: 1.7, ...props },
);

/** The composer's send arrow, shown once there is a draft. */
export const SendIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </>,
  { weight: 1.9, ...props },
);

/** The composer at rest: speak, not send. */
export const MicIcon = (props: IconProps): JSX.Element => svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0" />
    <path d="M12 18v3" />
  </>,
  { weight: 1.8, ...props },
);

/** The approval card's triangle. The only warning colour in the app. */
export const WarningIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M12 3.5L21.5 20H2.5L12 3.5z" />
    <path d="M12 9.5v4.5" />
    <path d="M12 17.2v.1" />
  </>,
  { weight: 1.9, ...props },
);

/** Dismiss, on a card that can be dismissed. */
export const CloseIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M5 5l14 14" />
    <path d="M19 5L5 19" />
  </>,
  { weight: 2, ...props },
);

/** The account row's caret. Points up because the menu opens upward. */
export const ChevronUpIcon = (props: IconProps): JSX.Element => svg(
  <path d="M5 15l7-7 7 7" />,
  { weight: 2, ...props },
);

/** Usage: a clock face, the canvas's mark for credits spent. */
export const UsageIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 12l4-3" />
  </>,
  { weight: 1.7, ...props },
);

/** Settings. */
export const GearIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
  </>,
  { weight: 1.7, ...props },
);

/** Log out — a door with an arrow leaving it. */
export const SignOutIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M10 5H6a2 2 0 00-2 2v10a2 2 0 002 2h4" />
    <path d="M15 8l-3.5 4 3.5 4" />
    <path d="M11.5 12H20" />
  </>,
  { weight: 1.7, ...props },
);

/** The agent's live browser tab. */
export const GlobeIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3.5 12h17" />
    <path d="M12 3a15 15 0 010 18a15 15 0 010-18z" />
  </>,
  { weight: 1.7, ...props },
);

/** The files it made. */
export const FilesIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M4 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2z" />
  </>,
  { weight: 1.7, ...props },
);

/** Rotated in place to open a disclosure, as the canvas does it. */
export const ChevronRightIcon = (props: IconProps): JSX.Element => svg(
  <path d="M9 5l7 7-7 7" />,
  { weight: 2, ...props },
);

/** Support — the canvas's bound manual. */
export const SupportIcon = (props: IconProps): JSX.Element => svg(
  <>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M9 7h6" />
  </>,
  { weight: 1.7, ...props },
);

/** Add account — a person with a plus beside them. */
export const AddAccountIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="10" cy="8" r="3.4" />
    <path d="M3.5 20c.6-3.4 3.3-5.4 6.5-5.4M18 13v5M15.5 15.5h5" />
  </>,
  { weight: 1.7, ...props },
);

/** Share — the canvas's tray with an arrow leaving it. */
export const ShareIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M12 16V4" />
    <path d="M7 9l5-5 5 5" />
    <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
  </>,
  props,
);

/** Attach files — the canvas's paperclip, one path. */
export const AttachIcon = (props: IconProps): JSX.Element => svg(
  <path d="M20 11.5l-7.8 7.8a4.3 4.3 0 01-6.1-6.1l8-8a2.9 2.9 0 014.1 4.1l-8 8a1.5 1.5 0 01-2.1-2.1l7.2-7.2" />,
  { weight: 1.7, ...props },
);

/** The hover cluster's react button: a face, from the evening canvas of 15 September. */
export const SmileIcon = (props: IconProps): JSX.Element => svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.6 14.2c.8 1.2 2 1.9 3.4 1.9s2.6-.7 3.4-1.9" strokeLinecap="round" />
    <path d="M9.2 9.6v.1" strokeLinecap="round" strokeWidth={2} />
    <path d="M14.8 9.6v.1" strokeLinecap="round" strokeWidth={2} />
  </>,
  { weight: 1.6, ...props },
);

/** Reply: an arrow turning back. */
export const ReplyIcon = (props: IconProps): JSX.Element => svg(
  <>
    <path d="M9.5 7L4.5 11.5 9.5 16" />
    <path d="M4.5 11.5h8.8c3.4 0 6.2 2.6 6.2 5.9V18" />
  </>,
  { weight: 1.6, ...props },
);

/** More: three dots. Filled, which is why it is not built through `svg()`. */
export const DotsIcon = ({ size = 15, className, style }: IconProps): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden focusable="false">
    <circle cx="5.5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18.5" cy="12" r="1.5" />
  </svg>
);

/** Copy: two sheets. */
export const CopyIcon = (props: IconProps): JSX.Element => svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0012.5 3H6.5A3.5 3.5 0 003 6.5v6A2.5 2.5 0 005.5 15" />
  </>,
  { weight: 1.6, ...props },
);
