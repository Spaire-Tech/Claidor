'use client'

import {
  Cell,
  ColumnDef,
  OnChangeFn,
  PaginationState,
  Row,
  RowSelectionState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  useReactTable,
} from '@tanstack/react-table'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import React from 'react'
import { twMerge } from 'tailwind-merge'
import { DataTablePagination } from './DataTablePagination'

export interface ReactQueryLoading {
  isFetching: boolean
  isFetched: boolean
  isLoading: boolean
  status: string
  fetchStatus: string
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  rowCount?: number
  pageCount?: number
  pagination?: PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  sorting?: SortingState
  onSortingChange?: OnChangeFn<SortingState>
  getSubRows?: (row: TData) => TData[] | undefined
  className?: string
  wrapperClassName?: string
  headerClassName?: string
  isLoading: boolean | ReactQueryLoading
  getCellColSpan?: (cell: Cell<TData, unknown>) => number
  getRowId?: (originalRow: TData, index: number, parent?: Row<TData>) => string
  rowSelection?: RowSelectionState
  enableRowSelection?: boolean
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  onRowClick?: (row: Row<TData>) => void
  /** Rendered instead of the table below the `md` breakpoint — one card per
   * row, stacked vertically. Dense tables crush or force sideways scrolling
   * on phones; this gives each row a card layout there instead. */
  mobileCard?: (row: Row<TData>) => React.ReactNode
}

export type DataTableColumnDef<TData, TValue = unknown> = ColumnDef<
  TData,
  TValue
>

export type DataTablePaginationState = PaginationState
export type DataTableSortingState = SortingState

const queryIsDisabled = (s: ReactQueryLoading): boolean => {
  if (s.status === 'pending' && s.fetchStatus === 'idle') {
    return true
  }
  return false
}

export function DataTable<TData, TValue>({
  columns,
  data,
  rowCount,
  pageCount,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  getSubRows,
  className,
  wrapperClassName,
  headerClassName,
  isLoading,
  getCellColSpan,
  getRowId,
  rowSelection,
  enableRowSelection,
  onRowSelectionChange,
  onRowClick,
  mobileCard,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
    rowCount,
    pageCount,
    onPaginationChange,
    onSortingChange,
    getSubRows,
    getExpandedRowModel: getExpandedRowModel(),
    getRowId,
    enableRowSelection,
    onRowSelectionChange,
    enableMultiRowSelection: false,
    state: {
      pagination,
      sorting,
      rowSelection,
    },
  })

  const calcLoading =
    typeof isLoading === 'boolean'
      ? isLoading
      : (!isLoading.isFetched || isLoading.isLoading) &&
        !queryIsDisabled(isLoading)

  return (
    <div className={twMerge('flex flex-col gap-6', className)}>
      <div
        className={twMerge(
          ' overflow-x-auto rounded-2xl border border-gray-200',
          mobileCard ? 'max-md:hidden' : '',
          wrapperClassName,
        )}
      >
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow
                key={headerGroup.id}
                className={twMerge(
                  ' bg-gray-50',
                  headerClassName,
                )}
              >
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead
                      key={header.id}
                      style={{ width: header.column.getSize() }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {calcLoading ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Loading...
                </TableCell>
              </TableRow>
            ) : (
              <>
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={
                        enableRowSelection || onRowClick
                          ? row.getCanSelect()
                            ? 'cursor-pointer'
                            : ''
                          : undefined
                      }
                      data-state={
                        enableRowSelection
                          ? row.getIsSelected()
                            ? 'selected'
                            : undefined
                          : undefined
                      }
                      onClick={
                        onRowClick
                          ? () => onRowClick(row)
                          : enableRowSelection
                            ? row.getToggleSelectedHandler()
                            : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => {
                        const colSpan = getCellColSpan
                          ? getCellColSpan(cell)
                          : 1

                        return (
                          <React.Fragment key={cell.id}>
                            {colSpan ? (
                              <TableCell
                                colSpan={colSpan}
                                style={{ width: cell.column.getSize() }}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ) : null}
                          </React.Fragment>
                        )
                      })}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No Results
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>
      {mobileCard ? (
        <div className="flex flex-col gap-3 md:hidden">
          {calcLoading ? (
            <div className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-gray-200 p-4"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {mobileCard(row)}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              No Results
            </div>
          )}
        </div>
      ) : null}
      {pagination ? <DataTablePagination table={table} /> : null}
    </div>
  )
}
