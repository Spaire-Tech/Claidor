'use client'

import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import Button from '@spaire/ui/components/atoms/Button'
import { DataTable } from '@spaire/ui/components/atoms/DataTable'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@spaire/ui/components/atoms/DropdownMenu'
import { Status } from '@spaire/ui/components/atoms/Status'
import { useState } from 'react'
import { twMerge } from 'tailwind-merge'

const seatStatusToDisplayName = {
  pending: [
    'Pending',
    'bg-yellow-100 text-yellow-500 ',
  ],
  claimed: [
    'Claimed',
    'bg-emerald-100 text-emerald-500 ',
  ],
  revoked: [
    'Revoked',
    'bg-gray-100 text-gray-500 ',
  ],
} as const

interface CustomerSeat {
  id: string
  subscription_id?: string | null
  order_id?: string | null
  status: 'pending' | 'claimed' | 'revoked'
  customer_id?: string | null
  customer_email?: string | null
  claimed_at?: string | null
  revoked_at?: string | null
  created_at: string
  seat_metadata?: Record<string, any> | null
}

interface SeatManagementTableProps {
  seats: CustomerSeat[]
  onRevokeSeat: (seatId: string) => Promise<void>
  onResendInvitation: (seatId: string) => Promise<void>
}

export const SeatManagementTable = ({
  seats,
  onRevokeSeat,
  onResendInvitation,
}: SeatManagementTableProps) => {
  const [loadingSeats, setLoadingSeats] = useState<Set<string>>(new Set())

  const handleRevoke = async (seatId: string) => {
    setLoadingSeats((prev) => new Set([...prev, seatId]))
    try {
      await onRevokeSeat(seatId)
    } finally {
      setLoadingSeats((prev) => {
        const next = new Set(prev)
        next.delete(seatId)
        return next
      })
    }
  }

  const handleResend = async (seatId: string) => {
    setLoadingSeats((prev) => new Set([...prev, seatId]))
    try {
      await onResendInvitation(seatId)
    } finally {
      setLoadingSeats((prev) => {
        const next = new Set(prev)
        next.delete(seatId)
        return next
      })
    }
  }

  // Shared between the desktop table cells and the mobile card layout.
  const seatStatusBadge = (seat: CustomerSeat) => {
    const [label, className] = seatStatusToDisplayName[seat.status]
    return (
      <Status className={twMerge(className, 'w-fit text-xs')} status={label} />
    )
  }

  const seatActions = (seat: CustomerSeat) => {
    const isLoading = loadingSeats.has(seat.id)

    if (seat.status === 'revoked') {
      return null
    }

    return (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={isLoading}>
            <Button className="h-8 w-8" variant="secondary">
              <MoreVertOutlined fontSize="inherit" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {seat.status === 'pending' && (
              <DropdownMenuItem
                onClick={() => handleResend(seat.id)}
                disabled={isLoading}
              >
                Resend Invitation
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => handleRevoke(seat.id)}
              disabled={isLoading}
            >
              Revoke Seat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <DataTable
      data={seats.sort((a, b) => {
        const order = ['claimed', 'pending', 'revoked']
        return order.indexOf(a.status) - order.indexOf(b.status)
      })}
      isLoading={false}
      columns={[
        {
          accessorKey: 'customer_email',
          header: 'Email',
          cell: ({ row }) => (
            <span className="text-sm">
              {row.original.customer_email || '—'}
            </span>
          ),
        },
        {
          accessorKey: 'status',
          header: 'Status',
          cell: ({ row }) => seatStatusBadge(row.original),
        },
        {
          id: 'actions',
          header: '',
          cell: ({ row }) => seatActions(row.original),
        },
      ]}
      mobileCard={(row) => {
        const seat = row.original
        return (
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="truncate text-sm">
                {seat.customer_email || '—'}
              </span>
              {seatStatusBadge(seat)}
            </div>
            {seatActions(seat)}
          </div>
        )
      }}
    />
  )
}
