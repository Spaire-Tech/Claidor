'use client'

import { DashboardBody } from '@/components/Claidor/Body'
import AddOutlined from '@mui/icons-material/AddOutlined'
import DescriptionOutlined from '@mui/icons-material/DescriptionOutlined'
import FolderOutlined from '@mui/icons-material/FolderOutlined'
import PeopleOutlined from '@mui/icons-material/PeopleOutlined'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'
import {
  DossierListItem,
  STATUS_LABELS,
  createDossier,
  fetchDossiers,
} from './api'

const LOAD_ERROR = 'Le chargement des dossiers a échoué. Réessayez.'
const CREATE_ERROR = "Le dossier n'a pas pu être créé. Réessayez."

export interface DossiersPageProps {
  organization: string
  organizationId: string
}

const DossiersPage = ({ organization, organizationId }: DossiersPageProps) => {
  const [dossiers, setDossiers] = useState<DossierListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [clientName, setClientName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true)
      fetchDossiers(organizationId, signal)
        .then((rows) => {
          setDossiers(rows)
          setError(null)
        })
        .catch(() => {
          if (!signal?.aborted) setError(LOAD_ERROR)
        })
        .finally(() => {
          if (!signal?.aborted) setLoading(false)
        })
    },
    [organizationId],
  )

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  const submit = async () => {
    if (name.trim().length < 2) return
    setSubmitting(true)
    try {
      await createDossier(organizationId, {
        name: name.trim(),
        client_name: clientName.trim() || undefined,
      })
      setName('')
      setClientName('')
      setCreating(false)
      load()
    } catch {
      setError(CREATE_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardBody
      title="Dossiers"
      wrapperClassName="!max-w-4xl"
      className="!max-w-4xl"
    >
      <div className="flex flex-col gap-y-6">
        <p className="dark:text-polar-500 text-sm text-gray-500">
          Un espace par affaire : ses pièces, ses questions, ses réponses.
          Chaque dossier n&apos;est visible que par les avocats qui y sont
          affectés.
        </p>

        <div className="flex flex-row items-center justify-between">
          <h2 className="text-lg">Vos dossiers</h2>
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            className="dark:bg-polar-700 dark:hover:bg-polar-600 flex flex-row items-center gap-x-1.5 rounded-full bg-gray-100 px-4 py-2 text-sm transition-colors hover:bg-gray-200"
          >
            <AddOutlined fontSize="inherit" />
            Nouveau dossier
          </button>
        </div>

        {creating && (
          <div className="dark:border-polar-700 flex flex-col gap-y-3 rounded-2xl border border-gray-200 p-5">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Recouvrement — BICIS c/ SODICA"
              className="dark:border-polar-600 dark:bg-polar-800 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none"
            />
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Client (facultatif)"
              className="dark:border-polar-600 dark:bg-polar-800 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none"
            />
            <div className="flex flex-row gap-x-2">
              <button
                type="button"
                disabled={submitting || name.trim().length < 2}
                onClick={submit}
                className="dark:bg-polar-50 rounded-full bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40 dark:text-gray-900"
              >
                {submitting ? 'Création…' : 'Créer le dossier'}
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="dark:text-polar-500 px-4 py-2 text-sm text-gray-500"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <p className="dark:text-polar-500 text-sm text-gray-500">
            Chargement…
          </p>
        ) : dossiers.length === 0 ? (
          <div className="dark:border-polar-700 flex flex-col items-center gap-y-2 rounded-2xl border border-dashed border-gray-200 p-10 text-center">
            <FolderOutlined
              fontSize="large"
              className="dark:text-polar-600 text-gray-300"
            />
            <p className="dark:text-polar-500 text-sm text-gray-500">
              Aucun dossier pour l&apos;instant. Créez-en un pour y réunir les
              pièces d&apos;une affaire et les questions qu&apos;elle pose.
            </p>
          </div>
        ) : (
          <div className="dark:divide-polar-700 dark:border-polar-700 divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200">
            {dossiers.map((dossier) => (
              <Link
                key={dossier.id}
                href={`/dashboard/${organization}/dossiers/${dossier.id}`}
                className="dark:hover:bg-polar-800 flex flex-row items-center justify-between gap-x-4 px-5 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm">{dossier.name}</span>
                  {dossier.client_name && (
                    <span className="dark:text-polar-500 truncate text-xs text-gray-500">
                      {dossier.client_name}
                    </span>
                  )}
                </div>
                <div className="dark:text-polar-500 flex shrink-0 flex-row items-center gap-x-4 text-xs text-gray-500">
                  <span className="flex flex-row items-center gap-x-1">
                    <DescriptionOutlined fontSize="inherit" />
                    {dossier.document_count} pièce
                    {dossier.document_count > 1 ? 's' : ''}
                  </span>
                  <span className="flex flex-row items-center gap-x-1">
                    <PeopleOutlined fontSize="inherit" />
                    {dossier.member_count} avocat
                    {dossier.member_count > 1 ? 's' : ''}
                  </span>
                  <span
                    className={twMerge(
                      'rounded-full px-2 py-0.5',
                      dossier.status === 'open'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'dark:bg-polar-700 bg-gray-100',
                    )}
                  >
                    {STATUS_LABELS[dossier.status]}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardBody>
  )
}

export default DossiersPage
