const RubyIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.464 25.186L25.87 27.1l4.086-20.816-8.59-4.24-15.14 8.13L2.044 27.1l4.42-1.914z"
        fill="url(#ruby_a)"
      />
      <path
        d="M25.33 24.752l2.67-18.47L21.546 2l-7.36 5.05-6.896 5.1-5.246 15.3 23.286-2.698z"
        fill="url(#ruby_b)"
      />
      <path
        d="M25.33 24.752L13.02 22.41l-4.82 4.84 17.13-2.498z"
        fill="url(#ruby_c)"
      />
      <path
        d="M8.2 27.25l3.26-10.16-9.416 10.36L8.2 27.25z"
        fill="url(#ruby_d)"
      />
      <path
        d="M20.7 15.72l5.17 1.57-4.324-11.24L20.7 15.72z"
        fill="url(#ruby_e)"
      />
      <path
        d="M28 6.282l-6.454-4.24 4.09 9.57L28 6.282z"
        fill="url(#ruby_f)"
      />
      <path
        d="M29.96 27.1l-4.09-2.348-1.28 2.698L29.96 27.1z"
        fill="url(#ruby_g)"
      />
      <path
        d="M29.96 27.1l-4.63-2.348L28 6.282l1.96 20.818z"
        fill="url(#ruby_h)"
      />
      <defs>
        <linearGradient
          id="ruby_a"
          x1="16"
          y1="2"
          x2="16"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E61B23" />
          <stop offset="1" stopColor="#8B1A23" />
        </linearGradient>
        <linearGradient
          id="ruby_b"
          x1="14"
          y1="2"
          x2="14"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E61B23" />
          <stop offset="1" stopColor="#A21025" />
        </linearGradient>
        <linearGradient
          id="ruby_c"
          x1="16"
          y1="22"
          x2="20"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#BE1622" />
          <stop offset="1" stopColor="#881019" />
        </linearGradient>
        <linearGradient
          id="ruby_d"
          x1="6"
          y1="17"
          x2="6"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#BE1622" />
          <stop offset="1" stopColor="#881019" />
        </linearGradient>
        <linearGradient
          id="ruby_e"
          x1="22"
          y1="6"
          x2="22"
          y2="18"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FB7655" />
          <stop offset="1" stopColor="#E61B23" />
        </linearGradient>
        <linearGradient
          id="ruby_f"
          x1="24"
          y1="2"
          x2="26"
          y2="12"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FB7655" />
          <stop offset="1" stopColor="#E61B23" />
        </linearGradient>
        <linearGradient
          id="ruby_g"
          x1="26"
          y1="24"
          x2="30"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#881019" />
          <stop offset="1" stopColor="#6E0E13" />
        </linearGradient>
        <linearGradient
          id="ruby_h"
          x1="28"
          y1="6"
          x2="30"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#A21025" />
          <stop offset="1" stopColor="#6E0E13" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export default RubyIcon
