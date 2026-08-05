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
      src="/assets/logotype-spaire.png"
      alt="Spaire"
      width={width}
      height={height}
      className={twMerge(className ? className : '')}
    />
  )
}

export default LogoType
