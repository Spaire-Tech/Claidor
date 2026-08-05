const ElysiaIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2z"
        fill="url(#elysia_a)"
      />
      <path
        d="M11.5 9.5c0-.828.672-1.5 1.5-1.5h6c.828 0 1.5.672 1.5 1.5v1c0 .828-.672 1.5-1.5 1.5h-6c-.828 0-1.5-.672-1.5-1.5v-1zm0 6c0-.828.672-1.5 1.5-1.5h6c.828 0 1.5.672 1.5 1.5v1c0 .828-.672 1.5-1.5 1.5h-6c-.828 0-1.5-.672-1.5-1.5v-1zm0 6c0-.828.672-1.5 1.5-1.5h6c.828 0 1.5.672 1.5 1.5v1c0 .828-.672 1.5-1.5 1.5h-6c-.828 0-1.5-.672-1.5-1.5v-1z"
        fill="white"
        fillOpacity="0.9"
      />
      <defs>
        <linearGradient
          id="elysia_a"
          x1="2"
          y1="2"
          x2="30"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#82C8E5" />
          <stop offset="1" stopColor="#5A67D8" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default ElysiaIcon
