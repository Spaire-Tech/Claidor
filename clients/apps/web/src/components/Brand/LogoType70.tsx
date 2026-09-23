import { twMerge } from 'tailwind-merge'

const LogoType70 = ({ className }: { className?: string }) => {
  return (
    <img
      src="/assets/logotype-claidor.png"
      alt="Simeon"
      width={198}
      height={70}
      className={twMerge(className ? className : '')}
    />
  )
}

export default LogoType70
