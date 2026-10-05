import { twMerge } from 'tailwind-merge'

// Simeon's wordmark, in the colour of the text around it, so a caller's text-*
// class sets it. Size it with a height (or a width); the other follows.
// `labs` draws the company's wordmark, SimeonLabs, the one the website's
// bar carries (sites/simeonlabs.com, img/wordmark-labs.png).
const WORDMARKS = {
  simeon: { url: 'url(/assets/logotype-simeon.png)', ratio: '866 / 188' },
  labs: { url: 'url(/assets/logotype-simeonlabs.png)', ratio: '1585 / 460' },
} as const

const LogoType = ({
  className,
  width,
  height,
  labs = false,
}: {
  className?: string
  width?: number
  height?: number
  labs?: boolean
}) => {
  const mark = labs ? WORDMARKS.labs : WORDMARKS.simeon
  return (
    <span
      role="img"
      aria-label={labs ? 'SimeonLabs' : 'Simeon'}
      className={twMerge('inline-block align-middle', className)}
      style={{
        width,
        height,
        aspectRatio: mark.ratio,
        backgroundColor: 'currentColor',
        WebkitMaskImage: mark.url,
        maskImage: mark.url,
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
