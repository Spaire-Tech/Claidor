const TanStackIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="14" fill="#002B41" />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5"
        stroke="#EF4444"
        strokeWidth="1.5"
        fill="none"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5"
        stroke="#F59E0B"
        strokeWidth="1.5"
        fill="none"
        transform="rotate(60 16 16)"
      />
      <ellipse
        cx="16"
        cy="16"
        rx="13"
        ry="5"
        stroke="#10B981"
        strokeWidth="1.5"
        fill="none"
        transform="rotate(120 16 16)"
      />
      <circle cx="16" cy="16" r="3" fill="white" />
    </svg>
  )
}

export default TanStackIcon
