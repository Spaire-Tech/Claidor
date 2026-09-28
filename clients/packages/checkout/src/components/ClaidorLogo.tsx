const ClaidorLogo = ({
  className,
  width,
  height,
}: {
  className?: string
  width?: number
  height?: number
}) => {
  return (
    <img
      src="/assets/logotype-simeon.png"
      alt="Simeon"
      className={className}
      width={width}
      height={height}
    />
  )
}

export default ClaidorLogo
