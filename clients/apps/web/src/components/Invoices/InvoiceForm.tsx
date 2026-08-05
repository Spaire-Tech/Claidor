'use client'

import { Section } from '@/components/Layout/Section'
import { InlineModal, InlineModalHeader } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import { CreateCustomerModal } from '@/components/Customer/CreateCustomerModal'
import CreateDiscountModalContent from '@/components/Discounts/CreateDiscountModalContent'
import { CreateProductPage } from '@/components/Products/CreateProductPage'
import { CheckoutLinkForm } from '@/components/CheckoutLinks/CheckoutLinkForm'
import { toast } from '@/components/Toast/use-toast'
import {
  useCheckoutLinks,
  useCustomer,
  useCustomers,
  useDiscounts,
  useProducts,
} from '@/hooks/queries'
import {
  ClientInvoiceCreate,
  useCreateClientInvoice,
} from '@/hooks/queries/client_invoices'
import { api } from '@/utils/client'
import AddOutlined from '@mui/icons-material/AddOutlined'
import RemoveCircleOutlineOutlined from '@mui/icons-material/RemoveCircleOutlineOutlined'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { Combobox } from '@spaire/ui/components/atoms/Combobox'
import Input from '@spaire/ui/components/atoms/Input'
import TextArea from '@spaire/ui/components/atoms/TextArea'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@spaire/ui/components/ui/form'
import { addDays, format } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useForm, useFormContext, useWatch } from 'react-hook-form'
import { twMerge } from 'tailwind-merge'

// ─── Supported currencies ─────────────────────────────────────────────────────

