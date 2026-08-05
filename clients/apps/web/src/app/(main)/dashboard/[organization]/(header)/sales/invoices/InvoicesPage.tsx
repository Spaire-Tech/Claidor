'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import {
  ClientInvoice,
  useClientInvoices,
} from '@/hooks/queries/client_invoices'
import { useCustomer } from '@/hooks/queries/customers'
import {
  DataTablePaginationState,
  DataTableSortingState,
  getAPIParams,
  serializeSearchParams,
} from '@/utils/datatable'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import {
  DataTable,
  DataTableColumnDef,
  DataTableColumnHeader,
} from '@spaire/ui/components/atoms/DataTable'
import FormattedDateTime from '@spaire/ui/components/atoms/FormattedDateTime'
import Input from '@spaire/ui/components/atoms/Input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import ShadowBoxOnMd from '@spaire/ui/components/atoms/ShadowBoxOnMd'
import { formatCurrency } from '@spaire/currency'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useMemo, useState } from 'react'
import InvoicePage from './[id]/InvoicePage'

const statusColors: Record<string, string> = {
  draft:
    'bg-yellow-100 text-yellow-800 ',
  open: 'bg-blue-100 text-blue-800 ',
  paid: 'bg-green-100 text-green-800 ',
  void: 'bg-gray-100 text-gray-500 ',
  uncollectible:
    'bg-red-100 text-red-800 ',
}

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${statusColors[status] ?? ''}`}
  >
    {status}
  </span>
)

const CustomerCell = ({ customerId }: { customerId: string }) => {
  const { data: customer } = useCustomer(customerId)
  if (!customer) {
    return (
      <span className="font-mono text-xs text-gray-400">
        {customerId.slice(0, 8)}…
      </span>
    )
  }
  return (
    <span className="text-sm">
      {customer.name || customer.email}
    </span>
  )
}

interface InvoicesPageProps {
  organization: schemas['Organization']
  pagination: DataTablePaginationState
  sorting: DataTableSortingState
}

const InvoicesPage: React.FC<InvoicesPageProps> = ({
  organization,
  pagination,
  sorting,
}) => {
  const router = useRouter()
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortValue, setSortValue] = useState('-created_at')

  const invoicesHook = useClientInvoices(
    organization.id,
    getAPIParams(pagination, sorting),
  )

  const allInvoices = invoicesHook.data?.items ?? []

  const invoices = useMemo(() => {
    let result = allInvoices
    if (query) {
      const q = query.toLowerCase()
      result = result.filter(
        (i) =>
          i.id.toLowerCase().includes(q) ||
          (i.number ?? '').toLowerCase().includes(q),
      )
    }
    if (statusFilter !== 'all') {
      result = result.filter((i) => i.status === statusFilter)
    }
    if (sortValue === '-created_at') result = [...result].sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (sortValue === 'created_at') result = [...result].sort((a, b) => a.created_at.localeCompare(b.created_at))
    if (sortValue === '-total_amount') result = [...result].sort((a, b) => b.total_amount - a.total_amount)
    if (sortValue === 'total_amount') result = [...result].sort((a, b) => a.total_amount - b.total_amount)
    return result
  }, [allInvoices, query, statusFilter, sortValue])

  const rowCount = invoicesHook.data?.pagination.total_count ?? 0
  const pageCount = invoicesHook.data?.pagination.max_page ?? 1

  const setPagination = (
    updaterOrValue:
      | DataTablePaginationState
      | ((old: DataTablePaginationState) => DataTablePaginationState),
  ) => {
    const updated =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(pagination)
        : updaterOrValue
    router.push(
      `/dashboard/${organization.slug}/invoices?${serializeSearchParams(updated, sorting)}`,
    )
  }

  const setSorting = (
    updaterOrValue:
      | DataTableSortingState
      | ((old: DataTableSortingState) => DataTableSortingState),
  ) => {
    const updated =
      typeof updaterOrValue === 'function'
        ? updaterOrValue(sorting)
        : updaterOrValue
    router.push(
      `/dashboard/${organization.slug}/invoices?${serializeSearchParams(pagination, updated)}`,
    )
  }

  const columns: DataTableColumnDef<ClientInvoice>[] = [
    {
      accessorKey: 'number',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Invoice #" />
      ),
      cell: ({ row: { original: invoice } }) => (
        <span className="font-mono text-xs text-gray-500">
          {invoice.number ?? invoice.id}
        </span>
      ),
    },
    {
      accessorKey: 'customer_id',
      enableSorting: false,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Customer" />
      ),
      cell: ({ row: { original: invoice } }) => (
        <CustomerCell customerId={invoice.customer_id} />
      ),
    },
    {
      accessorKey: 'total_amount',
      enableSorting: true,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Amount" />
      ),
      cell: ({ row: { original: invoice } }) => (
        <span className="font-medium">
          {formatCurrency('compact')(invoice.total_amount, invoice.currency)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      enableSorting: true,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Status" />
      ),
      cell: ({ row: { original: invoice } }) => (
        <StatusBadge status={invoice.status} />
      ),
    },
    {
      accessorKey: 'due_date',
      enableSorting: true,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Due Date" />
      ),
      cell: ({ row: { original: invoice } }) =>
        invoice.due_date ? (
          <FormattedDateTime datetime={invoice.due_date} />
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      accessorKey: 'created_at',
      enableSorting: true,
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="Created" />
      ),
      cell: (props) => (
        <FormattedDateTime datetime={props.getValue() as string} />
      ),
    },
  ]

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        {!invoicesHook.isLoading && invoices.length === 0 ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
            <div style={{ isolation: 'isolate' }} className="relative h-[88px] w-[88px]">
              <div style={{ mixBlendMode: 'multiply' }} className="absolute top-2 left-0 h-11 w-16 rounded-2xl bg-amber-300" />
              <div style={{ mixBlendMode: 'multiply' }} className="absolute bottom-0 right-0 h-14 w-14 rounded-full bg-emerald-300" />
            </div>
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-3xl font-bold text-gray-900">
                Create and send invoices in minutes
              </h2>
              <p className="text-gray-500">
                Send invoices with a link to pay online. Accept cards, bank
                transfers, and more.
              </p>
            </div>
            <Link href={`/dashboard/${organization.slug}/sales/invoices/new`}>
              <Button size="lg" className="gap-2">
                Create Invoice
              </Button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <Input
                  className="w-full md:max-w-64"
                  preSlot={<Search fontSize="small" />}
                  placeholder="Search invoices"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:max-w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="void">Void</SelectItem>
                    <SelectItem value="uncollectible">Uncollectible</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortValue} onValueChange={setSortValue}>
                  <SelectTrigger className="w-full md:max-w-fit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="-created_at">Newest</SelectItem>
                    <SelectItem value="created_at">Oldest</SelectItem>
                    <SelectItem value="-total_amount">Amount: High to Low</SelectItem>
                    <SelectItem value="total_amount">Amount: Low to High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Link href={`/dashboard/${organization.slug}/sales/invoices/new`}>
                <Button>
                  <AddOutlined fontSize="small" />
                  New Invoice
                </Button>
              </Link>
            </div>
            <DataTable
              columns={columns}
              data={invoices}
              rowCount={rowCount}
              pageCount={pageCount}
              pagination={pagination}
              onPaginationChange={setPagination}
              sorting={sorting}
              onSortingChange={setSorting}
              isLoading={invoicesHook.isLoading}
              onRowClick={(row) => setSelectedInvoiceId(row.original.id)}
            />
          </>
        )}
      </div>
      <InlineModal
        isShown={!!selectedInvoiceId}
        hide={() => setSelectedInvoiceId(null)}
        className="md:w-[720px]"
        modalContent={
          selectedInvoiceId ? (
            <InvoicePage
              organization={organization}
              invoiceId={selectedInvoiceId}
              panelMode
              onClose={() => setSelectedInvoiceId(null)}
            />
          ) : (
            <div />
          )
        }
      />
    </DashboardBody>
  )
}

export default InvoicesPage
