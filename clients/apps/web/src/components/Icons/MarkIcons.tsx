// Stripe-style mark icons — geometric overlapping shapes, multiply blend, muted palette.
// Used across the dashboard nav, email marketing tabs, and sequence category chips.

import { ReactElement } from 'react'

const MARK_PALETTE = {
  violet: '#0066cc',
  violetDk: '#0054b1',
  cyan: '#3aa6c9',
  green: '#3aa37a',
  greenDk: '#247055',
  amber: '#d49a3a',
  pink: '#d96aa1',
  blue: '#3a6ea5',
  blueDk: '#27497a',
  slate: '#425466',
}

const MarkWrap = ({
  size = 32,
  children,
  viewBox = '0 0 32 32',
}: {
  size?: number
  children: React.ReactNode
  viewBox?: string
}) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill="none"
    style={{ display: 'block' }}
  >
    <g style={{ mixBlendMode: 'multiply' }}>{children}</g>
  </svg>
)

export const MarkPeople = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="3"
      y="9"
      width="14"
      height="16"
      rx="2.5"
      fill={MARK_PALETTE.amber}
      opacity="0.9"
    />
    <circle cx="20" cy="17" r="8" fill={MARK_PALETTE.greenDk} opacity="0.92" />
  </MarkWrap>
)

export const MarkBroadcast = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="4"
      y="6"
      width="14"
      height="11"
      rx="2"
      fill={MARK_PALETTE.pink}
      opacity="0.85"
      transform="rotate(-8 11 11)"
    />
    <rect
      x="13"
      y="14"
      width="15"
      height="11"
      rx="2"
      fill={MARK_PALETTE.blueDk}
      opacity="0.95"
    />
  </MarkWrap>
)

export const MarkSequences = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path d="M5 7 L21 16 L5 25 Z" fill={MARK_PALETTE.violetDk} opacity="0.95" />
    <path d="M14 12 L26 16 L14 20 Z" fill={MARK_PALETTE.cyan} opacity="0.85" />
  </MarkWrap>
)

export const MarkAnalytics = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="5"
      y="13"
      width="10"
      height="14"
      rx="1.5"
      fill={MARK_PALETTE.cyan}
      opacity="0.9"
    />
    <rect
      x="13"
      y="6"
      width="11"
      height="21"
      rx="1.5"
      fill={MARK_PALETTE.greenDk}
      opacity="0.92"
    />
  </MarkWrap>
)

export const MarkBook = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="5"
      y="6"
      width="16"
      height="20"
      rx="2"
      fill={MARK_PALETTE.greenDk}
      opacity="0.92"
    />
    <rect
      x="11"
      y="10"
      width="16"
      height="16"
      rx="2"
      fill={MARK_PALETTE.cyan}
      opacity="0.85"
    />
  </MarkWrap>
)

export const MarkPackage = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="3"
      y="8"
      width="18"
      height="18"
      rx="2"
      fill={MARK_PALETTE.blueDk}
      opacity="0.95"
    />
    <rect
      x="14"
      y="4"
      width="14"
      height="14"
      rx="2"
      fill={MARK_PALETTE.amber}
      opacity="0.88"
    />
  </MarkWrap>
)

export const MarkMic = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="11"
      y="3"
      width="10"
      height="20"
      rx="5"
      fill={MARK_PALETTE.violetDk}
      opacity="0.95"
    />
    <circle cx="22" cy="22" r="7" fill={MARK_PALETTE.pink} opacity="0.85" />
  </MarkWrap>
)

export const MarkCart = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M5 7 L24 7 L21 19 L8 19 Z"
      fill={MARK_PALETTE.amber}
      opacity="0.9"
    />
    <circle cx="11" cy="25" r="3.5" fill={MARK_PALETTE.violetDk} />
    <circle cx="20" cy="25" r="3.5" fill={MARK_PALETTE.violetDk} />
  </MarkWrap>
)

export const MarkGift = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="4"
      y="11"
      width="24"
      height="16"
      rx="2"
      fill={MARK_PALETTE.greenDk}
      opacity="0.92"
    />
    <rect
      x="14"
      y="4"
      width="4"
      height="23"
      fill={MARK_PALETTE.amber}
      opacity="0.95"
    />
  </MarkWrap>
)