const CURRENCIES = [
  { value: 'usd', label: 'US Dollar' },
  { value: 'eur', label: 'Euro' },
  { value: 'gbp', label: 'British Pound' },
  { value: 'aed', label: 'UAE Dirham' },
  { value: 'ars', label: 'Argentine Peso' },
  { value: 'aud', label: 'Australian Dollar' },
  { value: 'brl', label: 'Brazilian Real' },
  { value: 'cad', label: 'Canadian Dollar' },
  { value: 'chf', label: 'Swiss Franc' },
  { value: 'clp', label: 'Chilean Peso' },
  { value: 'cny', label: 'Chinese Yuan' },
  { value: 'cop', label: 'Colombian Peso' },
  { value: 'czk', label: 'Czech Koruna' },
  { value: 'dkk', label: 'Danish Krone' },
  { value: 'hkd', label: 'Hong Kong Dollar' },
  { value: 'huf', label: 'Hungarian Forint' },
  { value: 'idr', label: 'Indonesian Rupiah' },
  { value: 'ils', label: 'Israeli Shekel' },
  { value: 'inr', label: 'Indian Rupee' },
  { value: 'jpy', label: 'Japanese Yen' },
  { value: 'krw', label: 'South Korean Won' },
  { value: 'mxn', label: 'Mexican Peso' },
  { value: 'myr', label: 'Malaysian Ringgit' },
  { value: 'nok', label: 'Norwegian Krone' },
  { value: 'nzd', label: 'New Zealand Dollar' },
  { value: 'pen', label: 'Peruvian Sol' },
  { value: 'php', label: 'Philippine Peso' },
  { value: 'pln', label: 'Polish Zloty' },
  { value: 'ron', label: 'Romanian Leu' },
  { value: 'sar', label: 'Saudi Riyal' },
  { value: 'sek', label: 'Swedish Krona' },
  { value: 'sgd', label: 'Singapore Dollar' },
  { value: 'thb', label: 'Thai Baht' },
  { value: 'try', label: 'Turkish Lira' },
  { value: 'twd', label: 'Taiwan Dollar' },
  { value: 'zar', label: 'South African Rand' },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineItemValue {
  description: string
  quantity: number
  unit_amount: string
}

export interface InvoiceFormValues {
  customer_id: string
  currency: string
  line_items: LineItemValue[]
  due_date: string
  memo: string
  po_number: string
  on_behalf_of_label: string
  billing_line1: string
  billing_line2: string
  billing_city: string
  billing_state: string
  billing_postal_code: string
  billing_country: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPriceForCurrency(product: schemas['Product'], currency: string): number {
  const prices = product.prices ?? []
  const match = prices.find(
    (p) =>
      'price_currency' in p &&
      (p as any).price_currency === currency.toLowerCase() &&
      'price_amount' in p,
  )
  if (match) return ((match as any).price_amount as number) ?? 0
  const fallback = prices.find((p) => 'price_amount' in p)
  return fallback ? ((fallback as any).price_amount as number) ?? 0 : 0
}

export function computeDiscountCents(discount: schemas['Discount'], subtotalCents: number): number {
  if (discount.type === 'fixed') return (discount as any).amount ?? 0
  return Math.round((subtotalCents * ((discount as any).basis_points ?? 0)) / 10000)
}

// ─── Section: Customer ────────────────────────────────────────────────────────

const InvoiceCustomerSection = ({
  organization,
  onNewCustomer,
}: {
  organization: schemas['Organization']
  onNewCustomer: () => void
}) => {
  const { control } = useFormContext<InvoiceFormValues>()
  const customerId = useWatch<InvoiceFormValues, 'customer_id'>({ name: 'customer_id' })
  const [customerQuery, setCustomerQuery] = useState('')

  const { data: customersData, isLoading: isLoadingCustomers } = useCustomers(
    organization.id,
    { query: customerQuery || undefined },
  )
  const customers = useMemo(
    () => customersData?.pages.flatMap((p) => p.items) ?? [],
    [customersData],
  )

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null

  return (
    <Section compact title="Customer" description="The customer you are invoicing">
      <div className="flex w-full flex-col gap-y-4">
        <FormField
          control={control}
          name="customer_id"
          rules={{ required: 'Please select a customer' }}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Combobox
                  items={customers}
                  value={field.value || null}
                  selectedItem={selectedCustomer}
                  onChange={(v) => field.onChange(v ?? '')}
                  onQueryChange={setCustomerQuery}
                  getItemValue={(c) => c.id}
                  getItemLabel={(c) => c.name ?? c.email}
                  renderItem={(c) => (
                    <div className="flex flex-col">
                      <span className="font-medium">{c.name ?? c.email}</span>
                      {c.name && (
                        <span className="text-xs text-gray-500">
                          {c.email}
                        </span>
                      )}
                    </div>
                  )}
                  isLoading={isLoadingCustomers}
                  placeholder="Select a customer"
                  searchPlaceholder="Search customers…"
                  emptyLabel="No customers found"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <button
          type="button"
          onClick={onNewCustomer}
          className="flex w-fit items-center gap-x-1 text-sm text-blue-500 hover:text-blue-600"
        >
          <AddOutlined fontSize="small" />
          New customer
        </button>
      </div>
    </Section>
  )
}

// ─── Section: Billing Address ─────────────────────────────────────────────────

const InvoiceBillingAddressSection = () => {
  const { control, setValue } = useFormContext<InvoiceFormValues>()
  const customerId = useWatch<InvoiceFormValues, 'customer_id'>({ name: 'customer_id' })
  const { data: selectedCustomer } = useCustomer(customerId || null)

  useEffect(() => {
    if (
      customerId &&
      selectedCustomer &&
      (selectedCustomer as any).id === customerId
    ) {
      const addr = (selectedCustomer as any).billing_address
      setValue('billing_line1', addr?.line1 ?? '')
      setValue('billing_line2', addr?.line2 ?? '')
      setValue('billing_city', addr?.city ?? '')
      setValue('billing_state', addr?.state ?? '')
      setValue('billing_postal_code', addr?.postal_code ?? '')
      setValue('billing_country', addr?.country ?? '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, selectedCustomer])

  if (!customerId) return null

  return (
    <Section
      compact
      title="Billing Address"
      description="Used for tax calculation and shown on the invoice. Auto-filled if the customer already has one."
    >
      <div className="flex w-full flex-col gap-y-4">
        <FormField
          control={control}
          name="billing_line1"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Address line 1</FormLabel>
              <FormControl>
                <Input {...field} placeholder="123 Main Street" />
              </FormControl>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="billing_line2"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Address line 2{' '}
                <span className=" font-normal text-gray-400">
                  (optional)
                </span>
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder="Suite 100" />
              </FormControl>
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="billing_city"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="New York" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="billing_state"
            render={({ field }) => (
              <FormItem>
                <FormLabel>State / Province</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="NY" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="billing_postal_code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Postal code</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="10001" />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="billing_country"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Country</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="US" />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>
    </Section>
  )
}

// ─── Section: Currency ────────────────────────────────────────────────────────

const InvoiceCurrencySection = () => {
  const { control } = useFormContext<InvoiceFormValues>()

  return (
    <Section compact title="Currency" description="All line items will be billed in this currency">
      <FormField
        control={control}
        name="currency"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <select
                {...field}
                className=" w-full max-w-xs rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.value.toUpperCase()} — {c.label}
                  </option>
                ))}
              </select>
            </FormControl>
          </FormItem>
        )}
      />
    </Section>
  )
}

// ─── Section: Line Items ──────────────────────────────────────────────────────

const InvoiceItemsSection = ({
  organization,
  onNewProduct,
}: {
  organization: schemas['Organization']
  onNewProduct: () => void
}) => {
  const { control, setValue } = useFormContext<InvoiceFormValues>()
  const { fields, append, remove } = useFieldArray({ control, name: 'line_items' })
  const currency = useWatch<InvoiceFormValues, 'currency'>({ name: 'currency' })

  const [productQuery, setProductQuery] = useState('')
  const { data: productsData, isLoading: isLoadingProducts } = useProducts(
    organization.id,
    { query: productQuery || undefined },
  )
  const products = useMemo(() => productsData?.items ?? [], [productsData])

  return (
    <Section compact title="Items" description="Add products from your catalog or type a custom description">
      <div className="flex w-full flex-col gap-y-6">
        {fields.map((field, index) => (
          <div key={field.id} className="flex flex-col gap-y-3">
            <Combobox
              items={products}
              value={null}
              selectedItem={null}
              onChange={(productId) => {
                if (!productId) return
                const product = products.find((p) => p.id === productId)
                if (!product) return
                const priceCents = getPriceForCurrency(product, currency)
                setValue(`line_items.${index}.description`, product.name)
                setValue(
                  `line_items.${index}.unit_amount`,
                  priceCents > 0 ? (priceCents / 100).toString() : '',
                )
              }}
              onQueryChange={setProductQuery}
              getItemValue={(p) => p.id}
              getItemLabel={(p) => p.name}
              renderItem={(p) => (
                <div className="flex flex-col">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-gray-500">
                    {(() => {
                      const cents = getPriceForCurrency(p, currency)
                      return cents > 0
                        ? `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`
                        : 'Custom price'
                    })()}
                  </span>
                </div>
              )}
              isLoading={isLoadingProducts}
              placeholder="Select a product…"
              searchPlaceholder="Search products…"
              emptyLabel="No products found"
            />

            <div className="grid grid-cols-[1fr_80px_120px_32px] items-start gap-x-3">
              <FormField
                control={control}
                name={`line_items.${index}.description`}
                rules={{ required: 'Description is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} placeholder="Description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`line_items.${index}.quantity`}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} type="number" min={1} className="text-center" placeholder="1" />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`line_items.${index}.unit_amount`}
                rules={{ required: 'Amount is required' }}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} type="number" min={0} step={0.01} className="text-right" placeholder="0.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <button
                type="button"
                onClick={() => remove(index)}
                disabled={fields.length <= 1}
                className={twMerge(
                  'mt-2 text-gray-400 transition-colors hover:text-red-500',
                  fields.length <= 1 && 'pointer-events-none opacity-30',
                )}
              >
                <RemoveCircleOutlineOutlined fontSize="small" />
              </button>
            </div>
          </div>
        ))}

        <div className="flex flex-row items-center gap-x-4">
          <button
            type="button"
            onClick={() => append({ description: '', quantity: 1, unit_amount: '' })}
            className="flex items-center gap-x-1 text-sm text-blue-500 hover:text-blue-600"
          >
            <AddOutlined fontSize="small" />
            Add item
          </button>
          <button
            type="button"
            onClick={onNewProduct}
            className="flex items-center gap-x-1 text-sm text-blue-500 hover:text-blue-600"
          >
            <AddOutlined fontSize="small" />
            New product
          </button>
        </div>
      </div>
    </Section>
  )
}

// ─── Section: Discount ────────────────────────────────────────────────────────

const InvoiceDiscountSection = ({
  organization,
  selectedDiscount,
  onSelectDiscount,
  onNewDiscount,
}: {
  organization: schemas['Organization']
  selectedDiscount: schemas['Discount'] | null
  onSelectDiscount: (discount: schemas['Discount'] | null) => void
  onNewDiscount: () => void
}) => {
  const [discountQuery, setDiscountQuery] = useState('')
  const { data: discountsData, isLoading: isLoadingDiscounts } = useDiscounts(
    organization.id,
    { query: discountQuery || undefined },
  )
  const discounts = useMemo(() => discountsData?.items ?? [], [discountsData])

  return (
    <Section compact title="Discount" description="Optionally apply a discount from your catalog">
      <div className="flex w-full flex-col gap-y-4">
        <Combobox
          items={discounts}
          value={selectedDiscount?.id ?? null}
          selectedItem={selectedDiscount}
          onChange={(id) => {
            if (!id) { onSelectDiscount(null); return }
            onSelectDiscount(discounts.find((d) => d.id === id) ?? null)
          }}
          onQueryChange={setDiscountQuery}
          getItemValue={(d) => d.id}
          getItemLabel={(d) => d.name}
          renderItem={(d) => (
            <div className="flex flex-col">
              <span className="font-medium">{d.name}</span>
              <span className="text-xs text-gray-500">
                {d.type === 'percentage'
                  ? `${((d as any).basis_points ?? 0) / 100}% off`
                  : `${((d as any).amount ?? 0) / 100} ${(d as any).currency?.toUpperCase() ?? ''} off`}
              </span>
            </div>
          )}
          isLoading={isLoadingDiscounts}
          placeholder="Select a discount"
          searchPlaceholder="Search discounts…"
          emptyLabel="No discounts found"
        />
        <button
          type="button"
          onClick={onNewDiscount}
          className="flex w-fit items-center gap-x-1 text-sm text-blue-500 hover:text-blue-600"
        >
          <AddOutlined fontSize="small" />
          New discount
        </button>
      </div>
    </Section>
  )
}

// ─── Section: Payment Link ────────────────────────────────────────────────────

const InvoicePaymentLinkSection = ({
  organization,
  selectedCheckoutLink,
  onSelectCheckoutLink,
  onNewCheckoutLink,
}: {
  organization: schemas['Organization']
  selectedCheckoutLink: schemas['CheckoutLink'] | null
  onSelectCheckoutLink: (link: schemas['CheckoutLink'] | null) => void
  onNewCheckoutLink: () => void
}) => {
  const [linkQuery, setLinkQuery] = useState('')
  const { data: linksData, isLoading: isLoadingLinks } = useCheckoutLinks(organization.id)
  const links = useMemo(
    () =>
      (linksData?.pages.flatMap((p) => p.items) ?? []).filter(
        (l) =>
          !linkQuery ||
          (l.label ?? '').toLowerCase().includes(linkQuery.toLowerCase()),
      ),
    [linksData, linkQuery],
  )

  const invoiceCurrency = useWatch<InvoiceFormValues, 'currency'>({ name: 'currency' })

  const linkCurrencies = useMemo(() => {
    if (!selectedCheckoutLink) return new Set<string>()
    return new Set(
      selectedCheckoutLink.products.flatMap((p) =>
        p.prices.flatMap((price) =>
          'price_currency' in price && price.price_currency
            ? [price.price_currency as string]
            : [],
        ),
      ),
    )
  }, [selectedCheckoutLink])

  const hasCurrencyMismatch =
    selectedCheckoutLink !== null &&
    linkCurrencies.size > 0 &&
    !linkCurrencies.has(invoiceCurrency.toLowerCase())

  return (
    <Section
      compact
      title="Payment Link"
      description="Attach a checkout link so customers can pay directly from the invoice."
    >
      <div className="flex w-full flex-col gap-y-4">
        <Combobox
          items={links}
          value={selectedCheckoutLink?.id ?? null}
          selectedItem={selectedCheckoutLink}
          onChange={(id) => {
            if (!id) { onSelectCheckoutLink(null); return }
            onSelectCheckoutLink(links.find((l) => l.id === id) ?? null)
          }}
          onQueryChange={setLinkQuery}
          getItemValue={(l) => l.id}
          getItemLabel={(l) => l.label ?? l.url}
          renderItem={(l) => (
            <div className="flex flex-col">
              <span className="font-medium">{l.label ?? 'Unlabeled'}</span>
              <span className="truncate text-xs text-gray-500">{l.url}</span>
            </div>
          )}
          isLoading={isLoadingLinks}
          placeholder="Select a checkout link (optional)"
          searchPlaceholder="Search checkout links…"
          emptyLabel="No checkout links found"
        />

        {selectedCheckoutLink && (
          <div className=" flex items-center gap-x-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2.5">
            <span className="flex-1 truncate font-mono text-xs text-gray-500">
              {selectedCheckoutLink.url}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(selectedCheckoutLink.url)
                toast({ title: 'Copied to clipboard' })
              }}
              className="shrink-0 text-xs text-blue-500 hover:text-blue-600"
            >
              Copy
            </button>
          </div>
        )}

        {hasCurrencyMismatch && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ">
            Currency mismatch: the invoice is in{' '}
            <strong>{invoiceCurrency.toUpperCase()}</strong> but this checkout
            link is in{' '}
            <strong>{[...linkCurrencies].map((c) => c.toUpperCase()).join(' / ')}</strong>.
            The customer will be charged in the checkout link&apos;s currency,
            which may be confusing. Please select a matching checkout link or
            change the invoice currency.
          </p>
        )}

        <button
          type="button"
          onClick={onNewCheckoutLink}
          className="flex w-fit items-center gap-x-1 text-sm text-blue-500 hover:text-blue-600"
        >
          <AddOutlined fontSize="small" />
          New checkout link
        </button>
      </div>
    </Section>
  )
}

// ─── Section: Details ─────────────────────────────────────────────────────────

const InvoiceDetailsSection = () => {
  const { control, setValue } = useFormContext<InvoiceFormValues>()

  const NET_OPTIONS = [
    { label: 'Net 7', days: 7 },
    { label: 'Net 15', days: 15 },
    { label: 'Net 30', days: 30 },
    { label: 'Net 60', days: 60 },
  ]

  return (
    <Section compact title="Details" description="Due date, notes, and references">
      <div className="flex w-full flex-col gap-y-6">
        <FormField
          control={control}
          name="due_date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Payment due</FormLabel>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {NET_OPTIONS.map((opt) => (
                  <Button
                    key={opt.label}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setValue('due_date', format(addDays(new Date(), opt.days), 'yyyy-MM-dd'))
                    }
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
              <FormControl>
                <Input {...field} type="date" />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="memo"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Memo</FormLabel>
              <FormControl>
                <TextArea
                  {...field}
                  rows={3}
                  placeholder="Add a note visible on the invoice…"
                  className="resize-none rounded-2xl"
                />
              </FormControl>
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={control}
            name="po_number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PO Number</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Purchase order number" />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={control}
            name="on_behalf_of_label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>On behalf of</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Leave blank to use your organization name"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </div>
    </Section>
  )
}

