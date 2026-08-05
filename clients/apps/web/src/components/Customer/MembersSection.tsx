'use client'

import { useMembers } from '@/hooks/queries/members'
import { useOrganization } from '@/hooks/queries/org'
import { DataTable } from '@spaire/ui/components/atoms/DataTable'
import FormattedDateTime from '@spaire/ui/components/atoms/FormattedDateTime'
import { Status } from '@spaire/ui/components/atoms/Status'
import { useMemo } from 'react'
import { twMerge } from 'tailwind-merge'

const roleDisplayConfig = {
  owner: [
    'Owner',
    'bg-blue-100 text-blue-600 ',
  ],
  billing_manager: [
    'Billing Manager',
    'bg-sky-100 text-sky-600 ',
  ],
  member: [
    'Member',
    'bg-gray-100 text-gray-600 ',
  ],
} as const

interface MembersSectionProps {
  customerId: string
  organizationId: string
  customerType?: 'individual' | 'team'
}

export const MembersSection = ({
  customerId,
  organizationId,
  customerType,
}: MembersSectionProps) => {
  const { data: organization } = useOrganization(
    organizationId,
    !!organizationId,
  )
  const { data: membersData, isLoading } = useMembers(customerId)

  // Only show Members section for team customers when member model is enabled
  const isEnabled =
    organization?.feature_settings?.member_model_enabled &&
    customerType === 'team'

  const members = useMemo(
    () => membersData?.pages.flatMap((page) => page.items) ?? [],
    [membersData],
  )

  if (!isEnabled) {
    return null
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg">Members</h3>
      <DataTable
        data={members}
        columns={[
          {
            header: 'Email',
            accessorKey: 'email',
            cell: ({ row: { original } }) => (
              <span className="text-sm">{original.email}</span>
            ),
          },
          {
            header: 'Name',
            accessorKey: 'name',
            cell: ({ row: { original } }) => (
              <span className="text-sm">{original.name ?? '—'}</span>
            ),
          },
          {
            header: 'Role',
            accessorKey: 'role',
            cell: ({ row: { original } }) => {
              const [label, className] = roleDisplayConfig[original.role]
              return (
                <Status
                  className={twMerge(className, 'w-fit text-xs')}
                  status={label}
                />
              )
            },
          },
          {
            header: 'External ID',
            accessorKey: 'external_id',
            cell: ({ row: { original } }) => (
              <span className=" text-sm text-gray-500">
                {original.external_id ?? '—'}
              </span>
            ),
          },
          {
            header: 'Created',
            accessorKey: 'created_at',
            cell: ({ row: { original } }) => (
              <span className=" text-sm text-gray-500">
                <FormattedDateTime datetime={original.created_at} />
              </span>
            ),
          },
        ]}
        isLoading={isLoading}
        className="text-sm"
      />
    </div>
  )
}
