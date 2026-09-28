import { twMerge } from 'tailwind-merge'

import LogoType from './LogoType'

const LogoType70 = ({ className }: { className?: string }) => {
  return <LogoType className={twMerge('h-[70px]', className)} />
}

export default LogoType70
