const HonoIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.2 3.2c-.4-.6-1.3-.3-1.3.4v10.8c0 .2-.1.4-.2.5L4.4 20c-.6.7-.1 1.8.8 1.8H8c.3 0 .6.2.7.5l2.4 6c.3.6 1.1.7 1.5.1L20 17.6"
        fill="url(#hono_a)"
      />
      <path
        d="M20.8 3.2c.4-.6 1.3-.3 1.3.4v10.8c0 .2.1.4.2.5l5.3 5.1c.6.7.1 1.8-.8 1.8H24c-.3 0-.6.2-.7.5l-2.4 6c-.3.6-1.1.7-1.5.1L12 17.6"
        fill="url(#hono_b)"
      />
      <defs>
        <linearGradient
          id="hono_a"
          x1="4"
          y1="3"
          x2="20"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF6B35" />
          <stop offset="1" stopColor="#FF3D00" />
        </linearGradient>
        <linearGradient
          id="hono_b"
          x1="12"
          y1="3"
          x2="28"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFAB40" />
          <stop offset="1" stopColor="#FF6B35" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default HonoIcon
