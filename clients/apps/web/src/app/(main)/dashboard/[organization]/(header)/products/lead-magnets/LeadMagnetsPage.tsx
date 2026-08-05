'use client'

import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { toast } from '@/components/Toast/use-toast'
import { FormResource, useDeleteForm, useForms } from '@/hooks/queries/forms'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DynamicFormOutlined from '@mui/icons-material/DynamicFormOutlined'
import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined'
import Search from '@mui/icons-material/Search'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import Input from '@spaire/ui/components/atoms/Input'
import { List, ListItem } from '@spaire/ui/components/atoms/List'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@spaire/ui/components/atoms/Select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@spaire/ui/components/ui/dropdown-menu'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

type SortValue = 'name' | '-name' | '-created_at' | 'created_at'

const SORTERS: Record<SortValue, (a: FormResource, b: FormResource) => number> =
  {
    name: (a, b) => a.title.localeCompare(b.title),
    '-name': (a, b) => b.title.localeCompare(a.title),
    '-created_at': (a, b) => b.created_at.localeCompare(a.created_at),
    created_at: (a, b) => a.created_at.localeCompare(b.created_at),
  }

// Cover thumbnail, mirroring the products list (ProductThumbnail) so lead
// magnets read as the same kind of row.
const FormThumbnail = ({ form }: { form: FormResource }) => (
  <div className="hidden h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 md:flex">
    {form.image_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={form.image_url}
        alt={form.title}
        className="h-10 w-10 object-cover"
      />
    ) : (
      <DynamicFormOutlined fontSize="small" className="text-gray-300" />
    )}
  </div>
)

const LeadMagnetRow = ({
  organization,
  form,
}: {
  organization: schemas['Organization']
  form: FormResource
}) => {
  const router = useRouter()
  const deleteForm = useDeleteForm()
  const editHref = `/dashboard/${organization.slug}/forms/${form.id}/edit`
  const submissionsHref = `/dashboard/${organization.slug}/forms/${form.id}/submissions`

  return (
    <ListItem className="flex flex-row items-center justify-between gap-x-6">
      <Link
        href={editHref}
        className="flex min-w-0 grow flex-row items-center gap-x-4 text-sm"
      >
        <FormThumbnail form={form} />
        <span className="truncate">{form.title}</span>
      </Link>
      <div className="flex shrink-0 flex-row items-center gap-x-2">
        <Link href={submissionsHref}>
          <Button size="sm" variant="secondary">
            Submissions
          </Button>
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none" asChild>
            <Button
              className="border-none bg-transparent text-[16px] opacity-50 transition-opacity hover:opacity-100"
              size="icon"
              variant="secondary"
            >
              <MoreVertOutlined fontSize="inherit" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-gray-50 shadow-lg">
            <DropdownMenuItem onClick={() => router.push(editHref)}>
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push(submissionsHref)}>
              View submissions
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onClick={() => {
                if (
                  window.confirm(
                    `Delete "${form.title}"? This can't be undone.`,
                  )
                ) {
                  deleteForm.mutate(form.id, {
                    onSuccess: () =>
                      toast({
                        title: 'Lead magnet deleted',
                        description: `"${form.title}" was removed.`,
                      }),
                  })
                }
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </ListItem>
  )
}

export default function LeadMagnetsPage({
  organization,
}: {
  organization: schemas['Organization']
}) {
  const { data, isLoading } = useForms(organization.id, { limit: 100 })
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortValue>('name')

  const newHref = `/dashboard/${organization.slug}/forms/new`

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = (data?.items ?? []).filter((f) =>
      q ? f.title.toLowerCase().includes(q) : true,
    )
    return [...filtered].sort(SORTERS[sort])
  }, [data, query, sort])

  return (
    <DashboardBody>
      <div className="flex flex-col gap-y-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <Input
              className="w-full md:max-w-64"
              preSlot={<Search fontSize="small" />}
              placeholder="Search Lead Magnets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={sort} onValueChange={(v) => setSort(v as SortValue)}>
              <SelectTrigger className="w-full md:max-w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Name A-Z</SelectItem>
                <SelectItem value="-name">Name Z-A</SelectItem>
                <SelectItem value="-created_at">Newest</SelectItem>
                <SelectItem value="created_at">Oldest</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Link href={newHref}>
            <Button
              wrapperClassNames="gap-x-2 md:w-fit"
              className="w-full md:w-fit"
            >
              <AddOutlined className="h-4 w-4" />
              <span>New</span>
            </Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-gray-500">
              {query
                ? 'No lead magnets match your search.'
                : "You haven't created any lead magnets yet."}
            </p>
            {!query ? (
              <Link href={newHref}>
                <Button>Create your first lead magnet</Button>
              </Link>
            ) : null}
          </div>
        ) : (
          <List size="small">
            {items.map((form) => (
              <LeadMagnetRow
                key={form.id}
                organization={organization}
                form={form}
              />
            ))}
          </List>
        )}
      </div>
    </DashboardBody>
  )
}
