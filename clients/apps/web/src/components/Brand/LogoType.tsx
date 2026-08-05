import { twMerge } from 'tailwind-merge'

const LogoType = ({
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
      width={width}
      height={height}
      className={twMerge(className ? className : '')}
    />
  )
}

export default LogoType
