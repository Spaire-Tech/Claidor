import { Img, Section } from '@react-email/components'

interface HeaderProps {}

const Header = () => (
  <Section>
    <div className="relative h-[48px]">
      <Img
        alt="Claidor Logo"
        height="48"
        src="https://claidor-production-files-public.s3.us-east-1.amazonaws.com/claidor+(27).png"
      />
    </div>
  </Section>
)

export default Header
