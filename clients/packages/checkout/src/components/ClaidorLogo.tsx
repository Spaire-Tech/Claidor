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
      src="/assets/logotype-claidor.png"
      alt="Claidor"
      className={className}
      width={width}
      height={height}
    />
  )
}

export default ClaidorLogo
