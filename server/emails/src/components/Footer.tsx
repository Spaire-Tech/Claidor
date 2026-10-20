import { Hr, Section, Text } from '@react-email/components'
import { words } from '../words'

const Footer = ({
  email,
  language,
}: {
  email: string | null
  language?: string | null
}) => (
  <>
    <Hr />
    <Section className="text-center text-sm">
      {email && (
        <Text className="mb-2 text-gray-500">
          {words(language).sentToBefore}{' '}
          <a
            href={`mailto:${email}`}
            className="font-semibold"
            style={{
              textDecoration: 'none !important',
              color: 'inherit !important',
            }}
          >
            <span
              style={{
                textDecoration: 'none !important',
                color: 'inherit !important',
              }}
            >
              {email}
            </span>
          </a>
          {words(language).sentToAfter}
        </Text>
      )}
      <Text className="font-semibold text-gray-900">Simeon Labs</Text>
    </Section>
  </>
)

export default Footer
