import { Img, Section } from '@react-email/components'

interface HeaderProps {}

const Header = () => (
  <Section>
    <div className="relative h-[48px]">
      <Img
        alt="Simeon Logo"
        height="48"
        src="https://www.simeonlabs.com/apple-touch-icon.png"
      />
    </div>
  </Section>
)

export default Header
