const TypeScriptIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="4" fill="#3178C6" />
      <path
        d="M18.246 14.632h-3.727v12.94h-2.99v-12.94H7.802v-2.468h10.444v2.468zm2.485 2.091c.636-.948 1.547-1.644 2.731-1.644h.05v2.85h-.363c-1.571 0-2.418.88-2.418 2.637v5.006h-2.89v-10.35h2.89v1.5z"
        fill="white"
      />
    </svg>
  )
}

export default TypeScriptIcon
