import Image from 'next/image'

const LovableIcon = ({ size = 40 }: { size?: number }) => {
  return (
    <Image
      src="/lovable-logo-icon.png"
      alt="Lovable"
      width={size}
      height={size}
      className="rounded-sm"
    />
  )
}

export default LovableIcon
