'use client'

import { useCustomerCustomerMeters } from '@/hooks/queries'
import Search from '@mui/icons-material/Search'
import { Client } from '@spaire/client'
import { DataTable } from '@spaire/ui/components/atoms/DataTable'
import Input from '@spaire/ui/components/atoms/Input'
import { Tabs, TabsContent } from '@spaire/ui/components/atoms/Tabs'
import { useMemo, useState } from 'react'
import FormattedUnits from '../Meter/FormattedUnits'
export interface CustomerUsageProps {
  api: Client
}

// Bind the ring to how much of the credited allowance has been consumed.
const MeterRing = ({
  consumed,
  credited,
}: {
  consumed: number
  credited: number
}) => {
  const ratio =
    credited > 0 ? Math.max(0, Math.min(1, consumed / credited)) : 0
  const deg = Math.round(ratio * 360)
  return (
    <div
      className="h-3 w-3 rounded-full"
      title={`${Math.round(ratio * 100)}% of credited units consumed`}
      style={{
        background: `conic-gradient(var(--sp-accent, #0066cc) ${deg}deg, var(--sp-line, #e5e7eb) ${deg}deg)`,
        transition: 'all 0.3s ease',
      }}
    />
  )
}

export const CustomerUsage = ({ api }: CustomerUsageProps) => {
  const [query, setQuery] = useState<string | null>(null)
  const { data, isLoading } = useCustomerCustomerMeters(api, { query })
  const customerMeters = useMemo(() => data?.items ?? [], [data])

  return (
    <div className="flex flex-col">
      <Tabs defaultValue="meters">
        <div className="flex flex-row items-center justify-between gap-x-12">
          <h3 className="text-xl md:text-2xl">Usage</h3>
        </div>
        <TabsContent className="flex flex-col gap-y-12 pt-4" value="meters">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-4 lg:flex-row">
              <div className="w-full lg:w-1/3">
                <Input
                  className="w-full bg-white shadow-xs"
                  preSlot={<Search fontSize="inherit" />}
                  placeholder="Search Usage Meter"
                  value={query || ''}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <h3 className="text-lg md:text-xl">Overview</h3>
            <DataTable
              isLoading={isLoading}
              columns={[
                {
                  header: 'Name',
                  accessorKey: 'meter_name',
                  cell: ({
                    row: {
                      original: { meter, consumed_units, credited_units },
                    },
                  }) => (
                    <div className="flex items-center gap-2">
                      <MeterRing
                        consumed={consumed_units}
                        credited={credited_units}
                      />
                      <span>{meter.name}</span>
                    </div>
                  ),
                },
                {
                  header: 'Consumed',
                  accessorKey: 'consumed_units',
                  cell: ({
                    row: {
                      original: { consumed_units },
                    },
                  }) => {
                    return <FormattedUnits value={consumed_units} />
                  },
                },
                {
                  header: 'Credited',
                  accessorKey: 'credited_units',
                  cell: ({
                    row: {
                      original: { credited_units },
                    },
                  }) => {
                    return <FormattedUnits value={credited_units} />
                  },
                },
                {
                  header: 'Balance',
                  accessorKey: 'balance',
                  cell: ({
                    row: {
                      original: { balance },
                    },
                  }) => {
                    return <FormattedUnits value={balance} />
                  },
                },
              ]}
              data={customerMeters}
              mobileCard={(row) => {
                const { meter, consumed_units, credited_units, balance } =
                  row.original
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <MeterRing
                        consumed={consumed_units}
                        credited={credited_units}
                      />
                      <span className="text-sm font-medium">{meter.name}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-500">Consumed</span>
                        <span className="text-sm">
                          <FormattedUnits value={consumed_units} />
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-500">Credited</span>
                        <span className="text-sm">
                          <FormattedUnits value={credited_units} />
                        </span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-500">Balance</span>
                        <span className="text-sm">
                          <FormattedUnits value={balance} />
                        </span>
                      </div>
                    </div>
                  </div>
                )
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