export const MarkRotate = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <circle
      cx="16"
      cy="16"
      r="10"
      fill={MARK_PALETTE.violetDk}
      opacity="0.95"
    />
    <circle cx="16" cy="16" r="6" fill="#fff" />
    <rect
      x="14"
      y="3"
      width="10"
      height="6"
      fill={MARK_PALETTE.cyan}
      opacity="0.9"
    />
  </MarkWrap>
)

export const MarkXCircle = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <rect
      x="4"
      y="4"
      width="14"
      height="14"
      rx="2"
      fill={MARK_PALETTE.pink}
      opacity="0.85"
    />
    <circle cx="20" cy="20" r="8" fill={MARK_PALETTE.blueDk} opacity="0.95" />
  </MarkWrap>
)

export const MarkSparkles = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M11 4 L22 18 L4 18 Z"
      fill={MARK_PALETTE.violetDk}
      opacity="0.95"
    />
    <path d="M22 14 L29 26 L17 26 Z" fill={MARK_PALETTE.amber} opacity="0.9" />
  </MarkWrap>
)

export const MarkHeart = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <circle cx="12" cy="14" r="9" fill={MARK_PALETTE.pink} opacity="0.85" />
    <circle cx="20" cy="14" r="9" fill={MARK_PALETTE.violetDk} opacity="0.9" />
  </MarkWrap>
)

export const MarkTag = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M5 7 L19 7 L27 16 L19 25 L5 25 Z"
      fill={MARK_PALETTE.greenDk}
      opacity="0.92"
    />
    <circle cx="11" cy="16" r="3" fill="#fff" />
  </MarkWrap>
)

export const MarkPointer = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M6 4 L24 14 L15 16 L13 25 Z"
      fill={MARK_PALETTE.violetDk}
      opacity="0.95"
    />
    <rect
      x="14"
      y="16"
      width="6"
      height="12"
      rx="1"
      fill={MARK_PALETTE.amber}
      opacity="0.88"
      transform="rotate(-25 17 22)"
    />
  </MarkWrap>
)

export const MarkMailOpen = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M4 14 L16 6 L28 14 L28 27 L4 27 Z"
      fill={MARK_PALETTE.blueDk}
      opacity="0.95"
    />
    <rect
      x="10"
      y="9"
      width="12"
      height="12"
      fill={MARK_PALETTE.amber}
      opacity="0.88"
    />
  </MarkWrap>
)

export const MarkCheck = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <circle cx="16" cy="16" r="11" fill={MARK_PALETTE.greenDk} opacity="0.92" />
    <path
      d="M10 16 L14 20 L23 11"
      stroke="#fff"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </MarkWrap>
)

export const MarkZap = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <path
      d="M16 3 L8 18 L15 18 L13 29 L23 13 L17 13 Z"
      fill={MARK_PALETTE.amber}
    />
    <path d="M16 3 L8 18 L15 18 Z" fill={MARK_PALETTE.violetDk} opacity="0.7" />
  </MarkWrap>
)

export const MarkUser = ({ size = 32 }: { size?: number }) => (
  <MarkWrap size={size}>
    <circle cx="16" cy="11" r="7" fill={MARK_PALETTE.cyan} opacity="0.9" />
    <rect
      x="6"
      y="18"
      width="20"
      height="11"
      rx="5.5"
      fill={MARK_PALETTE.blueDk}
      opacity="0.95"
    />
  </MarkWrap>
)

// Lookup by string icon name — matches names already used in CATEGORIES /
// TRIGGERS. Components fall back to the raw Icon name when missing.
export const MARK_BY_NAME: Record<
  string,
  (props: { size?: number }) => ReactElement
> = {
  user: MarkUser,
  'shopping-cart': MarkCart,
  rotate: MarkRotate,
  'x-circle': MarkXCircle,
  tag: MarkTag,
  'mouse-pointer': MarkPointer,
  sparkles: MarkSparkles,
  heart: MarkHeart,
  zap: MarkZap,
  'mail-open': MarkMailOpen,
  'check-circle': MarkCheck,
  book: MarkBook,
  package: MarkPackage,
  mic: MarkMic,
  gift: MarkGift,
}
