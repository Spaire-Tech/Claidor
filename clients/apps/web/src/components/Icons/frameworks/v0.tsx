const V0Icon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="40" height="40" rx="8" fill="currentColor" />
      <path
        d="M14.08 13.5L20 25.5L25.92 13.5H28L20 29L12 13.5H14.08Z"
        fill="white"
        className=""
      />
      <path
        d="M29.5 18.5C29.5 22.366 26.366 25.5 22.5 25.5C18.634 25.5 15.5 22.366 15.5 18.5C15.5 14.634 18.634 11.5 22.5 11.5C26.366 11.5 29.5 14.634 29.5 18.5Z"
        stroke="white"
        className=""
        strokeWidth="1.5"
        fill="none"
      />
    </svg>
  )
}

export default V0Icon
