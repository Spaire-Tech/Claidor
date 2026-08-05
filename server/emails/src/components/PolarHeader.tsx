import { Img, Section } from '@react-email/components'

interface HeaderProps {}

const Header = () => (
  <Section>
    <div className="relative h-[48px]">
      <Img
        alt="Spaire Logo"
        height="48"
        src="https://spaire-production-files-public.s3.us-east-1.amazonaws.com/spaire+(27).png"
      />
    </div>
  </Section>
)

export default Header
