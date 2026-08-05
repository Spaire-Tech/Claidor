const RemixIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M25.787 23.896c.217 2.627.217 3.858.217 5.104H18.4c0-.508.025-1.038.052-1.592.065-1.325.136-2.771-.052-4.96-.248-2.892-1.474-3.534-3.8-3.534H4v-5.228h11.172c2.946 0 4.42-1.284 4.42-3.713 0-2.176-1.474-3.534-4.42-3.534H4V1.6h12.77c6.512 0 9.768 3.106 9.768 8.066 0 3.713-2.326 6.136-5.458 6.734 2.698.676 4.296 2.338 4.707 7.496z"
        fill="currentColor"
      />
      <path d="M4 29v-4.42h8.72c1.106 0 1.354.82 1.354 1.31V29H4z" fill="currentColor" />
    </svg>
  )
}

export default RemixIcon
