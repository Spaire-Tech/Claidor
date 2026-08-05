const FastifyIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M27.2 8.4L25 4.6c-.2-.3-.5-.5-.8-.6L16.8 2h-.2c-.4 0-.7.2-.9.5L13 6.8l-5.4 1.4c-.5.1-.8.5-.9 1L5 16.8c-.1.4 0 .8.2 1.1l3.5 4.6-.4 5.6c0 .5.2.9.6 1.2.2.1.5.2.7.2.2 0 .3 0 .5-.1l5.3-2.2 5.3 2.2c.4.2.9.1 1.2-.1.3-.3.5-.7.5-1.2l-.5-5.6 3.5-4.6c.3-.3.3-.7.2-1.1L27.2 8.4z"
        fill="currentColor"
      />
      <circle cx="14" cy="13" r="1.5" fill="white" />
      <path
        d="M12 18.5c0-.276.224-.5.5-.5h7c.276 0 .5.224.5.5s-.224.5-.5.5h-7a.5.5 0 01-.5-.5z"
        fill="white"
      />
    </svg>
  )
}

export default FastifyIcon
