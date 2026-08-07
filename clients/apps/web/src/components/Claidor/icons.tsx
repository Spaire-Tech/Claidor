/**
 * The design's icon set, verbatim. Every icon is a 16-grid stroke drawing;
 * keeping the paths identical to docs/design/claidor-v1-markup.html is what
 * keeps the build faithful to the design instead of near it.
 */

interface IconProps {
  size?: number
  stroke?: string
  strokeWidth?: number
}

const Icon = ({
  d,
  size = 15,
  stroke = 'currentColor',
  strokeWidth = 1.4,
  children,
}: IconProps & { d?: string; children?: React.ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    stroke={stroke}
    strokeWidth={strokeWidth}
  >
    {d ? <path d={d} /> : null}
    {children}
  </svg>
)

export const AssistantIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="1.5" width="13" height="13" rx="3" />
    <path
      d="M8 4.8l0.9 2.3 2.3 0.9-2.3 0.9L8 11.2 7.1 8.9 4.8 8l2.3-0.9z"
      fill="currentColor"
      stroke="none"
    />
  </Icon>
)

export const RechercheIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
)

export const DossierIcon = (p: IconProps) => (
  <Icon
    {...p}
    d="M1.5 4.5a2 2 0 012-2h3l1.5 2h4.5a2 2 0 012 2v5a2 2 0 01-2 2h-9a2 2 0 01-2-2z"
  />
)

export const AnalysesIcon = (p: IconProps) => (
  <Icon {...p} d="M2 4h12M2 8h8M2 12h12M12 6.5L14 8l-2 1.5" />
)

export const VeillesIcon = (p: IconProps) => (
  <Icon
    {...p}
    d="M8 2a4 4 0 00-4 4v3l-1.5 2.5h11L12 9V6a4 4 0 00-4-4zM6.5 13.5a1.5 1.5 0 003 0"
  />
)

export const LecteurIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 1.5h7L13 4.5v10H3zM10 1.5v3h3" />
    <circle cx="7" cy="8.5" r="2" />
    <path d="M8.5 10L10 11.5" />
  </Icon>
)

export const HistoriqueIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M8 4.5V8l2.5 1.5" />
  </Icon>
)

export const BiblioIcon = (p: IconProps) => (
  <Icon {...p} d="M2.5 2.5v11M6 2.5v11M9.5 3.5l3 10" />
)

export const GuidesIcon = (p: IconProps) => (
  <Icon
    {...p}
    d="M8 3.5C6.5 2.3 4.5 2 2 2v11c2.5 0 4.5 0.3 6 1.5 1.5-1.2 3.5-1.5 6-1.5V2c-2.5 0-4.5 0.3-6 1.5zM8 3.5v11"
  />
)

export const PlusIcon = ({ size = 12 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 12 12"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path d="M6 1.5v9M1.5 6h9" />
  </svg>
)

export const HelpIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.5" />
    <path d="M6.2 6.2a1.8 1.8 0 113 1.3c-0.6 0.5-1.2 0.8-1.2 1.6" />
    <circle cx="8" cy="11.4" r="0.5" fill="currentColor" />
  </Icon>
)

export const SunIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
)

export const MoonIcon = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
  </svg>
)

/** Source-kind glyphs: pièce (amber), article (blue), décision (red). */
export const PieceGlyph = (p: IconProps) => (
  <Icon {...p} d="M3 1.5h7L13 4.5v10H3zM10 1.5v3h3M5.5 8h5M5.5 10.5h3" />
)

export const ArticleGlyph = (p: IconProps) => (
  <Icon
    {...p}
    d="M8 2.5C6.5 1.6 4.5 1.4 2.5 1.4v11.2c2 0 4 0.2 5.5 1.1 1.5-0.9 3.5-1.1 5.5-1.1V1.4c-2 0-4 0.2-5.5 1.1zM8 2.5v11.2"
  />
)

export const DecisionGlyph = (p: IconProps) => (
  <Icon
    {...p}
    d="M8 2v11M5 13h6M8 3.5L3.5 5M8 3.5L12.5 5M3.5 5l-1.8 4a2.3 2.3 0 003.6 0zM12.5 5l-1.8 4a2.3 2.3 0 003.6 0z"
  />
)
