import {
  Body,
  Column,
  Container,
  Hr,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from '@react-email/components'
import WrapperBase from './WrapperBase'

// Props are snake_case to match the JSON the Python renderer emits
// (Pydantic dumps using the field name, not an alias). Keep this in
// sync with `MarketingEmailProps` in `polar/email/schemas.py`.
interface MarketingEmailWrapperProps {
  organization_name: string
  organization_logo_url?: string | null
  organization_website?: string | null
  html_content: string
  unsubscribe_url: string
  preview_text?: string | null
}

const MarketingEmailWrapper = ({
  organization_name,
  organization_logo_url,
  organization_website,
  html_content,
  unsubscribe_url,
  preview_text,
}: MarketingEmailWrapperProps) => {
  const header = (
    <Section className="pt-[10px] pb-[4px]">
      <Row>
        {organization_logo_url && (
          <Column className="w-10">
            <Img
              alt={organization_name}
              src={organization_logo_url}
              className="size-8 overflow-hidden rounded-full object-cover"
            />
          </Column>
        )}
        <Column>
          <Text className="my-0 text-lg font-bold text-gray-900">
            {organization_name}
          </Text>
        </Column>
      </Row>
    </Section>
  )

  return (
    <WrapperBase>
      {preview_text && <Preview>{preview_text}</Preview>}
      <Body className="bg-white font-sans">
        <Container className="px-[20px] pt-[20px] pb-[10px]">
          {organization_website ? (
            <Link href={organization_website} className="no-underline">
              {header}
            </Link>
          ) : (
            header
          )}
        </Container>
        <Container className="px-[20px] pt-[10px] pb-[20px]">
          {/* User-composed HTML content */}
          <div dangerouslySetInnerHTML={{ __html: html_content }} />
        </Container>
        <Container className="px-[20px] pb-[20px]">
          <Hr className="border-gray-200" />
          <Section className="text-center text-sm">
            <Text className="text-gray-500">
              You&apos;re receiving this email because you subscribed to
              updates from{' '}
              <span className="font-semibold">{organization_name}</span>.
            </Text>
            <Text>
              <Link
                href={unsubscribe_url}
                className="text-gray-500 underline"
              >
                Unsubscribe
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </WrapperBase>
  )
}

export default MarketingEmailWrapper
