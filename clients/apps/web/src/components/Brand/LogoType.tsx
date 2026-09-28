import { twMerge } from 'tailwind-merge'

// Simeon's wordmark, in the colour of the text around it, so a caller's text-*
// class sets it. Size it with a height (or a width); the other follows.
const WORDMARK = 'url(/assets/logotype-simeon.png)'

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
    <span
      role="img"
      aria-label="Simeon"
      className={twMerge('inline-block align-middle', className)}
      style={{
        width,
        height,
        aspectRatio: '866 / 188',
        backgroundColor: 'currentColor',
        WebkitMaskImage: WORDMARK,
        maskImage: WORDMARK,
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'left center',
        maskPosition: 'left center',
      }}
    />
  )
}

export default LogoType
