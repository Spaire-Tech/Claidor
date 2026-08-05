const SpaireLogo = ({
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
      src="/assets/logotype-spaire.png"
      alt="Spaire"
      className={className}
      width={width}
      height={height}
    />
  )
}

export default SpaireLogo
