import MarketingEmailWrapper from '../components/MarketingEmailWrapper'

// Props match the snake_case JSON the Python renderer emits — see
// `MarketingEmailProps` in `polar/email/schemas.py`.
export interface MarketingEmailProps {
  organization_name: string
  organization_logo_url?: string | null
  organization_website?: string | null
  html_content: string
  unsubscribe_url: string
  preview_text?: string | null
}

export function MarketingEmail({
  organization_name,
  organization_logo_url,
  organization_website,
  html_content,
  unsubscribe_url,
  preview_text,
}: MarketingEmailProps) {
  return (
    <MarketingEmailWrapper
      organization_name={organization_name}
      organization_logo_url={organization_logo_url}
      organization_website={organization_website}
      html_content={html_content}
      unsubscribe_url={unsubscribe_url}
      preview_text={preview_text}
    />
  )
}

MarketingEmail.PreviewProps = {
  organization_name: 'Acme Inc',
  organization_logo_url: null,
  organization_website: 'https://acme.com',
  html_content:
    '<h2>Hello there!</h2><p>This is your weekly newsletter from Acme Inc. We have some exciting news to share with you this week.</p><p>Stay tuned for more updates!</p>',
  unsubscribe_url: 'https://app.spairehq.com/email/unsubscribe?sid=preview',
  preview_text: 'Your weekly update from Acme Inc',
} satisfies MarketingEmailProps

export default MarketingEmail
