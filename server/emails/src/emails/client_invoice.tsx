import { Column, Hr, Preview, Row, Section, Text } from '@react-email/components'
import Button from '../components/Button'
import FooterCustomer from '../components/FooterCustomer'
import WrapperOrganization from '../components/WrapperOrganization'
import { organization as previewOrganization } from '../preview'
import type { schemas } from '../types'

function fmt(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(cents / 100)
}

export function ClientInvoice({
  email,
  organization_name,
  organization_avatar_url,
  customer_name,
  invoice_id,
  due_date,
  currency,
  line_items,
  subtotal_amount,
  discount_amount,
  discount_label,
  tax_amount,
  total_amount,
  checkout_link,
  memo,
}: schemas['ClientInvoiceEmailProps']) {
  const org = {
    ...previewOrganization,
    name: organization_name,
    avatar_url: organization_avatar_url ?? undefined,
  } as any
  return (
    <WrapperOrganization organization={org}>
      <Preview>
        Invoice {invoice_id} from {organization_name} — {fmt(total_amount, currency)} due{due_date ? ` ${due_date}` : ''}
      </Preview>

      <Section>
        <Text className="text-2xl font-semibold text-gray-900 m-0">
          You have a new invoice
        </Text>
        <Text className="text-gray-600 mt-2">
          Hi {customer_name}, {organization_name} has sent you an invoice.
        </Text>
      </Section>

      {/* CTA */}
      {checkout_link && (
        <Section className="my-6 text-center">
          <Button href={checkout_link}>Pay invoice</Button>
        </Section>
      )}

      {/* Invoice details box */}
      <Section>
        {/* Header row */}
        <Row>
          <Column>
            <Text className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Invoice #{invoice_id}
            </Text>
          </Column>
          {due_date && (
            <Column className="text-right">
              <Text className="m-0 text-sm text-gray-500">Due {due_date}</Text>
            </Column>
          )}
        </Row>

        <Hr className="my-4 border-gray-200" />

        {/* Line items header */}
        <Row className="mb-2">
          <Column className="w-3/4">
            <Text className="m-0 text-xs font-medium uppercase tracking-wide text-gray-500">
              Description
            </Text>
          </Column>
          <Column className="w-1/4 text-right">
            <Text className="m-0 text-xs font-medium uppercase tracking-wide text-gray-500">
              Amount
            </Text>
          </Column>
        </Row>

        {/* Line items */}
        {line_items.map((item, i) => (
          <Row key={i} className="mb-1">
            <Column className="w-3/4">
              <Text className="m-0 text-sm text-gray-800">
                {item.description}
                {item.quantity > 1 ? ` × ${item.quantity}` : ''}
              </Text>
            </Column>
            <Column className="w-1/4 text-right">
              <Text className="m-0 text-sm text-gray-800">
                {fmt(item.amount, currency)}
              </Text>
            </Column>
          </Row>
        ))}

        <Hr className="my-4 border-gray-200" />

        {/* Totals */}
        <Row className="mb-1">
          <Column className="w-3/4">
            <Text className="m-0 text-sm text-gray-500">Subtotal</Text>
          </Column>
          <Column className="w-1/4 text-right">
            <Text className="m-0 text-sm text-gray-500">
              {fmt(subtotal_amount, currency)}
            </Text>
          </Column>
        </Row>

        {discount_amount > 0 && (
          <Row className="mb-1">
            <Column className="w-3/4">
              <Text className="m-0 text-sm text-gray-500">
                {discount_label ?? 'Discount'}
              </Text>
            </Column>
            <Column className="w-1/4 text-right">
              <Text className="m-0 text-sm text-gray-500">
                -{fmt(discount_amount, currency)}
              </Text>
            </Column>
          </Row>
        )}

        {tax_amount > 0 && (
          <Row className="mb-1">
            <Column className="w-3/4">
              <Text className="m-0 text-sm text-gray-500">Tax</Text>
            </Column>
            <Column className="w-1/4 text-right">
              <Text className="m-0 text-sm text-gray-500">
                {fmt(tax_amount, currency)}
              </Text>
            </Column>
          </Row>
        )}

        <Hr className="my-2 border-gray-300" />

        <Row>
          <Column className="w-3/4">
            <Text className="m-0 font-semibold text-gray-900">Total due</Text>
          </Column>
          <Column className="w-1/4 text-right">
            <Text className="m-0 font-semibold text-gray-900">
              {fmt(total_amount, currency)}
            </Text>
          </Column>
        </Row>
      </Section>

      {/* Memo */}
      {memo && (
        <Section className="mt-6">
          <Hr className="mb-4 border-gray-200" />
          <Text className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-400">
            Note
          </Text>
          <Text className="mt-1 text-sm text-gray-600">{memo}</Text>
        </Section>
      )}

      <Hr className="mt-8" />
      <FooterCustomer
        organization={org}
        email={email}
      />
    </WrapperOrganization>
  )
}

ClientInvoice.PreviewProps = {
  email: 'customer@example.com',
  organization_name: 'Acme Inc.',
  customer_name: 'John Doe',
  invoice_id: 'ABC12345',
  due_date: '2026-04-17',
  currency: 'USD',
  line_items: [
    { description: 'Consulting', quantity: 1, amount: 150000 },
    { description: 'Setup fee', quantity: 1, amount: 50000 },
  ],
  subtotal_amount: 200000,
  discount_amount: 0,
  discount_label: null,
  tax_amount: 14000,
  total_amount: 214000,
  checkout_link: 'https://app.spairehq.com/checkout/abc123',
  memo: 'Thank you for your business.',
}

export default ClientInvoice
