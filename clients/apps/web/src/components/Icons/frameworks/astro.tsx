const AstroIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11.505 23.354c-1.01-1.248-.73-3.097-.73-3.097s1.658 1.12 3.271.862c1.613-.26 2.26-1.162 2.26-1.162s.86 1.938-.283 3.227c-1.143 1.29-3.508 1.418-4.518.17z"
        fill="#FF5D01"
      />
      <path
        d="M21.05 4.002a.6.6 0 0 0-.488-.002L10.22 8.662a.6.6 0 0 0-.349.443l-1.746 10.86a.6.6 0 0 0 .199.537l7.1 6.394a.6.6 0 0 0 .59.107l9.773-3.61a.6.6 0 0 0 .385-.467l1.718-17.344a.6.6 0 0 0-.29-.544L21.05 4.002z"
        fill="url(#astro_a)"
      />
      <path
        d="M17.928 10.288c-.105-.302-.545-.302-.65 0l-1.234 3.545h-3.11c-.318 0-.45.407-.193.6l2.516 1.882-1.014 3.213c-.098.31.254.568.519.38l2.84-2.022 2.84 2.022c.265.188.617-.07.52-.38l-1.015-3.213 2.516-1.882c.257-.193.125-.6-.193-.6h-3.11l-1.232-3.545z"
        fill="white"
      />
      <defs>
        <linearGradient
          id="astro_a"
          x1="8"
          y1="4"
          x2="24"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4F39FA" />
          <stop offset="1" stopColor="#DA62C4" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default AstroIcon
