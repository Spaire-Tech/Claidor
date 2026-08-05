'use client'

import { Modal } from '@/components/Modal'
import { useModal } from '@/components/Modal/useModal'
import { FormResource, useDeleteForm, useForms } from '@/hooks/queries/forms'
import { schemas } from '@spaire/client'
import Button from '@spaire/ui/components/atoms/Button'
import { List, ListItem } from '@spaire/ui/components/atoms/List'
import Link from 'next/link'
import { useState } from 'react'
import { DashboardBody } from '../Layout/DashboardLayout'
import { EmbedFormModalContent } from './EmbedFormModal'

const StatusBadge = ({ status }: { status: string }) => (
  <span
    className={
      status === 'published'
        ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
        : 'rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500'
    }
  >
    {status === 'published' ? 'Published' : 'Draft'}
  </span>
)

export const FormsList = ({
  organization,
}: {
  organization: schemas['Organization']
}) => {
  const { data, isLoading } = useForms(organization.id, { limit: 100 })
  const deleteForm = useDeleteForm()
  const forms = data?.items ?? []

  const { isShown, show, hide } = useModal()
  const [embedForm, setEmbedForm] = useState<FormResource | null>(null)

  const newHref = `/dashboard/${organization.slug}/forms/new`

  return (
    <DashboardBody title="Forms">
      <div className="flex flex-col gap-6">
        <div className="flex flex-row items-center justify-between">
          <p className="text-sm text-gray-500">
            Capture emails with a branded form and deliver a lead magnet — no
            checkout required.
          </p>
          <Link href={newHref}>
            <Button>New form</Button>
          </Link>
        </div>

        {isLoading ? (
          <div className="h-32 animate-pulse rounded-xl bg-gray-100" />
        ) : forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <p className="text-gray-500">
              You haven&apos;t created any forms yet.
            </p>
            <Link href={newHref}>
              <Button>Create your first form</Button>
            </Link>
          </div>
        ) : (
          <List>
            {forms.map((form) => (
              <ListItem key={form.id}>
                <div className="flex w-full flex-row items-center justify-between">
                  <Link
                    href={`/dashboard/${organization.slug}/forms/${form.id}/edit`}
                    className="flex min-w-0 flex-col"
                  >
                    <div className="flex flex-row items-center gap-2">
                      <span className="truncate font-medium text-gray-900">
                        {form.title}
                      </span>
                      <StatusBadge status={form.status} />
                    </div>
                    <span className="text-sm text-gray-400">/{form.slug}</span>
                  </Link>
                  <div className="flex flex-row items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEmbedForm(form)
                        show()
                      }}
                    >
                      Embed
                    </Button>
                    <Link
                      href={`/dashboard/${organization.slug}/forms/${form.id}/submissions`}
                    >
                      <Button variant="secondary" size="sm">
                        Submissions
                      </Button>
                    </Link>
                    <Link
                      href={`/dashboard/${organization.slug}/forms/${form.id}/edit`}
                    >
                      <Button variant="secondary" size="sm">
                        Edit
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleteForm.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Delete "${form.title}"? This can't be undone.`,
                          )
                        ) {
                          deleteForm.mutate(form.id)
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </ListItem>
            ))}
          </List>
        )}
      </div>
      <Modal
        title="Embed form"
        isShown={isShown}
        hide={hide}
        modalContent={
          embedForm ? <EmbedFormModalContent form={embedForm} /> : <div />
        }
      />
    </DashboardBody>
  )
}