// ─── Hook: useInvoiceForm ─────────────────────────────────────────────────────

export function useInvoiceForm(
  organization: schemas['Organization'],
  onClose?: (invoiceId?: string) => void,
  displayOptions?: { showLogo: boolean; showMorAttribution: boolean },
) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [selectedDiscount, setSelectedDiscount] =
    useState<schemas['Discount'] | null>(null)
  const [selectedCheckoutLink, setSelectedCheckoutLink] =
    useState<schemas['CheckoutLink'] | null>(null)

  const createInvoice = useCreateClientInvoice(organization.id)

  const form = useForm<InvoiceFormValues>({
    defaultValues: {
      customer_id: '',
      currency: organization.default_presentment_currency ?? 'usd',
      line_items: [{ description: '', quantity: 1, unit_amount: '' }],
      due_date: '',
      memo: '',
      po_number: '',
      on_behalf_of_label: '',
      billing_line1: '',
      billing_line2: '',
      billing_city: '',
      billing_state: '',
      billing_postal_code: '',
      billing_country: '',
    },
  })

  const onSubmit = useCallback(
    async (values: InvoiceFormValues) => {
      if (!values.customer_id) {
        form.setError('customer_id', { message: 'Please select a customer' })
        return
      }

      if (selectedCheckoutLink) {
        const linkCurrencies = new Set(
          selectedCheckoutLink.products.flatMap((p) =>
            p.prices.flatMap((price) =>
              'price_currency' in price && price.price_currency
                ? [price.price_currency as string]
                : [],
            ),
          ),
        )
        if (linkCurrencies.size > 0 && !linkCurrencies.has(values.currency.toLowerCase())) {
          toast({
            title: 'Currency mismatch',
            description: `The invoice currency (${values.currency.toUpperCase()}) does not match the checkout link currency (${[...linkCurrencies].map((c) => c.toUpperCase()).join(' / ')}). Please fix this before sending.`,
          })
          return
        }
      }

      setIsSubmitting(true)
      try {
        const hasAddress =
          values.billing_line1 || values.billing_city || values.billing_country
        if (hasAddress && values.customer_id) {
          await (api as any).PATCH('/v1/customers/{id}', {
            params: { path: { id: values.customer_id } },
            body: {
              billing_address: {
                line1: values.billing_line1 || null,
                line2: values.billing_line2 || null,
                city: values.billing_city || null,
                state: values.billing_state || null,
                postal_code: values.billing_postal_code || null,
                country: values.billing_country || null,
              },
            },
          })
        }

        const lineItemsCents = values.line_items.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity) || 1,
          unit_amount: Math.round((parseFloat(item.unit_amount) || 0) * 100),
        }))

        const subtotalCents = lineItemsCents.reduce(
          (sum, item) => sum + item.unit_amount * item.quantity,
          0,
        )
        const discountCents = selectedDiscount
          ? computeDiscountCents(selectedDiscount, subtotalCents)
          : 0

        const body: ClientInvoiceCreate = {
          customer_id: values.customer_id,
          currency: values.currency,
          line_items: lineItemsCents,
          due_date: values.due_date || null,
          memo: values.memo || null,
          po_number: values.po_number || null,
          on_behalf_of_label: values.on_behalf_of_label || null,
          discount_amount: discountCents,
          discount_label: selectedDiscount?.name ?? null,
          include_payment_link: !!selectedCheckoutLink,
          show_logo: displayOptions?.showLogo ?? true,
          show_mor_attribution: displayOptions?.showMorAttribution ?? true,
          user_metadata: selectedCheckoutLink
            ? {
                checkout_link_url: selectedCheckoutLink.url,
                checkout_link_id: selectedCheckoutLink.id,
              }
            : null,
        }

        const invoice = await createInvoice.mutateAsync(body)
        toast({ title: 'Invoice created' })

        if (onClose) {
          onClose(invoice.id)
        } else {
          router.push(
            `/dashboard/${organization.slug}/invoices/${invoice.id}`,
          )
        }
      } catch (err: any) {
        toast({
          title: 'Failed to create invoice',
          description: err?.message ?? String(err),
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [organization, selectedDiscount, selectedCheckoutLink, createInvoice, form, router, onClose, displayOptions],
  )

  return {
    form,
    isSubmitting,
    selectedDiscount,
    setSelectedDiscount,
    selectedCheckoutLink,
    setSelectedCheckoutLink,
    onSubmit,
    handleSubmit: form.handleSubmit,
  }
}

// ─── Form Content (sections + modals, no Form wrapper) ───────────────────────

export interface InvoiceFormContentProps {
  organization: schemas['Organization']
  isSubmitting: boolean
  selectedDiscount: schemas['Discount'] | null
  setSelectedDiscount: (d: schemas['Discount'] | null) => void
  selectedCheckoutLink: schemas['CheckoutLink'] | null
  setSelectedCheckoutLink: (l: schemas['CheckoutLink'] | null) => void
  onSubmit: () => void
}

export const InvoiceFormContent = ({
  organization,
  isSubmitting,
  selectedDiscount,
  setSelectedDiscount,
  selectedCheckoutLink,
  setSelectedCheckoutLink,
  onSubmit,
}: InvoiceFormContentProps) => {
  const {
    isShown: isCustomerModalShown,
    show: showCustomerModal,
    hide: hideCustomerModal,
  } = useModal()
  const {
    isShown: isProductModalShown,
    show: showProductModal,
    hide: hideProductModal,
  } = useModal()
  const {
    isShown: isDiscountModalShown,
    show: showDiscountModal,
    hide: hideDiscountModal,
  } = useModal()
  const {
    isShown: isCheckoutLinkModalShown,
    show: showCheckoutLinkModal,
    hide: hideCheckoutLinkModal,
  } = useModal()

  return (
    <>
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit() }}
        className="flex flex-col gap-y-6"
      >
        <div className=" flex flex-col divide-y divide-gray-200">
          <InvoiceCustomerSection
            organization={organization}
            onNewCustomer={showCustomerModal}
          />
          <InvoiceBillingAddressSection />
          <InvoiceCurrencySection />
          <InvoiceItemsSection
            organization={organization}
            onNewProduct={showProductModal}
          />
          <InvoiceDiscountSection
            organization={organization}
            selectedDiscount={selectedDiscount}
            onSelectDiscount={setSelectedDiscount}
            onNewDiscount={showDiscountModal}
          />
          <InvoicePaymentLinkSection
            organization={organization}
            selectedCheckoutLink={selectedCheckoutLink}
            onSelectCheckoutLink={setSelectedCheckoutLink}
            onNewCheckoutLink={showCheckoutLinkModal}
          />
          <InvoiceDetailsSection />
        </div>

        <div className="flex flex-row items-center gap-2 px-6 pb-4">
          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
          >
            Create Invoice
          </Button>
        </div>
      </form>

      <InlineModal
        isShown={isCustomerModalShown}
        hide={hideCustomerModal}
        className="md:w-[540px]"
        modalContent={
          <CreateCustomerModal
            organization={organization}
            onClose={hideCustomerModal}
          />
        }
      />
      <InlineModal
        isShown={isProductModalShown}
        hide={hideProductModal}
        className="md:w-[720px]"
        modalContent={
          <CreateProductPage
            organization={organization}
            panelMode={true}
            onClose={hideProductModal}
          />
        }
      />
      <InlineModal
        isShown={isDiscountModalShown}
        hide={hideDiscountModal}
        className="md:w-[540px]"
        modalContent={
          <CreateDiscountModalContent
            organization={organization}
            onDiscountCreated={(discount) => {
              setSelectedDiscount(discount)
              hideDiscountModal()
            }}
            hideModal={hideDiscountModal}
          />
        }
      />
      <InlineModal
        isShown={isCheckoutLinkModalShown}
        hide={hideCheckoutLinkModal}
        className="md:w-[680px]"
        modalContent={
          <div className="flex h-full flex-col">
            <InlineModalHeader hide={hideCheckoutLinkModal}>
              <span>New Checkout Link</span>
            </InlineModalHeader>
            <div className="flex flex-col gap-8 overflow-y-auto px-8 pb-8">
              <CheckoutLinkForm
                organization={organization}
                onClose={(link) => {
                  setSelectedCheckoutLink(link)
                  hideCheckoutLinkModal()
                }}
              />
            </div>
          </div>
        }
      />
    </>
  )
}

// ─── Self-contained Form (wraps in Form provider) ────────────────────────────

export interface InvoiceFormProps {
  organization: schemas['Organization']
  onClose?: (invoiceId?: string) => void
}

const InvoiceForm = ({
  organization,
  onClose,
}: InvoiceFormProps) => {
  const {
    form,
    isSubmitting,
    selectedDiscount,
    setSelectedDiscount,
    selectedCheckoutLink,
    setSelectedCheckoutLink,
    onSubmit,
    handleSubmit,
  } = useInvoiceForm(organization, onClose)

  return (
    <Form {...form}>
      <InvoiceFormContent
        organization={organization}
        isSubmitting={isSubmitting}
        selectedDiscount={selectedDiscount}
        setSelectedDiscount={setSelectedDiscount}
        selectedCheckoutLink={selectedCheckoutLink}
        setSelectedCheckoutLink={setSelectedCheckoutLink}
        onSubmit={handleSubmit(onSubmit)}
      />
    </Form>
  )
}

export default InvoiceForm
