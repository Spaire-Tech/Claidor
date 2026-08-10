'use client'

/**
 * The design's icons, traced from it.
 *
 * Every path here is copied out of `docs/pierce/design/markup.html`
 * verbatim — same coordinates, same box, same stroke. They are not
 * substitutes from an icon set, because an icon set would bring its own
 * optical weight and the dock would stop looking like the design.
 *
 * **Both size and stroke are props with the design's own default**, because
 * the design draws the same glyph at two weights in two places and getting
 * that wrong is invisible until the two sit side by side. The chat glyph is
 * 21px at stroke 1.5 in the dock and 16px at stroke 1.7 in the tab chip;
 * the plus is 17 at 1.8 in the chat header and 20 at 1.7 in the composer.
 */

type Props = { size?: number; stroke?: number }

const base = (size: number, stroke: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: stroke,
})

export const ChatIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 4z" />
  </svg>
)

export const FilesIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
  </svg>
)

export const MailIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="5.5" width="18" height="13" rx="2" />
    <polyline points="3.5,7 12,13 20.5,7" />
  </svg>
)

export const CalendarIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
    <line x1="8" y1="3" x2="8" y2="6" />
    <line x1="16" y1="3" x2="16" y2="6" />
  </svg>
)

export const DocsIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <polyline points="14,3 14,7 18,7" />
    <line x1="8.5" y1="12" x2="15" y2="12" />
    <line x1="8.5" y1="16" x2="15" y2="16" />
  </svg>
)

export const SheetsIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
    <line x1="3.5" y1="14.5" x2="20.5" y2="14.5" />
    <line x1="9.5" y1="9.5" x2="9.5" y2="19.5" />
  </svg>
)

export const SharePointIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <path d="M6.5 18a3.5 3.5 0 0 1-.4-7A5 5 0 0 1 16 10.2a3.9 3.9 0 0 1 .5 7.8z" />
  </svg>
)

export const ProjectsIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="3.5" y="6" width="17" height="13" rx="2" />
    <path d="M9 6V4.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V6" />
    <line x1="3.5" y1="12" x2="20.5" y2="12" />
  </svg>
)

export const TerminalIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <polyline points="5,8 9,12 5,16" />
    <line x1="12" y1="16" x2="19" y2="16" />
  </svg>
)

export const ApplicationsIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </svg>
)

export const LibraryIcon = ({ size = 21, stroke = 1.5 }: Props) => (
  <svg {...base(size, stroke)}>
    <line x1="5" y1="4.5" x2="5" y2="19.5" />
    <line x1="9" y1="4.5" x2="9" y2="19.5" />
    <line x1="13" y1="4.5" x2="13" y2="19.5" />
    <line x1="17.5" y1="5" x2="20" y2="19.2" />
  </svg>
)

export const PlusIcon = ({ size = 17, stroke = 1.8 }: Props) => (
  <svg {...base(size, stroke)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

/** Beside the deal name under the panels. */
export const PanelIcon = ({ size = 19, stroke = 1.6 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <line x1="9.5" y1="5" x2="9.5" y2="19" />
  </svg>
)

export const MicIcon = ({ size = 19, stroke = 1.7 }: Props) => (
  <svg {...base(size, stroke)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
    <line x1="12" y1="18" x2="12" y2="21" />
  </svg>
)

export const SendIcon = ({ size = 16, stroke = 2 }: Props) => (
  <svg {...base(size, stroke)}>
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5,12 12,5 19,12" />
  </svg>
)

/** The mark. Nine cells, three of them full circles. 44px in the design. */
export const Mark = ({ size = 44 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="#0b62c4" aria-label="Pierce">
    <circle cx="26" cy="26" r="13" />
    <ellipse cx="50" cy="26" rx="13" ry="8" transform="rotate(-45 50 26)" />
    <ellipse cx="74" cy="26" rx="13" ry="4" transform="rotate(-45 74 26)" />
    <ellipse cx="26" cy="50" rx="13" ry="8" transform="rotate(-45 26 50)" />
    <ellipse cx="50" cy="50" rx="9.5" ry="4" transform="rotate(-45 50 50)" />
    <ellipse cx="74" cy="50" rx="13" ry="8" transform="rotate(-45 74 50)" />
    <ellipse cx="26" cy="74" rx="13" ry="4" transform="rotate(-45 26 74)" />
    <ellipse cx="50" cy="74" rx="13" ry="8" transform="rotate(-45 50 74)" />
    <circle cx="74" cy="74" r="13" />
  </svg>
)
