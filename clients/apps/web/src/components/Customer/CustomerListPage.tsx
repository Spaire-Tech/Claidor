'use client'

import { CreateCustomerModal } from '@/components/Customer/CreateCustomerModal'
import { CustomerDetailPanel } from '@/components/Customer/CustomerDetailPanel'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { InlineModal } from '@/components/Modal/InlineModal'
import { useModal } from '@/components/Modal/useModal'
import Spinner from '@/components/Shared/Spinner'
import { useCustomers } from '@/hooks/queries'
import { useInViewport } from '@/hooks/utils'
import { getServerURL } from '@/utils/api'
import AddOutlined from '@mui/icons-material/AddOutlined'
import ArrowDownward from '@mui/icons-material/ArrowDownward'
import ArrowUpward from '@mui/icons-material/ArrowUpward'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Avatar from '@spaire/ui/components/atoms/Avatar'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { ShadowBoxOnMd } from '@spaire/ui/components/atoms/ShadowBox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import { parseAsString, parseAsStringLiteral, useQueryState } from 'nuqs'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface CustomerListPageProps {
  organization: schemas['Organization']
}

export const CustomerListPage = ({ organization }: CustomerListPageProps) => {
  const [sorting, setSorting] = useQueryState(
    'sorting',
    parseAsStringLiteral([
      '-created_at',
      'email',
      'created_at',
      '-email',
      'name',
      '-name',
    ] as const).withDefault('-created_at'),
  )
  const [query, setQuery] = useQueryState('query', parseAsString)

  const { data, fetchNextPage, hasNextPage } = useCustomers(organization.id, {
    query: query ?? undefined,
    sorting: [sorting],
  })

  const customers = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data],
  )

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null)

  const {
    show: showCreateModal,
    hide: hideCreateModal,
    isShown: isCreateModalOpen,
  } = useModal()

  const { ref: loadingRef, inViewport } = useInViewport<HTMLDivElement>()

  useEffect(() => {
    if (inViewport && hasNextPage) {
      fetchNextPage()
    }
  }, [inViewport, hasNextPage, fetchNextPage])

  const onExport = useCallback(() => {
    const url = new URL(
      `${getServerURL()}/v1/customers/export?organization_id=${organization.id}`,
    )
    window.open(url, '_blank')
  }, [organization.id])

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-6">
        {customers.length > 0 ? (
          <>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-row items-center gap-3">
                <Input
                  className="w-full md:max-w-64"
                  preSlot={<Search fontSize="small" />}
                  placeholder="Search customers"
                  value={query ?? ''}
                  onChange={(e) => setQuery(e.target.value || null)}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() =>
                    setSorting(
                      sorting === '-created_at' ? 'created_at' : '-created_at',
                    )
                  }
                >
                  {sorting === 'created_at' ? (
                    <ArrowUpward fontSize="small" />
                  ) : (
                    <ArrowDownward fontSize="small" />
                  )}
                </Button>
              </div>
              <div className="flex flex-row items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="secondary" size="sm">
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onExport}>
                      Export customers
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={showCreateModal}>
                  <AddOutlined className="h-4 w-4" />
                  <span>Add customer</span>
                </Button>
              </div>
            </div>
            <div className=" flex flex-col divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  className=" flex flex-row items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-gray-50"
                  onClick={() => setSelectedCustomerId(customer.id)}
                >
                  <Avatar
                    className="h-9 w-9 shrink-0"
                    avatar_url={customer.avatar_url}
                    name={customer.name || customer.email}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">
                      {customer.name || customer.email}
                    </span>
                    {customer.name && (
                      <span className=" truncate text-xs text-gray-500">
                        {customer.email}
                      </span>
                    )}
                  </div>
                  <span className=" shrink-0 text-xs text-gray-400">
                    {new Date(customer.created_at).toLocaleDateString()}
                  </span>
                </button>
              ))}
              {hasNextPage && (
                <div
                  ref={loadingRef}
                  className="flex w-full items-center justify-center py-6"
                >
                  <Spinner />
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
            <div style={{ isolation: 'isolate' }} className="relative h-[88px] w-[88px]">
              <div style={{ mixBlendMode: 'multiply' }} className="absolute top-0 left-0 h-14 w-14 rounded-full bg-cyan-300" />
              <div style={{ mixBlendMode: 'multiply' }} className="absolute bottom-0 right-0 h-14 w-14 rounded-full bg-blue-300" />
            </div>
            <div className="flex max-w-lg flex-col gap-3">
              <h2 className="text-3xl font-bold text-gray-900">
                Your customers, all in one place
              </h2>
              <p className="text-gray-500">
                Customers are added automatically at checkout, or you can add
                them manually.
              </p>
            </div>
            <Button size="lg" onClick={showCreateModal} className="gap-2">
              Add Customer
            </Button>
          </div>
        )}
      </div>

      <InlineModal
        isShown={isCreateModalOpen}
        hide={hideCreateModal}
        className="md:w-[680px]"
        modalContent={
          <CreateCustomerModal
            organization={organization}
            onClose={hideCreateModal}
          />
        }
      />

      <InlineModal
        isShown={!!selectedCustomerId}
        hide={() => setSelectedCustomerId(null)}
        className="md:w-[720px]"
        modalContent={
          selectedCustomerId ? (
            <CustomerDetailPanel
              customerId={selectedCustomerId}
              organization={organization}
              onClose={() => setSelectedCustomerId(null)}
            />
          ) : (
            <div />
          )
        }
      />
    </DashboardBody>
  )
}
