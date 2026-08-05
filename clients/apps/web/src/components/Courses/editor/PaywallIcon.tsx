'use client'

export function PaywallIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="paywallBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.730 0.185 272)" />
          <stop offset="100%" stopColor="oklch(0.480 0.195 272)" />
        </linearGradient>
        <linearGradient id="paywallShackle" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.65" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Shackle */}
      <path
        d="M9 12V9a5 5 0 0 1 10 0v3"
        stroke="oklch(0.480 0.195 272)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Body */}
      <rect
        x="6"
        y="12"
        width="16"
        height="12"
        rx="3"
        fill="url(#paywallBody)"
      />
      {/* Body highlight */}
      <rect
        x="6"
        y="12.4"
        width="16"
        height="4"
        rx="2"
        fill="url(#paywallShackle)"
      />
      {/* Keyhole */}
      <circle cx="14" cy="17" r="1.6" fill="#FFFFFF" />
      <rect
        x="13.3"
        y="17.5"
        width="1.4"
        height="3.2"
        rx="0.6"
        fill="#FFFFFF"
      />
    </svg>
  )
}
